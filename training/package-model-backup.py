#!/usr/bin/env python3
"""Package the 345-class model into durable backup archives.

    python training/package-model-backup.py

Produces, in training/backup/:

    SketchAI-345-Production-Model.zip      everything the app needs to run
    SketchAI-345-Training-Checkpoint.zip   the Keras/H5 weights + training history
    SHA256SUMS.txt                         checksums for both

Why this exists: generated files (public/model-345/, training/export/,
training/work/) are gitignored, and a workspace reset deletes them. These
archives are what make the model recoverable without retraining.

This does not modify the model in any way — it only copies and checksums files.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
EXPORT = HERE / "export" / "model-345"
INSTALLED = REPO / "public" / "model-345"
WORK = HERE / "work" / "run"
OUT = HERE / "backup"

PRODUCTION_ZIP = "SketchAI-345-Production-Model.zip"
CHECKPOINT_ZIP = "SketchAI-345-Training-Checkpoint.zip"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def add_many(zip_file: zipfile.ZipFile, files: list[tuple[Path, str]], label: str) -> int:
    count = 0
    for source, arcname in files:
        if not source.exists():
            print(f"  skip (missing): {source}")
            continue
        zip_file.write(source, arcname)
        size = source.stat().st_size
        count += 1
        print(f"  + {arcname:<44} {size / 1024:9.1f} KB")
    print(f"  {label}: {count} files")
    return count


def build_metrics_report(manifest: dict) -> str:
    metrics = manifest.get("metrics", {})
    top1 = metrics.get("test_accuracy")
    top3 = metrics.get("test_top3_accuracy")
    top10 = metrics.get("test_top10_accuracy")
    fmt = lambda value: f"{value * 100:.2f}%" if isinstance(value, (int, float)) else "n/a"

    return f"""# SketchAI 345-class model — metrics and provenance

## What this is

SketchAI's own classifier trained on the Google Quick Draw dataset.
It is **not** Google's model, not AutoDraw, and not a third-party checkpoint.
Every weight in this archive was produced by `training/train_345.py` in the
SketchAI repository.

## Dataset

- Source:   Google Quick, Draw! (CC BY 4.0, (c) Google, Inc.)
- Access:   `quickdraw.js@1.0.6` npm package, a verbatim redistribution of the
            official dataset whose licence file carries the CC BY 4.0 attribution.
            (storage.googleapis.com and huggingface.co are unreachable from the
            training environment, so this mirror was used.)
- Classes:  {manifest.get('categories', 345)} — exactly the official Quick, Draw! list
- Examples per class: {manifest.get('samples_per_class')} (the mirror's ceiling; 34,500 total)
- Split:    {manifest.get('train_samples')} train / {manifest.get('validation_samples')} validation / {manifest.get('test_samples')} test (80/10/10, seed {manifest.get('seed')})

## Input contract

- Shape:  {manifest.get('input_shape')}
- Format: {manifest.get('input_format')}
- Output: {manifest.get('output_classes')} softmax probabilities

## Results (held-out test split)

- Top-1:  {fmt(top1)}
- Top-3:  {fmt(top3)}
- Top-10: {fmt(top10)}
- Random baseline: 0.29%
- Parameters: {manifest.get('parameters', 0):,}

Human hand-drawn doodle test (16 objects): top-1 7/16, top-3 9/16, top-10 12/16.

## Training environment

- CPU only, no GPU
- TensorFlow 2.21.0, tf-keras 2.21.0, Python 3.11
- Adam lr 1e-3, batch 128, 60 epochs (best restored), EarlyStopping +
  ReduceLROnPlateau + ModelCheckpoint
- ~12.5 minutes

## Architecture (unchanged)

    Conv2D(32, 3x3, same) -> BatchNorm -> ReLU -> MaxPool(2x2)
    Conv2D(64, 3x3, same) -> BatchNorm -> ReLU -> MaxPool(2x2)
    Conv2D(128, 3x3, same) -> ReLU
    GlobalAveragePooling2D -> Dense(256, relu) -> Dropout(0.4) -> Dense(345, softmax)

## Preprocessing (must match at inference)

White ink on black, 28x28x1 float32 in 0..1: ink bounding box -> centred square
`max(w, h) * 1.186` -> area-average to 28x28 -> lift the 97th-percentile ink
value to 1.0 (minimum gamma 0.25). Implemented in `src/ai/preprocess.js`
profile "345" and in `training/quickdraw_ndjson.py`.

## Licence

Model weights: produced by this project; free to use with the app.
Dataset: Google Quick, Draw!, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
SketchAI is not affiliated with or endorsed by Google.
"""


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)

    manifest_path = EXPORT / "manifest.json"
    if not manifest_path.exists():
        manifest_path = INSTALLED / "manifest.json"
    if not manifest_path.exists():
        print("No manifest.json found — run training first.", file=sys.stderr)
        return 1
    manifest = json.loads(manifest_path.read_text())

    # --- 1. production model ------------------------------------------------
    shards = sorted(INSTALLED.glob("group*.bin"))
    production: list[tuple[Path, str]] = [
        (INSTALLED / "model.json", "model.json"),
        (INSTALLED / "classes.txt", "classes.txt"),
    ]
    production += [(shard, shard.name) for shard in shards]
    production += [
        (manifest_path, "manifest.json"),
        (EXPORT / "ATTRIBUTION.txt", "ATTRIBUTION.txt"),
    ]

    print(f"Building {PRODUCTION_ZIP}")
    production_path = OUT / PRODUCTION_ZIP
    with zipfile.ZipFile(production_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        archive.writestr("METRICS.md", build_metrics_report(manifest))
        print("  + METRICS.md")
        add_many(archive, production, "production archive")

    # --- 2. training checkpoint --------------------------------------------
    checkpoint: list[tuple[Path, str]] = [
        (WORK / "best.h5", "best.h5"),
        (WORK / "best.keras", "best.keras"),
        (WORK / "history.json", "history.json"),
        (WORK / "training_log.csv", "training_log.csv"),
        (WORK / "summary.json", "summary.json"),
        (WORK / "classes.txt", "classes.txt"),
        (WORK / "training-accuracy.png", "training-accuracy.png"),
        (WORK / "training-loss.png", "training-loss.png"),
    ]

    print(f"\nBuilding {CHECKPOINT_ZIP}")
    checkpoint_path = OUT / CHECKPOINT_ZIP
    with zipfile.ZipFile(checkpoint_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        add_many(archive, checkpoint, "checkpoint archive")

    # --- 3. checksums -------------------------------------------------------
    print("\nChecksums")
    lines = []
    for path in (production_path, checkpoint_path):
        digest = sha256(path)
        lines.append(f"{digest}  {path.name}")
        print(f"  {digest}  {path.name}")
    (OUT / "SHA256SUMS.txt").write_text("\n".join(lines) + "\n")

    print(f"\nArchives written to {OUT}")
    for path in (production_path, checkpoint_path):
        print(f"  {path.name:<40} {path.stat().st_size / 1024 / 1024:.2f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
