# Training SketchAI's own 345-class classifier

This folder contains everything needed to train a drawing classifier on
**Google's Quick, Draw! dataset** and install it into SketchAI.

The app uses the project's 345-class Quick, Draw! model by default, then the
original 100-class fallback. The supplied 333-class model is integrated as an
evaluation-only opt-in because its output-label ordering is not verified. This
folder documents how to train and install the full **345 official Quick, Draw!
class** model; the 333-class artifact is recorded separately below because its
training metadata was not included with the model files.

> **Everything is free.** Training runs on a free Google Colab runtime; the
> finished model is downloaded to your computer and runs offline in the user's
> browser. No API keys, no paid GPU, no server, no cloud inference.

---

## Contents

| File | What it is |
| --- | --- |
| `SketchAI_345_Training.ipynb` | The Colab notebook. **Start here.** |
| `train_345.py` | The training pipeline as a normal Python script (the notebook calls it). |
| `colab_setup.py` | Keeps the notebook alive on a real Colab runtime: dependency handling that never downgrades TensorFlow, repository cloning, and pre-flight checks. |
| `build_notebook.py` | Regenerates the notebook from source, so the notebook and the code cannot drift apart. |
| `manual_test.py` | Runs sixteen hand-drawn doodles through a trained model and prints the top ten guesses. |
| `doodles.json` | Those sixteen doodles, as stroke data shared with `scripts/manual-test-345.mjs`. |
| `work/` | Scratch space (cached data, checkpoints, plots). Created on first run; not committed. |
| `export/model-345/` | Where a finished 345-class model is written. Not committed. |

## Integrated 333-class model

A separate supplied model is installed at `public/model-333/` and can be
selected for evaluation by setting `VITE_ENABLE_UNVERIFIED_333_MODEL=true`.
It is not enabled by default because its label ordering is unverified. The source branch `nileshwarke848-droid-patch-1` contained two
parts of a Keras archive; they were joined into
`training/backup/model-333-source/autodraw_333_best.keras` and converted to a
TensorFlow.js GraphModel. Its output labels are the 333 entries in the attached
`class_indices.json`, reordered by the explicit output indices—not the canonical
345-label order. It takes `96 × 96 × 1` grayscale input; the app keeps the
existing 345-class and 100-class models as fallbacks.

The supplied archive did not include the training script, dataset description,
sample counts, or held-out metrics. Thus this repository does not assert that
this model used all 50 million drawings or that it is more accurate. The larger
paired 400-drawing evaluation favored the 345-class model (38.0% vs 20.5% top-1,
70.0% vs 52.5% top-10). See [`evaluation-400-results.md`](evaluation-400-results.md)
for the sampling protocol, intervals, per-drawing outputs and limitations; in
particular, the 333-class result depends on an unverified label map, unknown
training overlap, and provisional normalization. The verified 345-class model
remains the default; the original 100-class model remains as fallback.

---

## Requirements

* **A free Google account** (for Google Colab and Google Drive).
* **A web browser.** Training happens in Colab, so you do not need a powerful
  computer and nothing needs installing locally.
* **Node.js 18+** — only for the last step, installing the finished model into
  SketchAI. Check with `node --version`.

That is all. Colab already ships TensorFlow, NumPy and matplotlib. The notebook's
first cell installs anything else it needs — and it is careful about how it does
it (see [What the setup cell does](#what-the-setup-cell-does)).

You need **no GitHub account, no token and no SSH key**: the repository is public
and is cloned over plain HTTPS.

---

## Quick start (the short version)

1. Open `training/SketchAI_345_Training.ipynb` in Google Colab.
2. Leave `QUICK_TEST = True`, then **Runtime → Run all**.
3. When it finishes, set `QUICK_TEST = False` and **Runtime → Run all** again.
4. Download `sketchai-model-345.zip` when prompted.
5. Unzip it and run `node scripts/install-model-345.mjs ./model-345`.
6. `npm run dev` — the header should say **AI ready — 345 objects**.

Step 2 takes a few minutes and proves everything works. Step 3 is the real
training run and takes hours.

---

## Running in Google Colab — step by step

### 1. Open the notebook

* Push this branch to GitHub (or open the repository on GitHub).
* Go to <https://colab.research.google.com>.
* Choose **GitHub**, paste the repository URL, and open
  `training/SketchAI_345_Training.ipynb`.

### 2. Pick a runtime

**Runtime → Change runtime type → Hardware accelerator → GPU (T4)**, then Save.

A GPU is not required — the notebook runs on CPU too — but a T4 turns a
multi-day run into a few hours. If Colab tells you no GPUs are available, use
**None** and reduce `SAMPLES_PER_CLASS` to 3000.

### 3. Run the quick test first

In the configuration cell, make sure it says:

```python
QUICK_TEST = True      # first run
```

Then **Runtime → Run all**. It trains 20 categories on 500 drawings each for
10 epochs, using **real Google Quick, Draw! data**. Watch for:

* the environment block (Python / TensorFlow / Keras / TensorFlow.js / GPU / RAM),
* `Repository already present` or a successful clone,
* `Exporter smoke test: PASSED` — the converter works in your runtime,
* `Quick Draw dataset reachable` — Google's bucket is reachable,
* the download progress lines,
* `train 8,000   validation 1,000   test 1,000`,
* the model summary ending in a Dense layer with 20 outputs,
* training accuracy climbing over ten epochs,
* `TensorFlow.js load verified`,
* `sketchai-model-345.zip` appearing in the Files panel.

If all of that happens, the pipeline works and you can commit to the long run.

### 4. Run the full training

Change **one line** in the configuration cell:

```python
QUICK_TEST = False     # second run: all 345 categories
```

then **Runtime → Run all** again. Nothing else needs changing.

* `SAMPLES_PER_CLASS = 5000` → 1,725,000 drawings (the safe default).
* `SAMPLES_PER_CLASS = 10000` → 3,450,000 drawings, better model, longer run.

**Optional but recommended:** set `USE_DRIVE = True` so checkpoints are also
written to your Google Drive. If Colab disconnects overnight you can restart
from the saved checkpoint instead of losing the run.

### 5. Expected runtime

There is no honest way to give a precise number: it depends on which GPU Colab
hands you, on how busy the machines are, and on `SAMPLES_PER_CLASS`.

Roughly, for the full 345-class run:

| Setup | Order of magnitude |
| --- | --- |
| Free T4 GPU, 5,000 per class | a few hours |
| Free T4 GPU, 10,000 per class | most of a day |
| CPU runtime, 5,000 per class | days — not recommended |

Colab free runtimes also disconnect after periods of inactivity and have daily
usage limits, so plan for the possibility of restarting. The dataset cache and
(optionally) the Drive checkpoint make a restart cheap.

### 6. Export

At the end the notebook produces, inside `sketchai-model-345.zip`:

```
model-345/
  model.json               network architecture
  group1-shard1of1.bin     trained weights
  classes.txt              the 345 categories, in output-neuron order
  manifest.json            how it was trained + measured accuracy
  ATTRIBUTION.txt          credits and licence notes
```

Cell 15 loads that folder back with TensorFlow.js to confirm it works before you
download anything.

### 7. Install into SketchAI

On your own computer, in the SketchAI repository:

```bash
unzip ~/Downloads/sketchai-model-345.zip        # creates ./model-345

node scripts/install-model-345.mjs ./model-345  # validate + copy to public/model-345/

npm run dev                                     # or npm run build
```

The installer **refuses** to copy anything it cannot verify. It checks:

| Check | Why |
| --- | --- |
| `model.json` and every weight shard exist | a partial copy would fail at load time |
| the network outputs exactly 345 classes | otherwise the app would mislabel every guess |
| input shape is 28×28×1 | that is what the browser sends |
| `classes.txt` has 345 unique labels | duplicates would break the label order |
| `classes.txt` matches `src/data/quickdraw-categories.txt` line for line | output neuron N must mean line N |
| the export is not a self-test model | synthetic-shape exports cannot recognise anything |

To validate without copying: `node scripts/install-model-345.mjs ./model-345 --check`

### 8. Smoke-test the installed model

```bash
node scripts/manual-test-345.mjs
```

This loads `public/model-345` with TensorFlow.js, renders the sixteen doodles in
`training/doodles.json`, pushes them through **the same preprocessing the app
uses**, and prints the top ten guesses for each. If the guesses are sensible, the
model is correctly installed and the label order is right.

---

## Alternative: run it from the command line

If you have a machine with Python 3.9+ and `tensorflowjs` installed:

```bash
python training/train_345.py --quick-test                  # prove the pipeline
python training/train_345.py --samples-per-class 5000      # the real run
python training/train_345.py --help
```

Useful flags:

| Flag | Meaning |
| --- | --- |
| `--samples-per-class N` | drawings per category (default 5000) |
| `--epochs N` | maximum epochs; early stopping usually ends sooner |
| `--batch-size N` | lower it if you run out of memory |
| `--no-augment` | disable the light shift/rotate augmentation |
| `--drive-dir PATH` | also save checkpoints to this folder |
| `--dataset synthetic` | **offline self-test only** — procedural shapes, not real data |
| `--categories N` | trim the category list (debugging) |

`--dataset synthetic` exists so the plumbing can be exercised where Google's
bucket is unreachable. Its exports are marked `is_self_test_only` and the
installer will reject them.

---

## How it works

### The class list is the single source of truth

`src/data/quickdraw-categories.txt` holds the official 345 category names in a
fixed order. The pipeline reads that file, never a directory listing, and writes
the same list back out as `classes.txt` beside the exported model. Output neuron
N therefore always means line N of `classes.txt`. This is the single most common
way a classifier silently produces wrong labels, so it is enforced in three
places: the training script, the export verifier and the installer.

### Dataset

**Where the data comes from.** Google's Quick, Draw! dataset (CC BY 4.0,
© Google, Inc.), downloaded by `fetch_quickdraw_data.py` from the
[`quickdraw.js`](https://www.npmjs.com/package/quickdraw.js) npm package — a
verbatim redistribution of the official data whose own licence file carries the
CC BY 4.0 attribution to Google. The canonical Google Cloud Storage bucket and
the Hugging Face mirror are both unreachable from many sandboxed networks (TLS
connections are dropped), so this mirror is used instead.

Download it once:

```
python training/fetch_quickdraw_data.py
```

This writes 345 `.ndjson.gz` files (13.7 MB) into `training/quickdraw-source/`
and refuses to continue unless the category names match
`src/data/quickdraw-categories.txt` exactly.

**What the files contain.** One gzipped NDJSON file per category, each line a
784-float array — a 28×28 greyscale bitmap, white ink on black, values 0–1.
So the drawings are *already rasterised*; no vector rendering is needed.

**The honest limit.** This mirror ships **100 drawings per category** — 34,500 in
total, not the full 50 million. That is the ceiling for `SAMPLES_PER_CLASS` here,
and the reason a model trained from this source is not state of the art. Do not
substitute synthetic drawings to make the number look bigger.

**The geometry fix.** The upstream package scales strokes by `28 / 256` with no
padding, so every bitmap is stretched edge to edge (measured: 100% of samples
touch the frame). SketchAI's browser pipeline does the opposite — it centres the
ink with `CROP_PADDING = 1.186`, so a drawing occupies ~84% of the frame.
`quickdraw_ndjson.to_app_geometry()` replays the browser's own steps (ink
bounding box → centred square → area-average to 28×28 → lift the 97th-percentile
ink to 1.0) over every training bitmap, so training and inference see the same
geometry. It is documented here rather than done silently because it changes the
pixels the network learns from.

### Memory

Nothing is ever fully loaded into RAM. Each category's slice lives in a
memory-mapped file; the split is just a list of `(category, row)` pairs; and a
Python generator materialises one batch at a time for `tf.data`. Shuffling
happens in that generator (a numpy index array), because a `tf.data` shuffle
buffer holds whole *batches* — one big enough for 1.7 million examples would be
gigabytes.

### Splits

80% train, 10% validation, 10% held-out test, taken **per category** after a
seeded shuffle (`SEED = 42`). The test set is touched exactly once, at the end.
Re-running reproduces the identical partition.

### Input format

`28×28×1`, float32, 0–1, white ink on black — which is what Quick, Draw! bitmaps
already are, divided by 255. The browser's preprocessing (profile `"345"` in
`src/ai/preprocess.js`) reproduces the same geometry: crop the drawing's bounding
box, pad it to ~84% of the frame (`CROP_PADDING = 1.186`), area-average into
28×28, then rescale intensity so the ink peak reaches 1.0.

The 100-class fallback model keeps its own profile (`"100"`) with a lower ink
target and a looser gamma floor, because it was trained elsewhere and that
profile is what measured best for it. The two profiles are separate functions —
`preprocessFor100Model()` and `preprocessFor345Model()` — so improving one can
never quietly degrade the other.

### Augmentation

Very light: ±5% translation and ±2.9° rotation during training only. No flips —
a mirrored umbrella or fork is a different drawing — and no large distortions.

### Model

```
Input (28, 28, 1)
Conv2D 32 → BatchNorm → ReLU → MaxPool
Conv2D 64 → BatchNorm → ReLU → MaxPool
Conv2D 128 → ReLU → GlobalAveragePooling
Dense 256 → Dropout 0.4
Dense 345 → softmax
```

About **215,000 parameters** for 345 classes (~0.9 MB of float32 weights),
comfortably under the 5 MB target. Training uses `SparseCategoricalCrossentropy`,
Adam (lr 1e-3), and tracks top-1, top-3 and top-10 accuracy, with
`EarlyStopping` (patience 4) and `ReduceLROnPlateau`.

> **A note on epochs.** A CNN needs optimiser *steps*, not just epochs. The full
> run gets ~6,700 steps per epoch and converges comfortably. A tiny quick test
> gets ~60, which is why quick tests run 10 epochs with a smaller batch: with
> only 3 epochs a quick test looks broken when it is merely short.

### Output

Two copies of the best model are written to the run directory:

* **`best.keras`** — the modern Keras format, for reloading and further training.
* **`best.h5`** — HDF5. The converter understands some newer `.keras` files and
  rejects others, so **HDF5 is what gets converted**; do not rely on the
  `.keras` file for export.

Alongside them: `classes.txt` (the exact labels the run was trained on), the
training log, accuracy and loss plots, `summary.json`, and the converted package
in `export/model-345/`.

### Export

Conversion goes through `tensorflowjs`, and the notebook verifies it three times:

1. **Before training** — a throwaway five-class model is converted, so a broken
   exporter is discovered in seconds rather than hours later.
2. **After conversion** — `classes.txt` must match the canonical list line for
   line, every weight shard must exist, and the network's output width must equal
   the number of labels.
3. **Reload** — the exported folder is loaded back with TensorFlow.js, the same
   code path `tf.loadLayersModel()` uses in the browser, and the input/output
   shapes are printed.

---

## Measuring the result

`training/manual_test.py` renders sixteen hand-made doodles — dog, fish, house,
bus, shoe, guitar, elephant, lion, train, cat, flower, sun, car, airplane, tree,
umbrella — with the same thin-stroke geometry a browser produces, and prints the
top ten guesses for each. Nine of those categories are ones the old 100-class
model cannot recognise at all, so this is where the expansion should show.

```bash
python training/manual_test.py --model training/work/run/best.h5 --thickness 12
```

Its output is a smoke test on sixteen drawings, **not** a benchmark — quote the
test-split numbers from the notebook for accuracy claims.

---

## Attribution

* **Dataset:** Google Quick, Draw! (<https://github.com/googlecreativelab/quickdraw-dataset>),
  licensed **CC BY 4.0**. The dataset is Google's; we did not create it and did
  not draw any of the training data.
* **Model:** trained *for this project* by this pipeline. It is not Google's
  model, not AutoDraw, and not a third-party checkpoint. SketchAI is not
  affiliated with or endorsed by Google.
* `ATTRIBUTION.txt` ships inside every export with these same credits.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Could not get the SketchAI repository automatically` | The public clone failed. Download the ZIP from GitHub, upload it to the Files panel, `!unzip -q SketchAI*.zip -d /content/`, then re-run the cell. |
| `No module named 'train_345'` | The clone is missing `training/`. Re-run the setup cell — it checks for that file and re-clones if needed. |
| `Exporter smoke test: FAILED` | TensorFlow.js cannot convert in this runtime. Re-run the setup cell; if it still fails, **Runtime → Restart runtime** then Run all. |
| `Quick Draw dataset could not be reached` | The runtime cannot reach Google Cloud Storage. Re-run the cell (transient), or check the runtime has internet access. |
| `No GPU detected` | Fine but slow. Runtime → Change runtime type → T4 GPU, then Run all again. |
| Runtime disconnects mid-run | Set `USE_DRIVE = True`, lower `SAMPLES_PER_CLASS`, re-run from section 3 (data is cached). |
| Out of memory | Lower `BATCH_SIZE` to 128 or 64. |
| Header still says "100 objects" | Run `node scripts/install-model-345.mjs ./model-345 --check`; it prints which test failed. |
| "Label N is X but the canonical list says Y" | The export `classes.txt` is not from this repository's run. Re-run the export cell. |
| Accuracy is awful on real doodles | Check the doodle contact sheet in section 12. If the 28×28 inputs look blank or blobby, the browser preprocessing profile and the training preprocessing disagree. |

---

## What the setup cell does

Colab notebooks usually break in the five minutes *before* any learning happens,
so `colab_setup.py` handles that part defensively. Its rules:

**It never touches TensorFlow if it can avoid it.** `pip install tensorflowjs`
pulls in `tensorflow-decision-forests`, which pins one exact TensorFlow version —
on a newer Colab runtime that either errors out or triggers a ~600 MB TensorFlow
downgrade that can disturb the GPU stack. Instead the notebook installs
`tensorflowjs` with `--no-deps`, adds the small runtime packages it needs, and
registers a harmless placeholder for `tensorflow_decision_forests` (the converter
imports it at module scope but only uses it for decision-forest saved models,
which this project never creates). If TensorFlow's version changes anyway, the
setup reinstalls the version it started with.

**It checks that the clone actually contains the pipeline.** A plain
`git clone` of the default branch can succeed while missing `training/` entirely,
which surfaces ten cells later as a mystery `ModuleNotFoundError`. So the clone is
verified, and alternative branches are tried until one contains
`training/train_345.py`. Cloning happens over public HTTPS with
`GIT_TERMINAL_PROMPT=0`, so a renamed or private repository fails fast with
instructions instead of hanging on a credential prompt.

**It fails early, not late.** Section 2 converts a throwaway five-class model to
TensorFlow.js and probes the dataset bucket — seconds of work that prevent
discovering a broken exporter after hours of training.

**It is idempotent.** Existing checkouts, caches, packages and exports are reused;
nothing fails because a file or folder already exists.

`colab_setup.setup()` prints exactly what it did, and `colab_setup.diagnostics()`
prints the environment block, so a problem can be diagnosed from the output alone.

> **Testing note.** The pipeline was run end to end in a sandboxed Linux
> environment with TensorFlow 2.21, tf-keras 2.21 and TensorFlow.js 4.22, on a
> **CPU with no GPU**: fetch → normalise → train (345 classes) → evaluate →
> export → install → app checks. The full 345-class run took 12.5 minutes.
>
> The Colab-specific pieces of the notebook (GPU detection) were **not** run on
> Google Colab itself — that runtime was not available for this work — and the
> notebook's pre-flight check now validates the local dataset mirror rather than
> Google's bucket, which is unreachable from the sandbox. If the setup cell
> reports something unexpected, its output is designed to say what to do next.

## Training locally (outside Colab)

The pipeline runs as an ordinary script and does not need a GPU. On the machine
used for the run documented in the main README (CPU-only, 4 vCPU) the full
345-class training took about 12.5 minutes.

```
# 1. get the real drawings (13.7 MB, verified against the canonical 345)
python training/fetch_quickdraw_data.py

# 2. prove the pipeline on real data — 20 categories, then check the numbers move
python training/_pilot.py

# 3. the real run: 345 categories, 80/10/10, seed 42
python training/_train_full.py

# 4. install into the app and check it
node scripts/install-model-345.mjs
node scripts/manual-test-345.mjs
node scripts/audit-app.mjs
```

A training environment needs TensorFlow 2.21, `tf_keras` 2.21, `tensorflowjs`
4.22 (installed with `--no-deps`, or it will drag in a conflicting pinned
TensorFlow), NumPy, SciPy and matplotlib. `training/setup_env.sh` builds exactly
that in a virtual environment.
