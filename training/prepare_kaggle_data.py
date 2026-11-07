#!/usr/bin/env python3
"""Turn a Kaggle-hosted Quick, Draw! dataset into the files `train_345.py` reads.

    python training/prepare_kaggle_data.py --source /kaggle/input/quickdraw-ndjson
    python training/prepare_kaggle_data.py --source /kaggle/input/quickdraw-ndjson \
        --per-class 5000

Why this exists
---------------
`quickdraw_ndjson.py` was written against the `quickdraw.js` npm mirror, which
ships **pre-rasterised** 28x28 bitmaps: one JSON array of 784 floats per line,
one gzipped file per category, named `<category>.ndjson.gz`. Google's own
downloads -- and every Kaggle mirror of them -- do not look like that:

| What people actually upload          | What a line looks like                                  |
| ------------------------------------ | ------------------------------------------------------- |
| Google `raw/` or `simplified/` NDJSON | `{"word": "cat", "drawing": [[x...], [y...]], ...}`      |
| Kaggle competition CSV               | `countrycode,drawing,recognized,timestamp,word` (784 ints) |
| `quickdraw.js` mirror                | `[0.0, 0.0, 0.31, ...]` (784 floats)                     |

Only the third is readable by the pipeline. Point `--source` at either of the
other two and you get `BadGzipFile` or `expected 784 values, got 5` ten seconds
into training. This script converts all three into the one shape the loader
wants, so `train_345.py` stays untouched.

What it writes
--------------
`<dest>/<category>.ndjson.gz`, one line per drawing, each line a JSON array of
784 floats in 0..1 (white ink on black, edge-to-edge, 28x28, row-major). That is
the mirror's contract exactly -- and `to_app_geometry()` in `quickdraw_ndjson.py`
still re-crops and re-pads every frame into the browser's geometry at load time,
so training and inference keep seeing the same thing.

Stroke vector -> bitmap
-----------------------
Google's NDJSON holds strokes, not pixels, so they are rasterised here: lines
are sampled 4 times per pixel and splatted with bilinear weights onto a 28x28
canvas. That is a close match to the Xiaolin-Wu pass the npm mirror used, and it
deliberately produces the same ~1 px strokes -- `thickness_augment` in the
training pipeline is what makes the model cope with a real 0.3-0.6 px browser
pen, so the source renderer must not pre-empt it.

Kaggle specifics
----------------
`/kaggle/input` is read-only, so `--dest` must point into `/kaggle/working`
(the default is inside the cloned repo, which lives there). The full corpus is
~100 GB and a notebook has ~20 GB of working disk, so `--per-class` caps how
many drawings are written per category; the first N *recognised* drawings are
kept, in file order, which keeps runs reproducible.

Nothing here invents data and nothing is sampled from a model: every bitmap is
either read from the source or rasterised from the source's own strokes.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import math
import sys
from pathlib import Path
from typing import Iterator

import numpy as np

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent
CATEGORY_FILE = REPO_ROOT / "src" / "data" / "quickdraw-categories.txt"
DEFAULT_DEST = HERE / "quickdraw-source" / "drawings"

INPUT_SIZE = 28
PIXELS = INPUT_SIZE * INPUT_SIZE
COORD_SCALE = 256.0          # Quick, Draw! coordinates run 0..255
SAMPLES_PER_PIXEL = 4        # antialiasing density when rasterising a stroke
INK_THRESHOLD = 10 / 255.0   # same ink cut-off the browser pipeline uses
SOURCES = (".ndjson", ".ndjson.gz", ".csv")


# --------------------------------------------------------------------------------------
# Category names
# --------------------------------------------------------------------------------------


def canonical_categories() -> list[str]:
    """The 345 official names, in the order the model must output."""
    return [
        line.strip()
        for line in CATEGORY_FILE.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def match_key(name: str) -> str:
    """Fold a file stem or CSV label onto a comparable key.

    Mirrors disagree about separators (`aircraft_carrier.ndjson` vs
    `aircraft carrier.ndjson`), so underscores become spaces and case is folded.
    Hyphens are *kept* here: `t-shirt` and `t shirt` are different strings, and
    silently merging them could shift a label. `category_index()` registers the
    hyphen variant as an alias instead, so both spellings reach the same class.
    """
    return " ".join(name.replace("_", " ").lower().split())


def category_index(names: list[str]) -> dict[str, str]:
    """Lookup from any accepted spelling of a category to its canonical name."""
    index: dict[str, str] = {}
    for name in names:
        index.setdefault(match_key(name), name)
        # `t-shirt` and `teddy-bear` are the only hyphenated official names; a
        # mirror that wrote `t_shirt.ndjson` should still land on `t-shirt`.
        index.setdefault(match_key(name.replace("-", " ")), name)
    return index


# --------------------------------------------------------------------------------------
# Stroke vector -> 28x28 bitmap
# --------------------------------------------------------------------------------------


def _splat(canvas: np.ndarray, xs: np.ndarray, ys: np.ndarray, amount: float) -> None:
    """Add `amount` of ink at each (x, y), split bilinearly over four pixels."""
    size = canvas.shape[0]
    inside = (xs >= 0) & (xs <= size - 1) & (ys >= 0) & (ys <= size - 1)
    if not inside.any():
        return
    x = xs[inside]
    y = ys[inside]
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    fx = x - x0
    fy = y - y0
    for dx, dy, weight in (
        (0, 0, (1.0 - fx) * (1.0 - fy)),
        (1, 0, fx * (1.0 - fy)),
        (0, 1, (1.0 - fx) * fy),
        (1, 1, fx * fy),
    ):
        xx = np.clip(x0 + dx, 0, size - 1)
        yy = np.clip(y0 + dy, 0, size - 1)
        np.add.at(canvas, (yy, xx), (weight * amount).astype(np.float32))


def rasterise_strokes(
    strokes: list[list[list[float]]],
    size: int = INPUT_SIZE,
    samples_per_pixel: int = SAMPLES_PER_PIXEL,
    coord_scale: float = COORD_SCALE,
) -> np.ndarray:
    """Draw Quick, Draw! strokes (`[[xs], [ys]]` per stroke) onto a 0..1 canvas.

    Coordinates are scaled so the 0..255 drawing box fills the frame exactly,
    which is the same edge-to-edge convention the mirror used. Padding it into
    the app's 1.186x crop is `to_app_geometry()`'s job, not this function's.
    """
    canvas = np.zeros((size, size), dtype=np.float32)
    scale = size / coord_scale

    for stroke in strokes:
        if not isinstance(stroke, (list, tuple)) or len(stroke) != 2:
            continue
        xs = np.asarray(stroke[0], dtype=np.float64)
        ys = np.asarray(stroke[1], dtype=np.float64)
        # A stroke must be [[xs], [ys]]. Hand-edited or half-downloaded files
        # sometimes carry [x, y] instead; skipping it beats crashing the run.
        if xs.ndim != 1 or ys.ndim != 1 or xs.size == 0 or ys.size == 0:
            continue
        xs = xs[: ys.size] * scale
        ys = ys[: xs.size] * scale

        if xs.size == 1:
            _splat(canvas, xs, ys, 1.0)
            continue

        for index in range(xs.size - 1):
            x0, y0 = xs[index], ys[index]
            x1, y1 = xs[index + 1], ys[index + 1]
            length = math.hypot(x1 - x0, y1 - y0)
            steps = max(1, int(math.ceil(length * samples_per_pixel)))
            t = np.arange(steps + 1, dtype=np.float64) / steps
            _splat(
                canvas,
                x0 + (x1 - x0) * t,
                y0 + (y1 - y0) * t,
                1.0 / samples_per_pixel,
            )

    np.clip(canvas, 0.0, 1.0, out=canvas)
    return canvas


# --------------------------------------------------------------------------------------
# Reading the three source shapes
# --------------------------------------------------------------------------------------


def open_text(path: Path):
    """Open plain or gzipped text by suffix, not by guessing."""
    if path.name.endswith(".gz"):
        return gzip.open(path, "rt", encoding="utf-8", errors="replace")
    return path.open("r", encoding="utf-8", errors="replace")


def first_record(path: Path) -> str:
    """Classify the file by the first real record: `[` = bitmaps, `{` = strokes.

    The first line is not trusted on its own. Datasets assembled by hand pick up
    a header, a comment or a stray blank line, and refusing the whole file over
    one of those would look like a corrupt download.
    """
    if path.suffix == ".csv":
        return "csv"
    with open_text(path) as handle:
        for index, line in enumerate(handle):
            if index > 200:
                break
            line = line.strip()
            if not line:
                continue
            if line[0] == "[":
                return "bitmap"
            if line[0] == "{":
                return "stroke"
    return "empty"


def normalise_bitmap(values) -> np.ndarray | None:
    """784 values of unknown scale -> float32 (28, 28) in 0..1."""
    try:
        array = np.asarray(values, dtype=np.float32).ravel()
    except (TypeError, ValueError):
        return None  # a JSON string, an object, or text where numbers belong
    if array.size != PIXELS or not np.isfinite(array).all():
        return None
    if float(array.max(initial=0.0)) > 1.5:
        array = array / 255.0
    return np.clip(array, 0.0, 1.0).reshape(INPUT_SIZE, INPUT_SIZE)


def stroke_images(record: dict, keep_unrecognised: bool):
    """One NDJSON line -> a bitmap, unless the drawing is unusable."""
    if not keep_unrecognised and record.get("recognized") is False:
        return None
    drawing = record.get("drawing")
    if not isinstance(drawing, list) or not drawing:
        return None
    return rasterise_strokes(drawing)


def bitmap_rows(path: Path, keep_unrecognised: bool) -> Iterator[tuple[str | None, np.ndarray]]:
    """Yield `(word, bitmap)` for a stroke or bitmap NDJSON file."""
    with open_text(path) as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue

            if isinstance(record, dict):
                if not keep_unrecognised and record.get("recognized") is False:
                    continue
                image = stroke_images(record, keep_unrecognised)
                word = record.get("word")
                if image is not None:
                    yield (str(word).lower() if word else None), image
                continue

            image = normalise_bitmap(record)
            if image is not None:
                yield None, image


def csv_rows(path: Path, keep_unrecognised: bool) -> Iterator[tuple[str, np.ndarray]]:
    """The Kaggle competition CSV: `word` + space-separated 784-pixel `drawing`."""
    with path.open("r", encoding="utf-8", errors="replace", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if not keep_unrecognised and str(row.get("recognized", "1")).strip() in {"0", "False", "false"}:
                continue
            word = (row.get("word") or "").strip()
            raw = (row.get("drawing") or "").strip()
            if not word or not raw:
                continue
            parts = raw.replace(",", " ").split()
            image = normalise_bitmap(parts)
            if image is not None:
                yield word.lower(), image


# --------------------------------------------------------------------------------------
# Writing the loader's format
# --------------------------------------------------------------------------------------


def encode_block(images: np.ndarray) -> str:
    """Bitmaps as mirror-format lines: `[0.000,0.000,0.004,...]` each.

    `np.savetxt` formats a whole block at C speed; doing 784 `"{:.3f}".format`
    calls per drawing dominated the runtime (~482 us/row versus ~143 us/row), and
    a full 345 x 5000 run is 1.7M drawings.
    """
    flat = np.clip(images.reshape(len(images), -1).astype(np.float32), 0.0, 1.0)
    buffer = io.StringIO()
    np.savetxt(buffer, flat, fmt="%.3f", delimiter=",")
    body = buffer.getvalue().rstrip("\n")
    return "[" + body.replace("\n", "]\n[").rstrip() + "]\n"


class CategoryWriter:
    """One gzipped NDJSON per category, capped, in the loader's naming scheme."""

    FLUSH_ROWS = 256

    def __init__(self, dest: Path, per_class: int):
        self.dest = dest
        self.per_class = per_class
        self.handles: dict[str, object] = {}
        self.counts: dict[str, int] = {}
        self.pending: dict[str, list[np.ndarray]] = {}
        self.dropped = 0
        self.unlabelled = 0

    def wants(self, category: str) -> bool:
        return not self.per_class or self.counts.get(category, 0) < self.per_class

    def add(self, category: str, image: np.ndarray | None) -> None:
        if image is None or not (image > INK_THRESHOLD).any():
            self.dropped += 1  # a blank frame teaches the model nothing
            return
        if not self.wants(category):
            return
        if category not in self.handles:
            self.dest.mkdir(parents=True, exist_ok=True)
            self.handles[category] = gzip.open(
                self.dest / f"{category}.ndjson.gz", "wt", encoding="utf-8"
            )
        pending = self.pending.setdefault(category, [])
        pending.append(image)
        self.counts[category] = self.counts.get(category, 0) + 1
        if len(pending) >= self.FLUSH_ROWS:
            self._flush(category)

    def _flush(self, category: str) -> None:
        pending = self.pending.get(category)
        if not pending:
            return
        self.handles[category].write(encode_block(np.stack(pending)))
        pending.clear()

    def close(self) -> None:
        for category in list(self.pending):
            self._flush(category)
        for handle in self.handles.values():
            handle.close()
        self.handles.clear()

    def bytes_written(self) -> int:
        return sum(
            (self.dest / f"{category}.ndjson.gz").stat().st_size
            for category in self.counts
        )


# --------------------------------------------------------------------------------------
# Driver
# --------------------------------------------------------------------------------------


def find_sources(source: Path) -> list[Path]:
    files = []
    for path in sorted(source.rglob("*")):
        if path.is_file() and path.name.endswith(SOURCES):
            files.append(path)
    return files


def prepare(args: argparse.Namespace) -> int:
    canonical = canonical_categories()
    if args.categories:
        canonical = canonical[: args.categories]
    known = category_index(canonical)

    files = find_sources(args.source)
    if not files:
        print(f"✖ no .ndjson, .ndjson.gz or .csv files under {args.source}")
        return 1

    kinds: dict[str, int] = {}
    writer = CategoryWriter(args.dest, args.per_class)
    unknown: list[str] = []
    print(f"Reading {len(files)} file(s) from {args.source}")
    print(f"Writing into {args.dest}  (cap: "
          f"{args.per_class or 'no'} per class)\n")

    try:
        for path in files:
            kind = first_record(path)
            kinds[kind] = kinds.get(kind, 0) + 1
            stem = path.name
            for suffix in SOURCES:
                if stem.endswith(suffix):
                    stem = stem[: -len(suffix)]
                    break

            if kind == "csv":
                # One CSV holds every class, so the label comes from each row.
                for word, image in csv_rows(path, args.keep_unrecognised):
                    category = known.get(match_key(word))
                    if category is None:
                        writer.unlabelled += 1
                        continue
                    if writer.wants(category):
                        writer.add(category, image)
                print(f"  csv    {path.name}")
                continue

            category = known.get(match_key(stem))
            if category is None:
                if stem not in unknown:
                    unknown.append(stem)
                print(f"  skip   {path.name}  (not one of the 345 official categories)")
                continue

            if kind not in {"stroke", "bitmap"}:
                print(f"  skip   {path.name}  (unrecognised contents)")
                continue

            before = writer.counts.get(category, 0)
            for word, image in bitmap_rows(path, args.keep_unrecognised):
                if not writer.wants(category):
                    break
                writer.add(category, image)
                if word is not None and word and match_key(word) != match_key(category):
                    # A mislabelled row would silently poison one class; trust the
                    # filename over the row and count it so the mismatch is visible.
                    writer.unlabelled += 1
            written = writer.counts.get(category, 0) - before
            print(f"  {kind:<6} {path.name}  →  {category}  ({written} drawings)")
    finally:
        writer.close()

    # ---------------------------------------------------------------- summary
    print()
    if writer.dropped:
        print(f"Dropped {writer.dropped:,} unusable drawing(s) "
              f"(blank frames or unaccepted sketches).")
    if writer.unlabelled:
        print(f"Ignored {writer.unlabelled:,} row(s) whose label is not one of the 345 categories.")
    if unknown:
        preview = ", ".join(unknown[:5]) + (" …" if len(unknown) > 5 else "")
        print(f"Skipped {len(unknown)} file(s) with unknown category names: {preview}")

    total = sum(writer.counts.values())
    if total == 0:
        print("\n✖ nothing was written. Check --source and the category names.")
        return 1

    print(f"\n✔ {total:,} drawings across {len(writer.counts)} categories · "
          f"{writer.bytes_written() / 1e6:.1f} MB on disk")
    print(f"  {args.dest}")

    missing = [name for name in canonical if name not in writer.counts]
    if missing:
        print(f"\n! {len(missing)} category/ies have no data: "
              f"{', '.join(missing[:6])}{' …' if len(missing) > 6 else ''}")
        print("  train_345.py will fail on the first missing class, so either add the")
        print("  files or run with --categories to train on a prefix of the list.")

    if not args.no_verify:
        verify(args.dest, writer.counts)

    print("\nNext:")
    print(f"  python training/train_345.py --samples-per-class {args.per_class or 5000}")
    return 0


def verify(dest: Path, counts: dict[str, int]) -> None:
    """Read one file back through the real loader -- the only check that counts.

    This calls `load_class_samples()`, the exact function `train_345.py` calls,
    so a passing verification means the training run will get past its first
    batch rather than failing ten seconds in with a 784-value mismatch.
    """
    sys.path.insert(0, str(HERE))
    import quickdraw_ndjson  # noqa: PLC0415  (kept local: the loader is optional here)

    name = sorted(counts)[0]
    flat, available = quickdraw_ndjson.load_class_samples(name, 4, source_dir=dest)
    if flat.ndim != 2 or flat.shape[1] != PIXELS:
        raise SystemExit(f"✖ {name}: loader returned shape {flat.shape}, expected (n, 784)")
    frames = flat.astype(np.float32).reshape(-1, INPUT_SIZE, INPUT_SIZE) / 255.0
    print(f"\nVerification — {name}, read back through quickdraw_ndjson.load_class_samples()")
    print(f"  {available} drawing(s) in the file, first {len(frames)} as the network sees them "
          f"(app geometry, ink peak normalised)")
    ramp = " .:-=+*#@"
    for row in frames[0]:
        print("   |" + "".join(ramp[min(len(ramp) - 1, int(value * (len(ramp) - 1)))] for value in row) + "|")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Convert Kaggle Quick, Draw! data into training/quickdraw-source/drawings/"
    )
    parser.add_argument("--source", type=Path, required=True,
                        help="directory of .ndjson / .ndjson.gz / .csv files (e.g. /kaggle/input/<dataset>)")
    parser.add_argument("--dest", type=Path, default=DEFAULT_DEST,
                        help="where the <category>.ndjson.gz files go (must be writable)")
    parser.add_argument("--per-class", type=int, default=2000,
                        help="max drawings per category (0 = everything; watch disk space)")
    parser.add_argument("--categories", type=int, default=0,
                        help="limit to the first N categories of the official list (debug)")
    parser.add_argument("--keep-unrecognised", action="store_true",
                        help="keep drawings Google's recogniser did not accept (noisier labels)")
    parser.add_argument("--no-verify", action="store_true",
                        help="skip reading a file back through the training loader")
    args = parser.parse_args(argv)

    if not args.source.exists():
        print(f"✖ no such directory: {args.source}")
        return 1
    return prepare(args)


if __name__ == "__main__":
    raise SystemExit(main())
