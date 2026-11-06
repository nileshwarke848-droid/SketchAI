# Training SketchAI's own 345-class classifier

This folder contains everything needed to train a drawing classifier on
**Google's Quick, Draw! dataset** and install it into SketchAI.

The app currently ships the project's **345-class model** at
`public/model-345/`; it is loaded first and was trained by this pipeline. The
original third-party **100-class model** remains bundled at `public/model/` as a
fallback if the primary files fail validation or cannot be loaded. Training a
new checkpoint is an optional reproduction/update workflow, not a prerequisite
to get 345-class recognition from a normal checkout.

> **Zero-budget path only.** The optional full-data workflow uses public GCS
> reads and a free Google Colab runtime; it does not create paid GCP resources.
> Free GPU, disk quota and runtime availability are controlled by Google and are
> not guaranteed. Do not switch to a paid runtime. The full cache uses tens of GB
> of ephemeral Colab disk and is preflighted before bulk transfer. The finished
> model runs offline in the browser; no API keys or cloud inference are required.

---

## Contents

| File | What it is |
| --- | --- |
| `SketchAI_QuickDraw_200_Colab.ipynb` | 200 official training rows/category plus separate validation/test data (250 staged/category, 86,250 total), chunked GCS reads, free-runtime guard. **Start here for the interim run.** |
| `build_200_colab_notebook.py` | Regenerates the 200-row notebook from source. |
| `SketchAI_QuickDraw_50M_Colab.ipynb` | Full official 50M-drawing workflow for the later full-data run. |
| `build_50m_colab_notebook.py` | Regenerates the full-data notebook from source. |
| `SketchAI_345_Training.ipynb` | Small-mirror smoke-training notebook (at most 100 rows/class), not the full archive. |
| `build_notebook.py` | Regenerates the small-mirror notebook. |
| `train_345.py` | Training pipeline, app-compatible 345-label order/export and held-out evaluation. |
| `quickdraw_gcs.py` | Resumable, bounded HTTP byte-range reader for the official public GCS bitmap objects. |
| `colab_setup.py` | Defensive Colab TensorFlow.js exporter setup and environment diagnostics. |
| `manual_test.py` | Renders sixteen manually authored doodle paths and prints a candidate model's top ten guesses. |
| `doodles.json` | Those sixteen doodles, as stroke data shared with `scripts/manual-test-345.mjs`. |
| `work/` | Scratch space (cached data, checkpoints, plots). Created on first run; not committed. |
| `export/model-345/` | Scratch destination for a newly trained/exported candidate. Not committed. |

The deployed primary model is the checked-in `public/model-345/` package in the
repository root. `export/model-345/` is a separate training output; installing a
candidate into the app is an explicit step and should be followed by validation.

---

## Interim run: 200 training examples per class (free-only, not guaranteed)

Open `SketchAI_QuickDraw_200_Colab.ipynb` from the active branch in Colab. It
checks all 345 source objects, runs a 16-row smoke test on two categories, then
requires `START_200_RUN = True` before transfer. It stages 250 rows per class
(86,250 total) and splits them 200/25/25 per category for training, validation
and held-out test, so the model receives 200 training examples per category.
Only the small cache is stored on Colab scratch; no billable GCP resources are
created. The run has not been launched from this session.

## Full 50M-drawing workflow (free-only, not guaranteed)

Open `SketchAI_QuickDraw_50M_Colab.ipynb` from the active GitHub branch in Colab.
It first checks all 345 official GCS objects using small range requests and stops
before downloading bitmap bodies if category coverage or free scratch space is
insufficient. A small 16-row-per-category smoke test on two categories follows;
set `START_FULL_RUN = True` only when you are ready for the long run. The full path streams one bounded
chunk at a time to Colab's ephemeral cache and uses 98% train / 1% validation /
1% held-out test. The entire source archive is never downloaded into this repo or
held in RAM.

The notebook only uses a free Colab runtime; it never provisions a VM, storage
bucket or other billable GCP resource. Google may not offer a free GPU or enough
disk, and may interrupt the runtime. A runtime reset erases the scratch dataset
cache, so completion cannot be promised. If free capacity is unavailable, stop
rather than enabling a paid option. No model training or accuracy gain is claimed
until the run finishes, exports, and is evaluated on its held-out split.

The existing `SketchAI_345_Training.ipynb` is only a small-mirror pipeline check
(100 examples/category maximum). Do not use its sample counts as evidence of a
full-data run.

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

## Quick start (the 200-row interim run)

1. Push/open the active branch in GitHub, then open `training/SketchAI_QuickDraw_200_Colab.ipynb` in Colab.
2. Use a free GPU runtime only if Colab offers it at no cost; never enable billing.
3. Run setup, all-object preflight and the two-category range smoke test.
4. When ready, change `START_200_RUN = False` to `True` and run the training cells.
5. Review the exact 86,250-row manifest (69,000 training, 8,625 each for validation and test) and held-out metrics, then download the model zip.
6. Unzip and run `node scripts/install-model-345.mjs ./model-345 --check` before installing.

Free Colab capacity and completion are not guaranteed. This is the interim 200-row run; the separate 50M notebook remains available for a later full-data attempt.

---

## Running in Google Colab — full dataset

1. Push this branch to GitHub (or open the active branch in GitHub), then open
   `training/SketchAI_QuickDraw_50M_Colab.ipynb` in Colab.
2. Select a free T4 only if available at no cost. If no free GPU is offered, stop;
   a 50M-row CPU run is not a practical substitute. Never enable paid compute.
3. Run the setup and preflight. This checks the canonical 345 labels, the public
   objects' NPY headers, total rows, and free disk. The preflight makes small
   header-range reads only; no bitmap bodies are transferred at this stage.
4. Run the two-category 16-row smoke test. It checks byte-range support and
   preprocessing, not model accuracy.
5. Review `START_FULL_RUN = False`; only set it to `True` if Colab reports enough
   free disk and you are ready to start the long run.
6. The training manifest records the exact source rows and 98/1/1 split. The
   model is exported to a zip but is not installed into the app automatically.

There is no guaranteed runtime estimate or completion promise: free Colab quotas,
GPU access, bandwidth and session durations can change. The cache is on ephemeral
`/content` storage. An epoch-level Drive backup is optional; Drive does not hold
the full dataset. If Colab offers only a paid runtime or insufficient free disk,
stop and retry later rather than switching to a billable option.

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

## Alternative: small-mirror command-line run

If you have Python 3.9+ and the training dependencies installed, the local mirror
mode can exercise the workflow:

```bash
python training/train_345.py --quick-test          # small plumbing check
python training/train_345.py --dataset quickdraw-js # at most 100 rows/class
python training/train_345.py --help
```

For 200 official rows/category, use the dedicated Colab notebook. The CLI mode
is `--dataset quickdraw-gcs-sampled --samples-per-class 200`; run it only in a
cloud runtime after preflight, never in this repository workspace. The separate
`--dataset quickdraw-gcs-full` mode reads every row in the official archive.

Useful flags:

| Flag | Meaning |
| --- | --- |
| `--samples-per-class N` | local-mirror rows per category (full GCS mode reads all rows) |
| `--epochs N` | maximum epochs; early stopping usually ends sooner |
| `--batch-size N` | lower it if you run out of memory |
| `--no-augment` | disable the light shift/rotate augmentation |
| `--drive-dir PATH` | also save checkpoints to this folder |
| `--dataset quickdraw-gcs-sampled` | read `--samples-per-class` rows/category from official GCS; cloud-only |
| `--dataset quickdraw-gcs-full` | full official archive through bounded GCS byte ranges; cloud-only |
| `--gcs-chunk-rows N` | rows per transfer chunk (default 4096) |
| `--dataset synthetic` | **offline self-test only** — procedural shapes, not real data |
| `--categories N` | trim the category list (debugging) |

`--dataset synthetic` exists only for offline plumbing checks. Its exports are
marked `is_self_test_only` and the installer will reject them.

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

**Small-mirror mode.** The `quickdraw-js` source is fetched by
`fetch_quickdraw_data.py` from the [`quickdraw.js`](https://www.npmjs.com/package/quickdraw.js)
npm package, a licensed redistribution of official Quick, Draw! examples. This
source is convenient for local smoke tests and is capped at 100 rows per class.
The separate `quickdraw-gcs-full` mode described below reads the official full
bitmap objects directly from public GCS; it does not depend on this npm mirror.

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

### Full Quick, Draw! source and streaming path

Google documents about 50 million drawings across 345 categories and publishes
28×28 `numpy_bitmap` objects at
`gs://quickdraw_dataset/full/numpy_bitmap/` under CC BY 4.0. The full workflow
uses the same official source via public HTTPS byte ranges; the [Google Quick,
Draw! repository](https://github.com/googlecreativelab/quickdraw-dataset) is the
source documentation. The [Hugging Face dataset](https://huggingface.co/datasets/google/quickdraw)
is another representation/transport of the same upstream data, not an independent
set to concatenate.

`quickdraw_gcs.py` probes each NPY header and then requests bounded row ranges,
preprocesses one chunk at a time into a memory-mapped cache, and writes progress
metadata for category-level resumption. It refuses HTTP servers that ignore Range
requests; no full-object fallback is allowed. `SketchAI_QuickDraw_50M_Colab.ipynb`
preflights all 345 objects and free scratch-disk space before downloading bitmap
bodies. No source files or cache are written into this Git workspace.

**Execution status:** this cloud path is implemented but has **not** been run in
this session. No full drawings have been downloaded or streamed, no new training
has run, and the checked-in app model has not changed from this request. Free
Colab runtime/GPU/disk availability is not guaranteed, and this notebook creates
no paid cloud resources. Only report training or accuracy changes after an actual
full-data run and held-out evaluation. No alternative sketch dataset was added;
TU-Berlin licensing descriptions conflicted and were not safe to rely on.

### Memory

Nothing is ever fully loaded into RAM. Each category's slice lives in a
memory-mapped file; the split is just a list of `(category, row)` pairs; and a
Python generator materialises one batch at a time for `tf.data`. Shuffling
happens in that generator (a numpy index array), because a `tf.data` shuffle
buffer holds whole *batches* — one big enough for 1.7 million examples would be
gigabytes.

### Splits

The local mirror default is 80% train / 10% validation / 10% held-out test. The
full-data Colab notebook uses 98% / 1% / 1% to retain a large training set while
keeping a substantial 500k-example-scale test split. Both splits are stratified
per category with a seeded shuffle (`SEED = 42`), so rows do not overlap and the
held-out test set is used only for final evaluation.

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

The committed primary model's held-out split metrics are recorded in its
`public/model-345/manifest.json`: top-1 37.71%, top-3 58.12%, top-10 76.12%
on 3,450 test drawings (100 examples per each of 345 classes, split with seed
42). These are results for that particular training run.

For an end-to-end smoke test on the repository's 16 manually authored stroke
examples (not real user-drawn input), run the checked-in model through the app's
TensorFlow.js inference and preprocessing:

```bash
node scripts/demo-test.mjs                 # current 345-class model
node scripts/demo-test.mjs --force-fallback # bundled 100-class fallback
```

In the current checkout, the 345-class model placed the intended class at
rank 1 for 7/16 sketches, in the top 3 for 8/16, top 5 for 10/16, and top 10 for
14/16. The fallback placed the intended class in its top 10 for 7/16. These
small, hand-authored examples are a smoke test—not a benchmark, independent test
set, or guarantee of user accuracy. Use the held-out test split for training
metrics, and use a broader human-drawn evaluation set before making product
accuracy claims.

`training/manual_test.py` can also evaluate a newly trained Keras candidate before
installation, for example:

```bash
python training/manual_test.py --model training/work/run/best.h5 --thickness 12
```

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
| `Quick Draw dataset could not be reached` | The small-mirror notebook cannot find `training/quickdraw-source`; run `python training/fetch_quickdraw_data.py`. For full GCS data, use the separate 50M notebook. |
| `No GPU detected` | The small-mirror smoke notebook can proceed slowly on CPU. The full 50M notebook stops; retry later only if Colab offers free GPU capacity. |
| Runtime disconnects mid-run | Set `USE_DRIVE = True`, lower `SAMPLES_PER_CLASS`, re-run from section 3 (data is cached). |
| Out of memory | Lower `BATCH_SIZE` to 128 or 64. |
| App unexpectedly reports "AI ready — 100 objects" | The fallback is active. Check the displayed fallback reason, verify `public/model-345/` contains its model, weight shard and 345 labels, then run `node scripts/audit-app.mjs` to check the primary load path. |
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

**It fails early, not late.** The small-mirror notebook converts a throwaway
five-class model and checks the local mirror before training. The full-data
notebook separately probes all GCS NPY headers and checks free scratch space
before any bitmap bodies are downloaded.

**It is idempotent.** Existing checkouts, caches, packages and exports are reused;
nothing fails because a file or folder already exists.

`colab_setup.setup()` prints exactly what it did, and `colab_setup.diagnostics()`
prints the environment block, so a problem can be diagnosed from the output alone.

> **Testing note.** The existing small-mirror path and app export were tested
> earlier in a sandboxed Linux environment; that run used at most 100 examples
> per class and is not evidence of full-archive training. The new GCS byte-range
> loader has offline unit tests for range enforcement, chunking, preprocessing,
> resume behavior and training-pipeline integration.
>
> Neither full-data Colab execution nor its free GPU/disk availability has been
> tested or guaranteed. No full archive has been downloaded or streamed in this
> session, and the checked-in model remains unchanged. If Colab has no free
> runtime with sufficient disk, stop instead of enabling paid compute.

## Training locally (outside Colab)

The small-mirror pipeline runs as an ordinary script and does not need a GPU.
The earlier CPU-only 4-vCPU run took about 12.5 minutes for 345 labels with at
most 100 examples per class. That is not the full 50M archive. The GCS full mode
is intended for a free cloud runtime after preflight, not for this workspace.

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
