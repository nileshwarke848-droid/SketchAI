"""Generate training/SketchAI_345_Training.ipynb from source.

Keeping the notebook generated means the cells and train_345.py can never drift
out of sync: the notebook calls the same functions the command-line script does,
and the fiddly environment handling lives in colab_setup.py where it can be
tested rather than hidden inside a cell.

    python training/build_notebook.py

Only edit this builder, train_345.py or colab_setup.py -- never the .ipynb.
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "SketchAI_345_Training.ipynb"


def md(text: str) -> dict:
    lines = [line + "\n" for line in text.strip("\n").split("\n")]
    if lines:
        lines[-1] = lines[-1].rstrip("\n")
    return {"cell_type": "markdown", "metadata": {}, "source": lines}


def code(text: str) -> dict:
    lines = [line + "\n" for line in text.strip("\n").split("\n")]
    if lines:
        lines[-1] = lines[-1].rstrip("\n")
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": lines,
    }


CELLS = [
    md("""
# SketchAI — train our own 345-class drawing classifier

This notebook trains a small convolutional neural network that recognises **all
345 official Google Quick, Draw! categories**, converts it to TensorFlow.js and
packages it for SketchAI.

**Everything is free.** Training runs on a free Google Colab runtime (CPU or
GPU); the finished model is downloaded to your computer and runs **offline in the
user's browser**. No API keys, no paid services, no server.

### How to use it

Use **Runtime → Run all**. That is the whole workflow. The notebook checks its own
environment, downloads the data, trains, exports and offers you a zip file.

There is exactly **one** setting you change by hand:

```python
QUICK_TEST = True     # first run: 20 categories, a few minutes, proves everything
QUICK_TEST = False    # second run: all 345 categories, the real model
```

Run all once with `QUICK_TEST = True`. When it finishes and you can see a
`sketchai-model-345.zip` in the Files panel, change that one line to `False` and
run all again.

### What you end up with

**`sketchai-model-345.zip`**, containing:

```
model-345/
  model.json                 network architecture
  group1-shard1of1.bin       trained weights
  classes.txt                345 category names, in output-neuron order
  manifest.json              how it was trained, and its measured accuracy
  ATTRIBUTION.txt            credits and licence notes
```

Unzip it, then run `node scripts/install-model-345.mjs ./model-345` in the
SketchAI repository. Full instructions are in `training/README.md` and repeated in
the last section of this notebook.

---
"""),
    md("""
## 1. Setup: repository, packages, environment

One cell that gets everything ready, then tells you exactly what it found.

* **Repository** — cloned from the public GitHub URL over plain HTTPS. No
  username, no password, no token. It checks that the clone actually contains
  `training/train_345.py`, because a plain clone of the default branch can
  succeed while missing the pipeline entirely — which is a very confusing way to
  fail ten cells later.
* **Packages** — installs only what is missing. **It never reinstalls or
  downgrades TensorFlow**, because that is the classic way to lose the T4 GPU:
  `tensorflowjs` depends on `tensorflow-decision-forests`, which pins one exact
  TensorFlow version. Here `tensorflowjs` is installed with `--no-deps`, so
  TensorFlow and the GPU driver stack are left completely alone.
* **Environment** — prints Python, TensorFlow, Keras, TensorFlow.js, protobuf,
  GPU and RAM.

Re-running this cell is harmless: if a package already works, nothing is touched,
and an existing checkout is reused.
"""),
    code("""
import os, sys, importlib, urllib.request

REPO_DIR    = '/content/SketchAI'
BOOTSTRAP   = '/content/sketchai_bootstrap'
RAW_URL     = ('https://raw.githubusercontent.com/nileshwarke848-droid/SketchAI/'
               '{ref}/training/colab_setup.py')

# -- 1. fetch the environment helper (a public file; nothing to log in to) -------
os.makedirs(BOOTSTRAP, exist_ok=True)
fetched = False
for ref in ('main', 'arena/40ecfce2-sketchai'):
    try:
        urllib.request.urlretrieve(RAW_URL.format(ref=ref), os.path.join(BOOTSTRAP, 'colab_setup.py'))
        fetched = True
        break
    except Exception as error:
        print(f'  (could not read colab_setup.py from {ref}: {error})')
if not fetched:
    raise SystemExit('Could not download the setup helper. Check this runtime has internet access.')
sys.path.insert(0, BOOTSTRAP)
import colab_setup

# -- 2. get the repository (public HTTPS clone, no credentials) -----------------
REPO_DIR = colab_setup.ensure_repository(REPO_DIR)

# -- 3. install anything missing, then report the environment -------------------
setup_result = colab_setup.setup()
print()
env = colab_setup.diagnostics(setup_result)

# -- 4. switch to the repository copy of the helpers and use it as the cwd -----
os.chdir(REPO_DIR)
if BOOTSTRAP in sys.path:
    sys.path.remove(BOOTSTRAP)
training_dir = os.path.join(REPO_DIR, 'training')
if training_dir in sys.path:
    sys.path.remove(training_dir)
sys.path.insert(0, training_dir)

import train_345, colab_setup
importlib.reload(colab_setup)
importlib.reload(train_345)

print()
print('working directory :', os.getcwd())
print('pipeline          :', os.path.join('training', 'train_345.py'))

# -- 5. confirm the accelerator explicitly --------------------------------------
import tensorflow as tf
gpus = tf.config.list_physical_devices('GPU')
if gpus:
    name = tf.config.experimental.get_device_details(gpus[0]).get('device_name') or gpus[0].name
    print(f'GPU detected: {name}  ({len(gpus)} device(s)) — training will use it automatically.')
else:
    print('No GPU detected. Continuing on CPU — everything still works, just slower.')
    print('For a GPU: Runtime -> Change runtime type -> T4 GPU, then Run all again.')
"""),
    md("""
## 2. Check the exporter *before* training

The worst possible failure is training for hours and discovering at the very end
that the model cannot be exported. So: convert a throwaway five-class network to
TensorFlow.js right now. It takes seconds.

This cell also checks that Google's dataset bucket is reachable, for the same
reason — better to know now than after a long download.

If either check fails, **stop and fix it** (the cell tells you how). Do not
continue into training.
"""),
    code("""
smoke = colab_setup.smoke_test_conversion()
assert smoke['ok'], 'Fix the TensorFlow.js exporter before training (see the message above).'
"""),
    code("""
dataset_check = colab_setup.check_dataset(train_345.DATASET_BASE_URL)
if dataset_check['ok']:
    print(f"Quick Draw dataset reachable: {dataset_check['rows']} sample rows read")
    print(f"  {dataset_check['url']}")
else:
    raise SystemExit(
        '\\nQuick Draw dataset could not be reached.\\n'
        f"  url   : {dataset_check['url']}\\n"
        f"  reason: {dataset_check['error']}\\n\\n"
        'This notebook needs to download drawings from Google Cloud Storage.\\n'
        'Check that this runtime has internet access (Colab normally does), then\\n'
        'run this cell again. Training cannot continue without the dataset.'
    )
"""),
    md("""
## 3. Configuration

**This is the only cell you need to edit.**

```python
QUICK_TEST = True     # FIRST RUN  — keep this
QUICK_TEST = False    # SECOND RUN — after the first run finished successfully
```

Everything else has a sensible default. `SAMPLES_PER_CLASS` is ignored while
`QUICK_TEST` is `True` (it is capped at 500).
"""),
    code("""
# ---------------------------------------------------------------------------
#  FIRST RUN:  QUICK_TEST = True    -> 20 categories, ~500 drawings each,
#                                      10 epochs, finishes in minutes.
#  THEN:       QUICK_TEST = False   -> all 345 categories, the real model.
# ---------------------------------------------------------------------------
QUICK_TEST       = True

# How many drawings to fetch per category for the FULL run. Google hosts
# 120k-300k per category; 5000 is comfortable on a free runtime, 10000 is better
# if your runtime lasts. Capped at 500 while QUICK_TEST is True.
SAMPLES_PER_CLASS = 5000

BATCH_SIZE  = 256     # lower to 128 or 64 if the runtime runs out of memory
EPOCHS      = 20      # early stopping usually finishes earlier
SEED        = 42      # fixed seed = reproducible splits and reproducible weights

# Light augmentation (tiny shifts and rotations). Doodles are defined by their
# shape, so nothing is ever flipped or heavily distorted.
AUGMENT     = True

# Optional: also save checkpoints to Google Drive so a disconnected runtime does
# not lose hours of work. You will be asked to authorise Drive. Not required.
USE_DRIVE   = False
DRIVE_DIR   = '/content/drive/MyDrive/SketchAI-training'

# Split of every category's drawings. Test drawings are never trained on.
TRAIN_FRACTION = 0.8
VAL_FRACTION   = 0.1   # the remaining 0.1 is the held-out test set

# The dataset. 'quickdraw' is the real Google dataset and is what you want.
# 'synthetic' draws procedural shapes offline and exists only for developing this
# pipeline where the bucket is unreachable -- it can never produce a real model.
DATASET = 'quickdraw'

print(f"QUICK_TEST = {QUICK_TEST}   <-- change this one line for the full run")
print(f"SAMPLES_PER_CLASS = {SAMPLES_PER_CLASS}   EPOCHS = {EPOCHS}   SEED = {SEED}")
"""),
    md("""
## 4. Build the configuration object

`run_pipeline()` does everything: download, split, train, evaluate, export. These
lines translate the settings above into its config object.

`QUICK_TEST` is applied by `resolve()`: it caps the sample count, raises the epoch
count and lowers the batch size. That last part matters — a quick test is tiny, so
at batch size 256 it would only get about 32 optimiser steps per epoch, which is
far too few for a CNN to learn anything. Ten smaller batches give it roughly 630
steps, enough to actually watch the accuracy climb.
"""),
    code("""
from pathlib import Path

cfg = train_345.Config(
    samples_per_class = SAMPLES_PER_CLASS,
    batch_size        = BATCH_SIZE,
    epochs            = EPOCHS,
    seed              = SEED,
    augment           = AUGMENT,
    dataset           = DATASET,
    quick_test        = QUICK_TEST,
    train_fraction    = TRAIN_FRACTION,
    val_fraction      = VAL_FRACTION,
    data_dir          = Path('training/work/data'),
    cache_dir         = Path('training/work/quick-test-cache' if QUICK_TEST else 'training/work/cache'),
    output_dir        = Path('training/work/quick-test-run' if QUICK_TEST else 'training/work/run'),
    export_dir        = Path('training/work/quick-test-export/model-345' if QUICK_TEST
                             else 'training/export/model-345'),
)

if USE_DRIVE:
    from google.colab import drive as _drive
    _drive.mount('/content/drive')
    drive_dir = Path(DRIVE_DIR)
    drive_dir.mkdir(parents=True, exist_ok=True)
    cfg.drive_checkpoint_dir = drive_dir
    print(f'Checkpoints will also be saved to {drive_dir}')

cfg = cfg.resolve()

# The canonical class list is the single source of truth for label order.
categories = train_345.fetch_categories()
if QUICK_TEST:
    selected = train_345.quick_test_categories(categories, cfg.quick_test_categories)
else:
    selected = categories

total = len(selected) * cfg.samples_per_class
print(f'{len(selected)} categories x {cfg.samples_per_class:,} drawings = {total:,} examples')
print(f'estimated download: {total * 784 / 1e9:.2f} GB of pixel data (fetched once, then cached)')
print(f'batch size {cfg.batch_size}, up to {cfg.epochs} epochs')
"""),
    md("""
## 5. Download the dataset

These are real Google Quick, Draw! drawings — people's actual sketches of cats,
buses and giraffes, collected by the Quick, Draw! game.

Google publishes one `.npy` file per category, 30–100 MB each, holding *every*
drawing ever collected. At 345 categories that is tens of gigabytes, far more than
a free runtime holds. So whole files are never downloaded: the loader reads the
small header of each `.npy`, works out where the pixel data starts, and asks the
server for **only the first N rows**.

Each slice is cached to disk, so re-running the notebook after a disconnect does
not re-download it.
"""),
    code("""
%%time
train_345.download_dataset(selected, cfg)
"""),
    md("""
## 6. Split into train / validation / test

80% of each category's drawings train the network, 10% decide when to stop and
which checkpoint is best, and 10% are **held back entirely** and only touched once,
at the end, to measure honest accuracy.

The shuffle uses `SEED = 42`, so the same drawing never lands in two splits and
re-running reproduces the identical partition.

Nothing is loaded into RAM here: the split is just a list of `(category, row)`
pairs, and training reads those rows from memory-mapped files as it needs them.
That is what keeps a 1.7-million-example run inside a free runtime's memory.
"""),
    code("""
bundle = train_345.build_splits(selected, cfg)
print(f'train {len(bundle.train):,}   validation {len(bundle.val):,}   test {len(bundle.test):,}')
"""),
    md("""
### A look at the real data

Always check what you are actually training on. These are 28×28 grayscale
bitmaps: white ink on black, already centred on the drawing's bounding box. They
are rough, because people drew them quickly — which is exactly the skill we want
the model to have.
"""),
    code("""
import numpy as np
import matplotlib.pyplot as plt

_cache = bundle.cache
fig, axes = plt.subplots(2, 8, figsize=(11, 3.2))
for ax in axes.ravel():
    cls = np.random.randint(len(selected))
    row = np.random.randint(_cache[cls].shape[0])
    ax.imshow(_cache[cls][row].reshape(28, 28), cmap='gray')
    ax.set_title(selected[cls], fontsize=7)
    ax.axis('off')
plt.suptitle('Real Google Quick, Draw! training examples', fontsize=10)
plt.tight_layout()
plt.show()
"""),
    md("""
## 7. The model

A deliberately small convolutional network. Three convolution blocks extract
shapes (edges, then curves, then parts), global average pooling summarises them,
and a final Dense layer with **345 outputs** and a softmax turns that into
probabilities that add up to 1.

Why this size: about 215,000 parameters, roughly 0.9 MB of weights. That loads in
a web browser in well under a second and predicts in a few milliseconds. A large
modern vision model would be better at photographs, but this is a 28×28 line
drawing — the extra capacity is not worth the download.

Look at the last line of the summary: **`predictions (Dense)`**. Its output width
is the number of categories, taken from the same list loaded in section 4, so
output neuron N always means `classes.txt` line N.
"""),
    code("""
model = train_345.build_model(len(selected), cfg)
model.summary()
"""),
    md("""
## 8. Train

This is the long cell. Each epoch prints:

* `accuracy`, `top3_accuracy`, `top10_accuracy` on the training data
* `val_accuracy` and friends on the validation data
* whether the checkpoint improved

Three callbacks do useful work:

* **ModelCheckpoint** keeps the best model by validation accuracy, so a later
  worse epoch can never overwrite a better one.
* **EarlyStopping** stops after 4 epochs with no improvement.
* **ReduceLROnPlateau** shrinks the learning rate when progress stalls.

Two copies of the best model are written:

* `best.keras` — the modern Keras format, for reloading and further training
* `best.h5` — HDF5, which is what the TensorFlow.js converter understands

The HDF5 copy is the one used for export, because the converter rejects some
newer `.keras` files.

**How long?** `QUICK_TEST = True` takes a couple of minutes. The full run depends
on which GPU Colab gives you and on `SAMPLES_PER_CLASS` — expect hours, not
minutes. There is no honest way to promise a number in advance. If the runtime
disconnects, re-run from section 3: the dataset is cached, and with
`USE_DRIVE = True` so is your best checkpoint.
"""),
    code("""
%%time
history = train_345.train_model(model, bundle, cfg)
"""),
    md("""
## 9. Training curves

Training accuracy rising while validation accuracy flattens is normal. A *falling*
validation curve while training keeps improving is overfitting — early stopping
should have caught it.
"""),
    code("""
from IPython.display import Image, display

paths = train_345.plot_history(cfg)
for name, path in paths.items():
    print(name, '->', path)
    display(Image(filename=str(path)))
"""),
    md("""
## 10. Evaluate on the held-out test set

These drawings were never shown to the network during training or early stopping,
so this is the number to quote when describing how good the model is.

* **top-1** — how often the single highest-probability guess is right.
* **top-3** — how often the right answer is in the top three. SketchAI shows
  several guesses, so this matters as much as top-1.
* **top-10** — how often it is in the top ten, which is what the suggestion strip
  displays.

For reference, Google's own Quick, Draw! recogniser reaches roughly 75% top-1 with
a much larger model. A compact CNN like this one landing in the high 60s to low
70s across 345 categories is a good, honest result.
"""),
    code("""
metrics = train_345.evaluate_model(model, bundle, cfg)
"""),
    md("""
## 11. Which categories get confused?

A 345×345 grid of numbers is unreadable, so the most frequent
expected → predicted mistakes are listed instead. Expect sensible confusions: a
*sun* with short rays looks like a *flower*; a *circle* with hands is a *clock*.

Something genuinely surprising — say `cat → airplane` in the top ten — is worth
investigating, but it usually means two categories really do overlap in the
dataset rather than that the code is broken.
"""),
    code("""
confusions = train_345.confusion_pairs(model, bundle, cfg, limit=15)
"""),
    md("""
## 12. Test on hand-made doodles

Test-set accuracy is measured on *Quick, Draw!* drawings, but SketchAI users draw
with a mouse or a finger. So sixteen hand-made doodles go through the model too,
with the top ten guesses printed for each.

Nine of these (dog, fish, house, bus, shoe, guitar, elephant, lion, train) are
categories the old 100-class model could not recognise at all — this is where the
expansion should show up.

A low score here is not automatically a broken model: these are sixteen rough
drawings, not a benchmark. Look at whether the runner-up guesses are *plausible*.
"""),
    code("""
!python training/manual_test.py --model {cfg.output_dir}/best.h5 --classes {cfg.output_dir}/classes.txt --png doodles-345.png

from IPython.display import Image, display
display(Image(filename='doodles-345.png'))
"""),
    md("""
## 13. Convert to TensorFlow.js and package everything

This cell:

1. saves the best model in **both** `best.keras` (modern) and `best.h5` (HDF5,
   the format the converter needs),
2. converts **`best.h5`** into a TensorFlow.js Layers model
   (`model.json` + weight shard),
3. writes `classes.txt` **from the exact list used for training**,
4. writes `manifest.json` (how it was trained and the measured accuracy) and
   `ATTRIBUTION.txt`,
5. zips it all into `sketchai-model-345.zip`.

Then it **verifies** the result the way the browser will use it: the label file
must match the canonical list line for line, every weight shard must be present,
and the network's output width must equal the number of labels. If any of that is
wrong it fails loudly, rather than shipping a model that would mislabel every
prediction.
"""),
    code("""
%%time
exported = train_345.save_and_export(model, bundle, metrics, cfg)
print()
print('classes      :', exported['verification']['classes'])
print('output units :', exported['verification']['output_units'])
print('weight shards:', exported['verification']['weight_shards'])
print('size         :', exported['verification']['megabytes'], 'MB')
print('files        :', sorted(p.name for p in cfg.export_dir.iterdir()))
"""),
    md("""
### Reload it the way the browser will

Load the converted model back with TensorFlow.js (the same code path
`tf.loadLayersModel()` uses in the browser) and confirm the shapes. If this
passes, the browser will load it too.
"""),
    code("""
import tensorflowjs as tfjs

loaded = tfjs.converters.load_keras_model(str(cfg.export_dir / 'model.json'))
print('input shape  :', loaded.input_shape)
print('output shape :', loaded.output_shape)
assert loaded.output_shape[-1] == len(selected), 'output width does not match the class count'
print('TensorFlow.js load verified')
"""),
    md("""
## 14. Download the model

If `QUICK_TEST` was `True` you can still download — the zip is a real, working
model. Just remember it has only seen a handful of drawings and will guess badly:
it proves the *pipeline*, it is not the model to ship.

The zip appears in the Files panel on the left, and the browser normally saves it
to your Downloads folder automatically.
"""),
    code("""
import zipfile
from pathlib import Path

zip_path = Path(exported['archive'])
with zipfile.ZipFile(zip_path) as archive:
    print(f'{zip_path.name}  ({zip_path.stat().st_size / 1024 / 1024:.2f} MB)')
    for entry in archive.infolist():
        print(f'  {entry.filename:<45s} {entry.file_size / 1024:8.1f} KB')

try:
    from google.colab import files
    files.download(str(zip_path))
    print('\\nDownload started — check your browser\\'s Downloads folder.')
except Exception as error:
    print(f'\\nAutomatic download unavailable ({error}).')
    print(f'Right-click {zip_path} in the Files panel on the left and choose Download.')
"""),
    md("""
## 15. Install it in SketchAI

On your own computer, in the SketchAI repository:

```bash
# 1. unzip the download next to the repository
unzip ~/Downloads/sketchai-model-345.zip        # creates model-345/

# 2. validate and copy it into the app
node scripts/install-model-345.mjs ./model-345

# 3. run it
npm run dev          # or: npm run build
```

The header should then read **"AI ready — 345 objects"**. If it says
"Extended AI unavailable — using 100-object model", the installer or the browser
rejected the model; run
`node scripts/install-model-345.mjs ./model-345 --check` and it will say which
test failed.

To smoke-test the installed model straight from the command line:

```bash
node scripts/manual-test-345.mjs
```

That is it — no code to write and no dependencies to fight. Everything above is
explained in more detail in `training/README.md`.
"""),
]


def main() -> None:
    notebook = {
        "cells": CELLS,
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python"},
            "accelerator": "GPU",
            "colab": {"provenance": [], "gpuClass": "standard", "toc_visible": True},
        },
        "nbformat": 4,
        "nbformat_minor": 0,
    }
    OUTPUT.write_text(json.dumps(notebook, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT} ({len(CELLS)} cells)")


if __name__ == "__main__":
    main()
