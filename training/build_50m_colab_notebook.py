"""Build the no-billing Colab workflow for the full Quick, Draw! archive."""
from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).with_name("SketchAI_QuickDraw_50M_Colab.ipynb")


def markdown(text: str) -> dict:
    lines = [line + "\n" for line in text.strip("\n").splitlines()]
    if lines:
        lines[-1] = lines[-1].rstrip("\n")
    return {"cell_type": "markdown", "metadata": {}, "source": lines}


def code(text: str) -> dict:
    lines = [line + "\n" for line in text.strip("\n").splitlines()]
    if lines:
        lines[-1] = lines[-1].rstrip("\n")
    return {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": lines}


CELLS = [
    markdown("""
# SketchAI — full Quick, Draw! cloud training (zero-budget path)

This notebook is the **free, best-effort Google Colab path** for training from the
full official Quick, Draw! bitmap archive. It reads the public Google Cloud
Storage objects with bounded HTTP byte ranges, one category/chunk at a time. It
does not download the archive into this repository or load it all into RAM.

The official archive is about 50 million drawings in 345 categories and is CC BY
4.0. The notebook keeps only a transformed memory-mapped cache on Colab's
**ephemeral `/content` disk**. Expect tens of GB of free disk use while it runs;
a preflight stops before bulk transfer if the runtime lacks room. Cache chunks
resume if a cell/runtime interruption leaves `/content` intact, but a full VM reset
can erase that temporary cache and require refetching it.

**No paid GCP resources are created.** Use only a free Colab runtime. Free GPU
availability, disk quota, runtime duration and throughput are controlled by
Google and are not guaranteed. Do not switch to a paid runtime or enter billing
information. If Colab offers no free GPU or enough disk, stop and retry another
time; do not let it fall back to a paid option.

A full run is intentionally a deliberate action: leave `START_FULL_RUN = False`
until the preflight passes and you are ready to spend several hours of a free
session. The split is 98% train / 1% validation / 1% held-out test; all categories
and source drawings are accounted for, and the held-out set is not used for weight
updates. The existing shipped model is not replaced automatically.

Source and license: [Google Quick, Draw!](https://github.com/googlecreativelab/quickdraw-dataset),
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
"""),
    code("""
# Run this notebook from the active SketchAI branch after it has been pushed.
# No GitHub credentials or cloud service-account keys belong in this notebook.
import os, subprocess, sys

REPO_URL = 'https://github.com/nileshwarke848-droid/SketchAI.git'
REPO_REF = 'arena/c8fe0bf2-sketchai'
REPO_DIR = '/content/SketchAI'
if not os.path.isdir(os.path.join(REPO_DIR, 'training', 'quickdraw_gcs.py')):
    if os.path.exists(REPO_DIR):
        raise RuntimeError(f'{REPO_DIR} exists but is not the full-data training branch; remove it and rerun.')
    try:
        subprocess.run(['git', 'clone', '--depth', '1', '--branch', REPO_REF, REPO_URL, REPO_DIR], check=True)
    except subprocess.CalledProcessError as error:
        raise RuntimeError(
            f'Could not clone {REPO_REF}. Push the active branch to GitHub first, '
            'or upload a checkout containing training/quickdraw_gcs.py to /content/SketchAI.'
        ) from error
os.chdir(REPO_DIR)
sys.path.insert(0, os.path.join(REPO_DIR, 'training'))
print('Repository:', REPO_DIR)
print('Branch:', REPO_REF)
"""),
    markdown("""
## 1. Free-runtime checks and exporter setup

In Colab choose **Runtime → Change runtime type → T4 GPU** only if Colab offers
it for free. If the only option shown requires payment, stop. The compact CNN can
run on CPU, but a 50M-row run is not practical on a short CPU session.
"""),
    code("""
import tensorflow as tf
from pathlib import Path
import colab_setup

setup_result = colab_setup.setup()
gpus = tf.config.list_physical_devices('GPU')
print('TensorFlow:', tf.__version__)
print('Free GPU devices:', len(gpus))
print('Devices:', [d.name for d in gpus])
if not gpus:
    raise RuntimeError('No GPU is attached. Stop here; do not enable a paid runtime.')
if not setup_result.get('tensorflowjs_ok', False):
    raise RuntimeError('TensorFlow.js exporter setup failed; do not start the full data transfer.')
import train_345, quickdraw_gcs
"""),
    markdown("""
## 2. Verify every official object before bulk transfer

This makes only small header-range requests (up to 64 KiB per category). It does
not fetch the bitmap bodies. It checks object names, NPY shapes, total row count
and total bytes against this runtime's free scratch disk.
"""),
    code("""
import shutil

categories = train_345.fetch_categories()
inspection = quickdraw_gcs.inspect_categories(categories)
free_bytes = shutil.disk_usage('/content').free
required_bytes = inspection['bytes'] + 8 * 1024**3  # 8 GiB headroom for logs and temporary files
print(f"Categories found : {inspection['categories']}")
print(f"Rows found       : {inspection['rows']:,}")
print(f"Source size      : {inspection['bytes'] / 1024**3:.1f} GiB (read later in chunks)")
print(f"Free Colab disk  : {free_bytes / 1024**3:.1f} GiB")
if inspection['categories'] != 345 or inspection['rows'] < 45_000_000:
    raise RuntimeError('The official full archive did not validate as the 345-class ~50M source.')
if free_bytes < required_bytes:
    raise RuntimeError('Not enough free Colab scratch disk. No bitmap body has been downloaded; retry with a larger free runtime.')
print('Preflight passed. No bulk data has been downloaded yet.')
"""),
    markdown("""
## 3. Tiny range-transfer smoke test (not training)

Fetches only 16 drawings from two categories to prove GCS Range requests, bitmap
parsing and app-compatible preprocessing. The temporary smoke cache is deleted.
"""),
    code("""
import shutil

smoke_dir = Path('/content/quickdraw-gcs-smoke')
for label in (categories[0], categories[-1]):
    item = quickdraw_gcs.cache_category(label, smoke_dir, chunk_rows=8, row_limit=16)
    print(label, item['rows'], 'rows; cached bytes:', item['bytes'])
shutil.rmtree(smoke_dir, ignore_errors=True)
print('GCS range smoke test passed. This was not a model benchmark.')
"""),
    markdown("""
## 4. Confirm the full run and mount free Drive checkpoints

The dataset cache stays on Colab scratch, not Drive (a full copy can exceed free
Drive storage). Drive stores only training checkpoints and the final small model
archive, so an epoch-complete checkpoint can survive a runtime reset.
"""),
    code("""
START_FULL_RUN = False  # Change to True only after reviewing the preflight totals above.
if not START_FULL_RUN:
    raise RuntimeError('Set START_FULL_RUN = True when you are ready to run the full dataset job.')

from google.colab import drive

drive.mount('/content/drive')
CHECKPOINT_DIR = Path('/content/drive/MyDrive/SketchAI-QuickDraw-50M')
CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
print('Epoch checkpoints:', CHECKPOINT_DIR)
"""),
    markdown("""
## 5. Train from all categories

One pass exposes the network to the full set: 98% of each class is used for
training, 1% for validation and 1% for the final held-out test. At 50M rows that
is about 49M training examples per epoch. Two epochs are the free-runtime target;
if the free session cannot finish, keep the same cache/runtime and resume or rerun
only when free capacity is available. The training manifest records the exact
rows actually read; no accuracy improvement is assumed in advance.
"""),
    code("""
from pathlib import Path

cfg = train_345.Config(
    dataset='quickdraw-gcs-full',
    samples_per_class=0,       # full mode ignores per-class limits
    gcs_chunk_rows=4096,       # bounded transfer/preprocess chunk
    batch_size=512,
    epochs=2,
    seed=42,
    quick_test=False,
    augment=True,
    train_fraction=0.98,
    val_fraction=0.01,
    early_stopping_patience=1,
    data_dir=Path('/content/sketchai-data'),
    cache_dir=Path('/content/sketchai-quickdraw-cache'),
    output_dir=Path('/content/sketchai-run'),
    export_dir=Path('/content/sketchai-export/model-345'),
    drive_checkpoint_dir=CHECKPOINT_DIR / 'checkpoints',
)
cfg = cfg.resolve()
print('Training config:', cfg.describe())
print('Free scratch available:', f"{shutil.disk_usage('/content').free / 1024**3:.1f} GiB")
"""),
    code("""
# This is the long-running cell. GCS requests remain chunked; only the processed
# per-class memory maps are retained on this Colab VM's scratch disk.
summary = train_345.run_pipeline(cfg, categories=categories)
print('Held-out metrics:', summary['metrics'])
print('Held-out test rows:', summary['metrics']['test_samples'])
print('Model archive:', summary['archive'])
"""),
    markdown("""
## 6. Verify and download the candidate model

Inspect the held-out metrics and the manifest before installing. This notebook
never writes into the checked-in app model automatically; installation is a
separate, reviewed local step.
"""),
    code("""
import json

manifest = json.loads((cfg.export_dir / 'manifest.json').read_text())
print('Source rows:', f"{manifest['source_total_rows']:,}")
print('Train / validation / test:', manifest['train_samples'], manifest['validation_samples'], manifest['test_samples'])
print('Held-out top-1 / top-3 / top-10:',
      manifest['metrics'].get('test_accuracy'),
      manifest['metrics'].get('test_top3_accuracy'),
      manifest['metrics'].get('test_top10_accuracy'))
print('Self-test only:', manifest['is_self_test_only'])
assert manifest['dataset'].startswith('Google Quick, Draw! full')
assert manifest['source_total_rows'] >= 45_000_000

from google.colab import files
files.download(summary['archive'])
"""),
    markdown("""
## 7. Install only after local review

On your local SketchAI checkout, unzip the downloaded archive, validate it, then
install it explicitly:

```bash
unzip ~/Downloads/sketchai-model-345.zip
node scripts/install-model-345.mjs ./model-345
npm run build
```

The installer verifies class order and model shape. Compare the new held-out test
results with the existing model before replacing the deployed weights. A small
smoke test is not a benchmark, and this notebook does not promise an accuracy gain.
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
