"""Resumable, chunked reader for Google's public Quick, Draw! bitmap objects.

This module is intended for a Google Colab runtime, not the SketchAI repository
workspace. It reads official per-category ``.npy`` files with HTTP byte ranges,
converts one bounded chunk at a time to SketchAI's inference geometry, and writes
an on-disk memory-mapped cache. It never downloads a complete object into RAM and
never stores the source files separately from the processed cache.

The cache is local to the cloud runtime (normally ``/content``); it is not
checked into Git or copied to this repository. Partial category downloads resume
from the last flushed row after an interrupted Colab session, if that runtime's
scratch disk is still present.
"""
from __future__ import annotations

import io
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Callable

import numpy as np

try:  # normal script import and package-style tests are both supported
    import quickdraw_ndjson
except ImportError:  # pragma: no cover - package-style import
    from . import quickdraw_ndjson

GCS_BASE_URL = "https://storage.googleapis.com/quickdraw_dataset/full/numpy_bitmap/"
PIXELS_PER_IMAGE = 28 * 28
USER_AGENT = "SketchAI-QuickDraw-CloudTrainer/1.0 (CC BY 4.0 dataset reader)"


class GCSRangeError(RuntimeError):
    """The public GCS object did not honor or validate a requested byte range."""


def category_url(label: str) -> str:
    """Official object URL; encode the canonical label as a single path segment."""
    return GCS_BASE_URL + urllib.parse.quote(label, safe="") + ".npy"


def _read_range(url: str, start: int, end: int, *, timeout: int = 120,
                opener: Callable = urllib.request.urlopen) -> tuple[bytes, int]:
    """Read one inclusive byte range and return (payload, total object size).

    Refuse a server response that ignores ``Range``: silently accepting a 200
    could transfer a complete 100 MB object when only a few MB were requested.
    """
    if start < 0 or end < start:
        raise ValueError(f"invalid HTTP range {start}-{end}")
    request = urllib.request.Request(
        url,
        headers={
            "Range": f"bytes={start}-{end}",
            "Accept-Encoding": "identity",
            "User-Agent": USER_AGENT,
        },
    )
    last_error = None
    for attempt in range(4):
        try:
            with opener(request, timeout=timeout) as response:
                status = getattr(response, "status", response.getcode())
                content_range = response.headers.get("Content-Range", "")
                match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", content_range)
                if status != 206 or not match:
                    raise GCSRangeError(
                        f"{url}: expected HTTP 206 with Content-Range, got "
                        f"{status} {content_range!r}; no full-object fallback is allowed"
                    )
                got_start, got_end, total = map(int, match.groups())
                if got_start != start or got_end > end or got_end < got_start:
                    raise GCSRangeError(
                        f"{url}: server returned unexpected range {content_range!r}"
                    )
                payload = response.read()
                if len(payload) != got_end - got_start + 1:
                    raise GCSRangeError(
                        f"{url}: range body length {len(payload)} does not match "
                        f"Content-Range {content_range!r}"
                    )
                return payload, total
        except GCSRangeError:
            raise
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last_error = error
            if attempt == 3:
                break
            time.sleep(min(2 ** attempt, 8))
    raise RuntimeError(f"GCS range request failed for {url} bytes={start}-{end}: {last_error}")


def read_npy_header(url: str, *, opener: Callable = urllib.request.urlopen) -> dict:
    """Inspect an uncompressed Quick, Draw! NPY without fetching its bitmap body."""
    header_bytes, total_bytes = _read_range(url, 0, 65535, opener=opener)
    stream = io.BytesIO(header_bytes)
    try:
        version = np.lib.format.read_magic(stream)
        if version == (1, 0):
            shape, fortran_order, dtype = np.lib.format.read_array_header_1_0(stream)
        elif version in ((2, 0), (3, 0)):
            shape, fortran_order, dtype = np.lib.format.read_array_header_2_0(stream)
        else:
            raise ValueError(f"unsupported NPY format version {version}")
    except Exception as error:
        raise ValueError(f"Could not parse NPY header from {url}: {error}") from error

    shape = tuple(int(dimension) for dimension in shape)
    if len(shape) == 2 and shape[1] == PIXELS_PER_IMAGE:
        rows = shape[0]
    elif len(shape) == 3 and shape[1:] == (28, 28):
        rows = shape[0]
    else:
        raise ValueError(f"{url}: expected (N, 784) or (N, 28, 28), got {shape}")
    if np.dtype(dtype) != np.dtype(np.uint8):
        raise ValueError(f"{url}: expected uint8 NPY bitmap values, got {dtype}")
    if fortran_order:
        raise ValueError(f"{url}: Fortran-ordered bitmap arrays are not supported")

    data_offset = stream.tell()
    expected_bytes = data_offset + rows * PIXELS_PER_IMAGE
    if expected_bytes != total_bytes:
        raise ValueError(
            f"{url}: NPY header describes {expected_bytes:,} bytes but GCS reports "
            f"{total_bytes:,}; refusing a truncated or unexpected object"
        )
    return {
        "url": url,
        "version": list(version),
        "shape": list(shape),
        "rows": rows,
        "dtype": "uint8",
        "data_offset": data_offset,
        "bytes": total_bytes,
    }


def inspect_categories(categories: list[str], logger=print) -> dict:
    """Check every canonical object by a tiny range read and total its byte size."""
    objects = {}
    for index, label in enumerate(categories, 1):
        header = read_npy_header(category_url(label))
        objects[label] = header
        if index % 25 == 0 or index == len(categories):
            logger(f"  inspected {index}/{len(categories)} objects")
    return {
        "categories": len(objects),
        "rows": sum(item["rows"] for item in objects.values()),
        "bytes": sum(item["bytes"] for item in objects.values()),
        "objects": objects,
    }


def _atomic_json(path: Path, data: dict) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def cache_category(label: str, cache_dir: Path, *, chunk_rows: int = 4096,
                   row_limit: int | None = None, logger=print,
                   opener: Callable = urllib.request.urlopen) -> dict:
    """Range-download and preprocess one category, with chunk-level resume.

    Only the processed ``uint8`` NPY is kept on disk. During transfer, peak
    working memory is bounded by one response chunk plus its float32 transform.
    Set ``row_limit`` only for an explicit plumbing smoke test; production full
    runs should leave it as ``None``.
    """
    if chunk_rows < 1:
        raise ValueError("chunk_rows must be positive")
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    safe_name = "".join(ch if ch.isalnum() else "_" for ch in label).strip("_").lower()
    target = cache_dir / f"{safe_name}.npy"
    partial = cache_dir / f"{safe_name}.npy.partial"
    progress_path = cache_dir / f"{safe_name}.progress.json"
    url = category_url(label)
    header = read_npy_header(url, opener=opener)
    total_rows = header["rows"]
    rows = min(total_rows, row_limit) if row_limit is not None else total_rows

    if target.exists():
        try:
            existing = np.load(target, mmap_mode="r")
            if existing.shape == (rows, PIXELS_PER_IMAGE) and existing.dtype == np.uint8:
                return {"label": label, "rows": rows, "bytes": header["bytes"], "cached": True}
        except Exception:
            pass
        target.unlink()

    start_row = 0
    progress = None
    if partial.exists() and progress_path.exists():
        try:
            progress = json.loads(progress_path.read_text(encoding="utf-8"))
            candidate = np.load(partial, mmap_mode="r")
            if (progress.get("url") == url and progress.get("rows") == rows
                    and candidate.shape == (rows, PIXELS_PER_IMAGE)
                    and candidate.dtype == np.uint8):
                start_row = min(int(progress.get("completed_rows", 0)), rows)
            else:
                progress = None
        except Exception:
            progress = None
    if progress is None:
        partial.unlink(missing_ok=True)
        progress_path.unlink(missing_ok=True)
        start_row = 0
        mapped = np.lib.format.open_memmap(
            partial, mode="w+", dtype=np.uint8, shape=(rows, PIXELS_PER_IMAGE)
        )
    else:
        mapped = np.lib.format.open_memmap(partial, mode="r+")

    for first in range(start_row, rows, chunk_rows):
        count = min(chunk_rows, rows - first)
        byte_start = header["data_offset"] + first * PIXELS_PER_IMAGE
        byte_end = byte_start + count * PIXELS_PER_IMAGE - 1
        payload, object_size = _read_range(url, byte_start, byte_end, opener=opener)
        if object_size != header["bytes"] or len(payload) != count * PIXELS_PER_IMAGE:
            raise GCSRangeError(f"{url}: object changed or returned a short bitmap chunk")
        images = np.frombuffer(payload, dtype=np.uint8).reshape(count, 28, 28)
        normalized = quickdraw_ndjson.to_app_geometry(images.astype(np.float32) / 255.0)
        mapped[first:first + count] = np.rint(normalized * 255.0).clip(0, 255).astype(np.uint8).reshape(count, PIXELS_PER_IMAGE)
        mapped.flush()
        completed = first + count
        _atomic_json(progress_path, {
            "url": url,
            "rows": rows,
            "source_rows": total_rows,
            "completed_rows": completed,
            "chunk_rows": chunk_rows,
        })
        if completed == rows or completed % max(chunk_rows * 20, chunk_rows) == 0:
            logger(f"  {label}: {completed:,}/{rows:,} rows")

    mapped.flush()
    del mapped
    os.replace(partial, target)
    progress_path.unlink(missing_ok=True)
    return {"label": label, "rows": rows, "bytes": header["bytes"], "cached": False}


def prepare_full_cache(categories: list[str], cache_dir: Path, *, chunk_rows: int = 4096,
                       row_limit: int | None = None, logger=print) -> dict:
    """Prepare one category at a time and persist a resumable cloud-cache manifest."""
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = cache_dir / "manifest.json"
    manifest = {
        "dataset": (
            "Google Quick, Draw! sampled numpy_bitmap"
            if row_limit is not None
            else "Google Quick, Draw! full numpy_bitmap"
        ),
        "source_url": "https://github.com/googlecreativelab/quickdraw-dataset",
        "access": GCS_BASE_URL,
        "license": "CC BY 4.0, Google, Inc.",
        "chunk_rows": chunk_rows,
        "row_limit": row_limit,
        "categories": {},
    }
    started = time.time()
    for index, label in enumerate(categories, 1):
        result = cache_category(
            label, cache_dir, chunk_rows=chunk_rows, row_limit=row_limit, logger=logger,
        )
        manifest["categories"][label] = result
        _atomic_json(manifest_path, manifest)
        if index % 10 == 0 or index == len(categories):
            logger(f"  prepared {index}/{len(categories)} categories; "
                   f"{time.time() - started:.0f}s elapsed")
    manifest["total_rows"] = sum(item["rows"] for item in manifest["categories"].values())
    _atomic_json(manifest_path, manifest)
    return manifest
