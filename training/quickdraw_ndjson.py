"""Loader for the real Google Quick, Draw! bitmaps shipped by the `quickdraw.js`
npm package (CC BY 4.0, data © Google, Inc.).

Why this source
---------------
The canonical Quick, Draw! mirror -- Google Cloud Storage
(`storage.googleapis.com/quickdraw_dataset/...`) -- and Hugging Face
(`huggingface.co/datasets/google/quickdraw`) are both unreachable from this
sandbox (TLS connections are dropped). The `quickdraw.js` npm package is a
redistribution of the *same* official data: 345 gzipped NDJSON files, one per
category, whose names match SketchAI's canonical category list exactly.

Its own LICENSE file states:

    This data made available by Google, Inc. under the Creative Commons
    Attribution 4.0 International license.
    https://creativecommons.org/licenses/by/4.0/

so the provenance and licence are the official ones.

What the files contain
----------------------
Each line is a JSON array of 784 floats in 0..1 -- already a rasterised 28x28
greyscale bitmap (the package drew the vector strokes itself with a Xiaolin-Wu
style antialiasing pass at `x * 28 / 256`). So these are *not* stroke vectors;
no rasterisation is required. What they are *not* is a match for SketchAI's
input geometry, and that is the one thing this module fixes.

The geometry fix (important, and documented rather than silent)
---------------------------------------------------------------
The upstream package scales strokes by `size / 256` with no padding, so every
drawing is stretched edge to edge: measured over 4,000 random samples, **100%**
of them touch the frame border, with an ink bounding box of ~23 x ~25 px.

SketchAI's browser pipeline does the opposite. `src/ai/preprocess.js` finds the
ink bounding box, takes a square `max(w, h) * CROP_PADDING` (1.186) around its
centre, area-averages that into 28x28, then rescales intensities until the 97th
percentile of ink reaches 1.0. The drawing therefore occupies 28 / 1.186 = 23.6
px and never touches the border.

Training on edge-to-edge bitmaps while classifying padded ones would be a
straight train/serve mismatch. So `to_app_geometry()` below replays the app's
own pipeline over each bitmap -- same threshold, same padding, same area
averaging, same ink-peak normalisation -- before it is handed to the network.
The output convention matches the model's contract: white ink on a black
background, float 0..1 (stored as uint8 0..255), shape (rows, 784).
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path

import numpy as np

# --- geometry constants, mirrored from src/ai/preprocess.js -------------------
INPUT_SIZE = 28
CROP_PADDING = 1.186
INK_ALPHA_THRESHOLD = 10  # out of 255, as used by the browser pipeline
TARGET_INK_PEAK = 1.0  # the "345" profile
MIN_CONTRAST_GAMMA = 0.25

_THRESHOLD = INK_ALPHA_THRESHOLD / 255.0
_PIXELS = INPUT_SIZE * INPUT_SIZE


def default_source_dir() -> Path:
    """Where `scripts/fetch_quickdraw_data.py` puts the NDJSON files."""
    return Path(__file__).resolve().parent / "quickdraw-source" / "drawings"


def source_file(name: str, source_dir: Path | None = None) -> Path:
    return (source_dir or default_source_dir()) / f"{name}.ndjson.gz"


def _area_average_weights(start: np.ndarray, stop: np.ndarray, size: int) -> np.ndarray:
    """Overlap of each output cell `[start, stop)` with each source pixel.

    Returns a (size, size) matrix so the resample is two matmuls:
    `W @ image @ W.T`. Each row sums to `stop - start`, i.e. the output cell's
    width in source pixels, which is what makes this an area average (the same
    thing the browser does when it squashes a large canvas into 28x28).
    """
    edges = np.arange(size)
    upper = np.minimum(stop[:, None], edges[None, :] + 1)
    lower = np.maximum(start[:, None], edges[None, :])
    return np.clip(upper - lower, 0.0, None)


def to_app_geometry(
    images: np.ndarray,
    size: int = INPUT_SIZE,
    padding: float = CROP_PADDING,
    target_ink_peak: float = TARGET_INK_PEAK,
    min_gamma: float = MIN_CONTRAST_GAMMA,
) -> np.ndarray:
    """Replay SketchAI's browser preprocessing over a stack of 28x28 bitmaps.

    `images` is float (n, 28, 28) in 0..1. Returns float (n, 28, 28) in 0..1.
    """
    out = np.zeros_like(images, dtype=np.float32)
    grid = np.arange(size, dtype=np.float64)

    for index, image in enumerate(images):
        mask = image > _THRESHOLD
        if not mask.any():
            continue  # leave a blank frame rather than inventing content

        rows = np.flatnonzero(mask.any(axis=1))
        cols = np.flatnonzero(mask.any(axis=0))
        top, bottom = rows[0], rows[-1]
        left, right = cols[0], cols[-1]
        height = bottom - top + 1
        width = right - left + 1

        side = max(height, width) * padding
        origin_y = top + height / 2.0 - side / 2.0
        origin_x = left + width / 2.0 - side / 2.0

        step = side / size
        start_y = origin_y + grid * step
        start_x = origin_x + grid * step
        weight_y = _area_average_weights(start_y, start_y + step, size)
        weight_x = _area_average_weights(start_x, start_x + step, size)

        resampled = weight_y @ image.astype(np.float64) @ weight_x.T
        resampled /= step * step  # area average, so ink mass is preserved
        np.clip(resampled, 0.0, 1.0, out=resampled)

        # `normaliseInkPeak` from preprocess.js: lift the 97th percentile of ink
        # to `target`, but never with a gamma below `min_gamma`.
        peak = float(np.percentile(resampled, 97))
        if 0.0 < peak < target_ink_peak:
            gamma = min(1.0, max(min_gamma, np.log(target_ink_peak) / np.log(peak)))
            if gamma < 1.0:
                resampled = np.power(resampled, gamma)

        out[index] = resampled

    return out


def read_category(
    name: str,
    limit: int = 0,
    source_dir: Path | None = None,
) -> np.ndarray:
    """Read one category as float (n, 28, 28) in 0..1, straight from the NDJSON.

    `limit` of 0 means "everything in the file".
    """
    path = source_file(name, source_dir)
    if not path.exists():
        raise FileNotFoundError(f"no Quick, Draw! source file for {name!r}: {path}")

    frames = []
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            values = json.loads(line)
            if len(values) != _PIXELS:
                raise ValueError(f"{name}: expected {_PIXELS} values, got {len(values)}")
            frames.append(values)
            if limit and len(frames) >= limit:
                break
    return np.asarray(frames, dtype=np.float32).reshape(-1, INPUT_SIZE, INPUT_SIZE)


def available_samples(name: str, source_dir: Path | None = None) -> int:
    """How many drawings the source file actually holds (cached per path)."""
    path = source_file(name, source_dir)
    if not path.exists():
        return 0
    count = 0
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                count += 1
    return count


def load_class_samples(
    name: str,
    rows: int,
    source_dir: Path | None = None,
) -> tuple[np.ndarray, int]:
    """Category samples as uint8 (n, 784), normalised into the app's geometry.

    Returns `(array, available)`; `array` may be shorter than `rows` when the
    source holds fewer drawings than were asked for.
    """
    images = read_category(name, limit=0, source_dir=source_dir)
    if images.shape[0] > rows:
        images = images[:rows]
    images = to_app_geometry(images)
    flat = (images * 255.0).round().astype(np.uint8).reshape(images.shape[0], _PIXELS)
    return flat, int(images.shape[0])
