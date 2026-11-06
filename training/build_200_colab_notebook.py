"""Generate the zero-budget Colab notebook for 200 official drawings per class."""
from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).with_name("SketchAI_QuickDraw_200_Colab.ipynb")


def cell(kind: str, text: str) -> dict:
    source = [line + "\n" for line in text.strip("\n").splitlines()]
    if source:
        source[-1] = source[-1].rstrip("\n")
    result = {"cell_type": kind, "metadata": {}, "source": source}
    if kind == "code":
        result.update({"execution_count": None, "outputs": []})
    return result


CELLS = [
    cell("markdown", """
# SketchAI — 200 Quick, Draw! examples per class (free-only Colab)

This notebook prepares a **small, 345-class training run** from the official
Google Quick, Draw! public bitmap archive. It stages 250 drawings per category
(86,250 total) using bounded HTTP range reads, then trains on 200 per category
and evaluates the app-compatible model. This is a temporary smaller run—not the complete 50M
archive and not a promise of an accuracy gain.

**Zero-budget guard:** use only a free Google Colab runtime. The notebook does not
create paid GCP resources, VMs or buckets. Google may not offer free GPU time or
may interrupt a session; availability is not guaranteed. If Colab shows only paid
compute, stop. A small 200-per-class run is modest in storage, but it still needs
an attached free GPU for a practical run.

Only after the checks and two-category range smoke test pass should you set
`START_200_RUN = True`. Every category contributes 250 source rows; the seeded
80/10/10 split uses 200 train, 25 validation and 25 held-out test rows per class.
The exporter preserves the canonical category order and records exact counts and
held-out metrics.

Source: [Google Quick, Draw!](https://github.com/googlecreativelab/quickdraw-dataset),
CC BY 4.0. The resulting candidate is not installed in the app automatically.
"""),
    cell("code", """
import os, subprocess, sys

REPO_URL = 'https://github.com/nileshwarke848-droid/SketchAI.git'
REPO_REF = 'arena/c8fe0bf2-sketchai'
REPO_DIR = '/content/SketchAI'
if not os.path.isdir(os.path.join(REPO_DIR, 'training', 'quickdraw_gcs.py')):
    try:
        subprocess.run(['git', 'clone', '--depth', '1', '--branch', REPO_REF, REPO_URL, REPO_DIR], check=True)
    except subprocess.CalledProcessError as error:
        raise RuntimeError(
            f'Could not clone {REPO_REF}. Push the active branch to GitHub first, '
            'or upload a checkout containing training/quickdraw_gcs.py to /content/SketchAI.'
        ) from error
os.chdir(REPO_DIR)
sys.path.insert(0, os.path.join(REPO_DIR, 'training'))
import train_345, quickdraw_gcs
print('Repository ready:', REPO_REF)
"""),
    cell("code", """
import tensorflow as tf
import colab_setup

setup_result = colab_setup.setup()
gpus = tf.config.list_physical_devices('GPU')
print('TensorFlow:', tf.__version__)
print('GPUs:', [device.name for device in gpus])
if not gpus:
    raise RuntimeError('No GPU is attached. Stop here; do not select a paid runtime.')
if not setup_result.get('tensorflowjs_ok', False):
    raise RuntimeError('TensorFlow.js exporter setup failed; do not download training rows.')
"""),
    cell("markdown", """
## 1. Preflight (headers only)

This verifies every official category object and computes the storage needed for
200 rows/class. It makes small range requests for NPY headers; bitmap bodies are
not read in this cell.
"""),
    cell("code", """
import shutil

categories = train_345.fetch_categories()
inspection = quickdraw_gcs.inspect_categories(categories)
if inspection['categories'] != 345 or inspection['rows'] < 45_000_000:
    raise RuntimeError('The official 345-class full archive did not validate.')
if any(item['rows'] < 250 for item in inspection['objects'].values()):
    raise RuntimeError('At least one category has fewer than 250 source rows.')
# Processed uint8 cache: 250 x 28 x 28 bytes/category, plus conservative headroom.
estimated_cache = 345 * 250 * 28 * 28 + 512 * 1024**2
free_bytes = shutil.disk_usage('/content').free
print(f"Verified source rows: {inspection['rows']:,} across {inspection['categories']} categories")
print(f"Estimated 250-row cache: {estimated_cache / 1024**2:.1f} MiB")
print(f"Free scratch disk: {free_bytes / 1024**3:.1f} GiB")
if free_bytes < estimated_cache:
    raise RuntimeError('Insufficient free scratch disk; no bitmap rows have been downloaded.')
"""),
    cell("markdown", """
## 2. Small transfer smoke test

Fetches 16 rows from two categories, verifies Range requests and app preprocessing,
then removes the temporary cache. This is not model training or evaluation.
"""),
    cell("code", """
import shutil
from pathlib import Path

smoke_dir = Path('/content/quickdraw-200-smoke')
for label in (categories[0], categories[-1]):
    print(quickdraw_gcs.cache_category(label, smoke_dir, chunk_rows=8, row_limit=16))
shutil.rmtree(smoke_dir, ignore_errors=True)
print('Range smoke test passed; no model was trained.')
"""),
    cell("markdown", """
## 3. Start the 200-per-class run only when ready

The switch is false by default. The job downloads 86,250 examples total, then
trains on 69,000 of them (200/class) and holds out 8,625 each for validation and test.
"""),
    cell("code", """
START_200_RUN = False  # Set True only after reviewing the preflight above.
if not START_200_RUN:
    raise RuntimeError('Set START_200_RUN = True when you are ready to start training.')

from pathlib import Path

cfg = train_345.Config(
    dataset='quickdraw-gcs-sampled',
    samples_per_class=250,
    gcs_chunk_rows=64,
    batch_size=128,
    epochs=30,
    seed=42,
    quick_test=False,
    augment=True,
    train_fraction=0.8,
    val_fraction=0.1,
    early_stopping_patience=5,
    data_dir=Path('/content/sketchai-200-data'),
    cache_dir=Path('/content/sketchai-200-cache'),
    output_dir=Path('/content/sketchai-200-run'),
    export_dir=Path('/content/sketchai-200-export/model-345'),
)
cfg = cfg.resolve()
print(cfg.describe())
"""),
    cell("code", """
summary = train_345.run_pipeline(cfg, categories=categories)
print('Dataset:', summary['dataset'])
print('Held-out metrics:', summary['metrics'])
print('Candidate archive:', summary['archive'])
"""),
    cell("code", """
import json
from google.colab import files

manifest = json.loads((cfg.export_dir / 'manifest.json').read_text())
assert manifest['source_total_rows'] == 345 * 250
assert manifest['train_samples'] == 345 * 200
assert manifest['validation_samples'] == 345 * 25
assert manifest['test_samples'] == 345 * 25
print('Source rows:', manifest['source_total_rows'])
print('Train / validation / test:', manifest['train_samples'], manifest['validation_samples'], manifest['test_samples'])
print('Held-out top-1/top-3/top-10:', manifest['metrics'].get('test_accuracy'), manifest['metrics'].get('test_top3_accuracy'), manifest['metrics'].get('test_top10_accuracy'))
files.download(summary['archive'])
"""),
    cell("markdown", """
## Install only after reviewing

The downloaded zip contains the TensorFlow.js model, canonical `classes.txt`,
manifest, held-out metrics and attribution. On a local checkout, validate it
before installing:

```bash
unzip ~/Downloads/sketchai-model-345.zip
node scripts/install-model-345.mjs ./model-345 --check
node scripts/install-model-345.mjs ./model-345
npm run build
```

This run's metrics are a small-sample result; compare them with a suitable
baseline and do not assume improvement. The full archive workflow remains
`SketchAI_QuickDraw_50M_Colab.ipynb`.
"""),
]

notebook = {
    "cells": CELLS,
    "metadata": {
        "colab": {"name": OUT.name, "provenance": []},
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python", "version": "3.11"},
    },
    "nbformat": 4,
    "nbformat_minor": 5,
}
OUT.write_text(json.dumps(notebook, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"Wrote {OUT}")
