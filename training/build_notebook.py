"""Generate training/SketchAI_345_Training.ipynb from source.

Keeping the notebook generated means the cells and train_345.py can never drift
out of sync: the notebook calls the same functions the command-line script does.

    python training/build_notebook.py

Only edit this builder (and train_345.py), never the .ipynb by hand.
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

**Everything here is free.** Training runs on a free Google Colab runtime
(CPU or GPU); the finished model is downloaded to your computer and runs
**offline in the user's browser**. No API keys, no paid services, no server.

### How to use this notebook

Run the cells in order, top to bottom. There are three things you choose:

| Setting | Where | Meaning |
| --- | --- | --- |
| `QUICK_TEST` | cell 2 | `True` = a tiny run that proves the pipeline in minutes. `False` = the real training run. |
| `SAMPLES_PER_CLASS` | cell 2 | How many drawings per category. `5000` is the safe default; `10000` is better if your runtime lasts long enough. |
| `USE_DRIVE` | cell 2 | `True` saves checkpoints to your Google Drive so a disconnect does not lose everything. Optional. |

**First time? Leave `QUICK_TEST = True`, run everything once, and see it finish.**
Then set it to `False` and run again for the real model.

### What you will end up with

A file called **`sketchai-model-345.zip`** in the Files panel (the folder icon on
the left). Inside:

```
model-345/
  model.json          network architecture
  group1-shard1of1.bin   trained weights
  classes.txt         345 category names, in output-neuron order
  manifest.json       how it was trained, and its measured accuracy
  ATTRIBUTION.txt     credits and licence notes
```

Unzip that folder, then run `node scripts/install-model-345.mjs <folder>` in the
SketchAI repository and rebuild. Full instructions are in `training/README.md`.

---
"""),
    md("""
## 1. Setup

Colab already has TensorFlow. We only need the TensorFlow.js converter, which
turns a trained Keras model into files a web browser can load.

`TF_USE_LEGACY_KERAS=1` is set because the converter understands the Keras 2
format. This cell takes a minute the first time.
"""),
    code("""
import os, sys
os.environ['TF_USE_LEGACY_KERAS'] = '1'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

!pip -q install tensorflowjs==4.22.0

print('setup done')
"""),
    md("""
## 2. Configuration

Everything you might want to change lives in this one cell.

**Start with `QUICK_TEST = True`.** It trains 20 categories on 500 drawings each
for 3 epochs — a few minutes — and runs the *entire* pipeline including the
TensorFlow.js export. When that has worked once, set `QUICK_TEST = False` and run
the notebook again for the real 345-class model.
"""),
    code("""
# ---------------------------------------------------------------------------
# QUICK_TEST = True  -> tiny run, proves the pipeline, a few minutes
# QUICK_TEST = False -> the real 345-class training run, several hours
# ---------------------------------------------------------------------------
QUICK_TEST       = True

# How many drawings to fetch for each category. Google hosts ~120k-300k per
# category; 5000 is comfortable on a free runtime, 10000 is better if the
# runtime survives. Ignored (capped at 500) while QUICK_TEST is True.
SAMPLES_PER_CLASS = 5000

BATCH_SIZE  = 256     # lower this to 128 if you run out of memory
EPOCHS      = 20      # early stopping will finish earlier
SEED        = 42      # fixed seed = reproducible splits and weights

# Light augmentation (tiny shifts and rotations). Doodles are defined by shape,
# so we never flip or heavily distort them.
AUGMENT     = True

# Optional: save checkpoints to Google Drive so a disconnected runtime does not
# lose hours of work. You will be asked to authorise Drive access.
USE_DRIVE   = False
DRIVE_DIR   = '/content/drive/MyDrive/SketchAI-training'

# Split of every category's drawings. Test drawings are never trained on.
TRAIN_FRACTION = 0.8
VAL_FRACTION   = 0.1   # the rest (0.1) is the held-out test set

print(f'QUICK_TEST={QUICK_TEST}  SAMPLES_PER_CLASS={SAMPLES_PER_CLASS}  EPOCHS={EPOCHS}')
"""),
    md("""
## 3. Get the code

The training logic lives in `training/train_345.py` in the SketchAI repository
(the notebook just calls it). We need `src/data/quickdraw-categories.txt` from the
same repository, because **that file is the single source of truth for the class
order**.

This matters more than it sounds: the network's output neuron number 137 must mean
the same thing as line 137 of `classes.txt`. If the order came from a directory
listing or a different file, every prediction would be labelled with the wrong
object. So the order is read from that one file and written straight back out
beside the exported model.
"""),
    code("""
import os, sys

REPO = '/content/SketchAI'
if not os.path.exists(REPO):
    !git clone -q --depth 1 https://github.com/nileshwarke848-droid/SketchAI.git {REPO}

os.chdir(REPO)
print('working directory:', os.getcwd())
sys.path.insert(0, os.path.join(REPO, 'training'))

import importlib, train_345
importlib.reload(train_345)

categories = train_345.fetch_categories()
assert len(categories) == 345, len(categories)
print(f'{len(categories)} categories loaded from src/data/quickdraw-categories.txt')
print('first five :', categories[:5])
print('last five  :', categories[-5:])
"""),
    md("""
## 4. Build the configuration object

`run_pipeline()` does everything: download, split, train, evaluate, export. These
few lines translate the settings above into its config object.
"""),
    code("""
from pathlib import Path

cfg = train_345.Config(
    samples_per_class = SAMPLES_PER_CLASS,
    batch_size        = BATCH_SIZE,
    epochs            = EPOCHS,
    seed              = SEED,
    augment           = AUGMENT,
    quick_test        = QUICK_TEST,
    train_fraction    = TRAIN_FRACTION,
    val_fraction      = VAL_FRACTION,
    data_dir          = Path('training/work/data'),
    cache_dir         = Path('training/work/quick-test-cache' if QUICK_TEST else 'training/work/cache'),
    output_dir        = Path('training/work/quick-test-run' if QUICK_TEST else 'training/work/run'),
    export_dir        = Path('training/work/quick-test-export/model-345' if QUICK_TEST
                             else 'training/export/model-345'),
)

drive_dir = None
if USE_DRIVE:
    from google.colab import drive as _drive
    _drive.mount('/content/drive')
    drive_dir = Path(DRIVE_DIR)
    drive_dir.mkdir(parents=True, exist_ok=True)
    cfg.drive_checkpoint_dir = drive_dir
    print(f'Checkpoints will also be saved to {drive_dir}')

cfg = cfg.resolve()

# QUICK_TEST trains a spread of 20 categories instead of all 345.
if QUICK_TEST:
    selected = train_345.quick_test_categories(categories, cfg.quick_test_categories)
else:
    selected = categories

total = len(selected) * cfg.samples_per_class
print(f'{len(selected)} categories x {cfg.samples_per_class} drawings = {total:,} examples')
print(f'estimated download: {total * 784 / 1e9:.2f} GB of pixel data (fetched once, then cached)')
"""),
    md("""
## 5. Download the dataset

Google publishes the Quick, Draw! dataset as one `.npy` file per category — around
30-100 MB each, holding *every* drawing of that object ever collected. At 345
categories that is tens of gigabytes, far more than a free runtime can hold.

So we do not download whole files. The loader reads the small header of each
`.npy`, works out where the pixel data starts, and asks the server for **only the
first N rows**. Twenty thousand rows cost a few megabytes instead of a hundred.

Each fetched slice is cached to disk, so re-running the notebook does not
re-download it. Progress is printed every ten categories.
"""),
    code("""
%%time
train_345.download_dataset(selected, cfg)
"""),
    md("""
## 6. Split into train / validation / test

80% of each category's drawings are used for training, 10% to decide when to stop
and which checkpoint is best, and 10% are **held back entirely** and only touched
once, at the very end, to measure honest accuracy.

The shuffle uses `SEED = 42`, so the same drawing never appears in two splits and
re-running the notebook reproduces the exact same partition.

Nothing is loaded into RAM here: the split is just a list of (category, row)
pairs, and the training loop reads those rows from memory-mapped files as it needs
them. That is what keeps a 1.7-million-example run inside a free runtime's memory.
"""),
    code("""
bundle = train_345.build_splits(selected, cfg)
print(f'train {len(bundle.train):,}  validation {len(bundle.val):,}  test {len(bundle.test):,}')
"""),
    md("""
### A look at the data

Always check what you are actually training on. These are 28×28 grayscale
bitmaps: white ink on a black background, already centred on the drawing's
bounding box.
"""),
    code("""
import numpy as np, matplotlib.pyplot as plt

_cache = bundle.cache
fig, axes = plt.subplots(2, 8, figsize=(11, 3.2))
for ax in axes.ravel():
    cls = np.random.randint(len(selected))
    row = np.random.randint(_cache[cls].shape[0])
    ax.imshow(_cache[cls][row].reshape(28, 28), cmap='gray')
    ax.set_title(selected[cls], fontsize=7)
    ax.axis('off')
plt.suptitle('Real Quick, Draw! training examples', fontsize=10)
plt.tight_layout()
plt.show()
"""),
    md("""
## 7. The model

A deliberately small convolutional network. Three convolution blocks extract
shapes (edges, curves, then parts), global average pooling summarises them, and a
final Dense layer with **345 outputs** and a softmax turns that into
probabilities that sum to 1.

Why this size: it is about 215,000 parameters, roughly 0.9 MB of weights. That
loads in a web browser in well under a second, and a prediction takes a few
milliseconds. A large modern vision model would be more accurate on photographs,
but this is a 28×28 line drawing and the extra capacity is not worth the download.

Notice the final line: **345**. That is the number of categories, and it is the
same list we loaded in section 3 — output neuron N always means `classes.txt`
line N.
"""),
    code("""
model = train_345.build_model(len(selected), cfg)
model.summary()
"""),
    md("""
## 8. Train

This is the long cell. While it runs you will see, per epoch:

* `accuracy` / `top3_accuracy` / `top10_accuracy` on the training data
* `val_accuracy` etc. on the validation data
* a line saying whether the checkpoint improved

Three callbacks are doing useful work:

* **ModelCheckpoint** keeps the best model by validation accuracy, so a later
  worse epoch can never overwrite a better one.
* **EarlyStopping** ends training after 4 epochs with no improvement.
* **ReduceLROnPlateau** shrinks the learning rate when progress stalls, which
  usually buys another fraction of a percent.

If the runtime disconnects, re-run from section 4 — the dataset is cached on disk,
and with `USE_DRIVE = True` your best checkpoint is in Drive.

**Rough timing:** with `QUICK_TEST = True` this takes a couple of minutes. For the
full run it depends heavily on which GPU Colab gives you and on
`SAMPLES_PER_CLASS` — expect hours, not minutes. There is no honest way to
promise a number in advance.
"""),
    code("""
%%time
history = train_345.train_model(model, bundle, cfg)
"""),
    md("""
## 9. Training curves

Training accuracy rising while validation accuracy flattens is normal. A *falling*
validation curve while training keeps improving means overfitting — the early
stopping should have caught it.
"""),
    code("""
from IPython.display import Image, display

paths = train_345.plot_history(cfg)
for name, path in paths.items():
    print(name, '->', path)
    display(Image(filename=path))
"""),
    md("""
## 10. Evaluate on the held-out test set

These drawings were never shown to the network during training or early stopping,
so this is the number to quote when describing how good the model is.

* **top-1** — how often the single highest-probability guess is right.
* **top-3** — how often the right answer is among the top three. SketchAI shows
  several guesses, so this matters as much as top-1.
* **top-10** — how often it is in the top ten, which is what the suggestion strip
  displays.

For reference, Google's own Quick, Draw! recogniser reaches roughly 75% top-1 on
human sketches with a much larger model; a compact CNN like this one landing in the
high 60s to low 70s on 345 categories is a good, honest result.
"""),
    code("""
metrics = train_345.evaluate_model(model, bundle, cfg)
"""),
    md("""
## 11. Which categories get confused?

A 345×345 grid of numbers is unreadable, so we list the most frequent
expected → predicted mistakes instead. Expect sensible confusions: a *sun* with
short rays looks like a *flower*; a *circle* with hands is a *clock*.

If you see something *surprising* — say, `cat → airplane` in the top ten — that is
worth investigating: it usually means two categories genuinely overlap in the
dataset, not that the code is broken.
"""),
    code("""
confusions = train_345.confusion_pairs(model, bundle, cfg, limit=15)
"""),
    md("""
## 12. Test on hand-made doodles

Test-set accuracy is measured on *Quick, Draw!* drawings, but SketchAI users draw
with a mouse or a finger. So let's also push sixteen hand-made doodles through the
model and print the top ten guesses for each.

Some of these (dog, fish, house, bus, shoe, guitar, elephant, lion, train) are
categories the old 100-class model could not recognise at all — this is where the
expansion should show up.
"""),
    code("""
!python training/manual_test.py --model {cfg.output_dir}/best.h5 --classes {cfg.output_dir}/classes.txt --png doodles-345.png

from IPython.display import Image, display
display(Image(filename='doodles-345.png'))
"""),
    md("""
## 13. Convert to TensorFlow.js and package everything

This cell:

1. saves the best model in the HDF5 format the converter needs,
2. converts it to a TensorFlow.js **Layers** model (`model.json` + weight shard),
3. writes `classes.txt` **from the exact list used for training**,
4. writes `manifest.json` (how it was trained, and the measured accuracy) and
   `ATTRIBUTION.txt`,
5. zips it all into `sketchai-model-345.zip`.

Then it **verifies** the result the same way the browser will use it: the label
file must match the canonical list line for line, every weight shard must be
present, and the network's output width must be 345. If any of that is wrong, the
cell fails loudly rather than shipping a model that would mislabel everything.
"""),
    code("""
%%time
exported = train_345.save_and_export(model, bundle, metrics, cfg)
print()
print('classes     :', exported['verification']['classes'])
print('output units:', exported['verification']['output_units'])
print('shards      :', exported['verification']['weight_shards'])
print('size        :', exported['verification']['megabytes'], 'MB')
print('files       :', sorted(p.name for p in cfg.export_dir.iterdir()))
"""),
    md("""
### Double-check the export, the way the browser sees it

Load the converted model back with TensorFlow.js in Python (the same code path
`tf.loadLayersModel()` uses in the browser) and confirm the output shape is
`[1, 345]`. If this passes, the browser will load it too.
"""),
    code("""
import tensorflowjs as tfjs
import tensorflow as tf

loaded = tfjs.converters.load_keras_model(str(cfg.export_dir / 'model.json'))
print('input shape :', loaded.input_shape)
print('output shape:', loaded.output_shape)
assert loaded.output_shape[-1] == len(selected), 'output width does not match the class count'
print('TensorFlow.js load verified')
"""),
    md("""
## 14. Download the model

If `QUICK_TEST` is `True` you can still download — the zip is a real, working
345-output (or 20-output) model. Just remember a quick-test model has only seen a
handful of drawings and will guess badly; it proves the *pipeline*, it is not the
model to ship.

The zip appears in the Files panel on the left.
"""),
    code("""
from google.colab import files
zip_path = Path(exported['archive'])
print('downloading', zip_path, f'({zip_path.stat().st_size / 1024 / 1024:.2f} MB)')
files.download(str(zip_path))
"""),
    md("""
## 15. Install it in SketchAI

On your own computer, in the SketchAI repository:

```bash
# 1. unzip the download next to the repository
unzip ~/Downloads/sketchai-model-345.zip        # creates model-345/

# 2. validate and copy it into the app
node scripts/install-model-345.mjs ./model-345

# 3. rebuild and run
npm run dev          # or: npm run build
```

The header should then read **"AI ready — 345 objects"**. If it says
"Extended AI unavailable — using 100-object model", the installer or the browser
rejected the model; run `node scripts/install-model-345.mjs ./model-345 --check`
and it will tell you which test failed.

To smoke-test the installed model from the command line:

```bash
node scripts/manual-test-345.mjs
```

Everything above is explained in more detail in `training/README.md`.
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
