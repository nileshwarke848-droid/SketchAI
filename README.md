# SketchAI

SketchAI is a browser-based drawing studio inspired by AutoDraw. Draw a rough
object, see a neural network's ranked guesses and scores, and accept a clean
illustration as an editable scene object. No account, backend, API key or paid
service is required; recognition runs locally in the browser. The current editor
does not save or export a drawing, so work lasts only for the open page session.

## Features

- Mouse, trackpad, stylus and touch input with select, pencil, text, fill, eraser and pan tools; fill, background and object colors include custom pickers.
- Text is a structured scene object: add it inline, edit by double-clicking, then move, resize, rotate, recolor, change its safe font family, size, weight and alignment, duplicate, reorder or delete it.
- Zoom from 25% to 400% with pointer-anchored wheel zoom, step controls and reset. Pan with Space + drag or the Hand tool; view navigation never changes document coordinates.
- Flood-fill enclosed regions on a dedicated raster layer beneath editable scene objects. Set the entire canvas background separately, with one-step undo/redo and Reset to White.
- Local AI recognition after a 600 ms pause; the 345-class model's top 10 ranked
  classes drive a horizontally scrollable strip of up to 12 cards (primary artwork
  plus a few distinct variants). The fallback model covers 100 classes.
- "AI thinks you might be drawing…" framing: the panel reports the model's
  uncertainty (for example `Cat 54% · Dog 31% · Tiger 8%`) instead of claiming a
  certain answer.
- Accepted illustrations are structured scene objects, not flattened pixels:
  select, move, proportionally resize, rotate, recolor, duplicate, flip, reorder
  one layer at a time, and delete them independently.
- Undo/redo covers sketching, erasing, text and artwork edits, flood fills,
  background changes and clear. History keeps the most recent 24 completed
  actions. Zoom and pan are view-only. Use Ctrl/Cmd+Z to undo and
  Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y to redo.
- PNG download/export is intentionally not part of the product. The workspace
  prioritizes keeping clean artwork editable instead of flattening it into a file.
- A short “How it works” explanation for a school demonstration.

## Technologies used

React, Vite, JavaScript, TensorFlow.js and the HTML Canvas API. Lucide provides
the vector icons.

## The AI model

SketchAI can run two classifiers. The **345-class model** is SketchAI's own: it
was trained for this project on Google's Quick, Draw! dataset and is used
whenever its files are present. The **100-class fallback** below is a
third-party model and takes over automatically if the 345-class files are
missing, incomplete or fail validation.

### The 345-class model (trained for this project)

This is **SketchAI's classifier trained on the Google Quick Draw dataset**. It is
*not* Google's model, not AutoDraw and not a third-party checkpoint: every weight
was produced by `training/train_345.py` in this repository.

| | |
| --- | --- |
| Files | `public/model-345/model.json` + `public/model-345/group1-shard1of1.bin` (0.83 MB, one shard) |
| Dataset | [Google Quick, Draw!](https://github.com/googlecreativelab/quickdraw-dataset) — CC BY 4.0, © Google, Inc. |
| Data access path | The checked-in model used the licensed `quickdraw.js@1.0.6` npm redistribution. A full-data, chunked public-GCS Colab workflow is now prepared in `training/SketchAI_QuickDraw_50M_Colab.ipynb`, but has not been run; the current weights still use the 100/class mirror. |
| Examples per class | **100** — the maximum that mirror provides (34,500 drawings total, not the full 50 M) |
| Split | 27,600 train / 3,450 validation / 3,450 test, stratified per class, `SEED = 42` |
| Input | `[1, 28, 28, 1]` float32, white ink on black, values 0–1 |
| Output | 345 softmax probabilities |
| Parameters | 214,649 |
| Test accuracy | **top-1 37.7% · top-3 58.1% · top-10 76.1%** (held-out split; random baseline 0.29%) |
| In-repository 16-doodle smoke test | top-1 7/16 · top-3 8/16 · top-5 10/16 · top-10 14/16 (manually authored stroke paths; not an independent benchmark) |

Architecture (unchanged from the design target):

```
Conv2D(32, 3×3, same) → BatchNorm → ReLU → MaxPool(2×2)
Conv2D(64, 3×3, same) → BatchNorm → ReLU → MaxPool(2×2)
Conv2D(128, 3×3, same) → ReLU
GlobalAveragePooling2D → Dense(256, relu) → Dropout(0.4) → Dense(345, softmax)
```

Preprocessing is the same pipeline the browser runs (`src/ai/preprocess.js`,
profile `"345"`): find the ink bounding box, take a centred square
`max(w, h) × 1.186`, area-average it into 28×28, then lift the 97th-percentile
ink value to 1.0 (minimum gamma 0.25). The source bitmaps were re-normalised
into exactly that geometry before training, so training and inference see the
same thing.

Training used Adam (lr 1e-3) with `EarlyStopping`, `ReduceLROnPlateau` and
`ModelCheckpoint`, batch size 128, 60 epochs (best at 57) on a **CPU-only**
machine (no GPU) with TensorFlow 2.21.0 / Python 3.11 — about 12.5 minutes.
Augmentation was light translation and rotation (±5%, ±2.9°) plus deliberate
**pen-width invariance**: Quick, Draw! strokes are ~1.5 px wide on the 28×28
grid, while a browser pen on SketchAI's 1200×720 canvas is only ~0.3–0.6 px, so
each training image was randomly thickened, thinned or gamma-shifted. The model's
held-out test score is recorded above. For a separate, small smoke test on
manually authored stroke paths, run `node scripts/demo-test.mjs`; its current
results are listed above. These datasets and methods differ; do not compare them
as if they were one benchmark.

See [Training our own 345-class model](#training-our-own-345-class-model) for how
to reproduce it and the [training attribution notes](training/README.md#attribution).
The generated training export includes attribution metadata; the checked-in app
assets are documented separately below.

**100-class fallback model (bundled).** This is the third-party pretrained model
kept as a fallback; it is distinct from the project's primary 345-class model.

| | |
| --- | --- |
| File | `public/model/model.json` + `public/model/group1-shard1of1.bin` (~0.5 MB) |
| Source | [Aniket Dogra's GuessTheDoodle](https://github.com/AniketDogra/GuessTheDoodle) (MIT, © 2019 Aniket Dogra) |
| Format | Keras 2.2.4 `Sequential` CNN exported with the TensorFlow.js converter 1.2.6 |
| Input | `[1, 28, 28, 1]` float32, white ink on black, values 0–1 |
| Output | 100 softmax probabilities (`Dense(100, activation="softmax")`) |
| Labels | `public/model/classes.txt`, one class per line, in model-output order |
| Dataset | [Google Quick, Draw!](https://github.com/googlecreativelab/quickdraw-dataset) 28×28 grayscale bitmaps, up to 5,000 images per class (CC BY 4.0) |

Architecture (from `model.json`, verified against the author's training notebook):

```
Conv2D(16, 3×3, relu, valid) → MaxPool(2×2)
Conv2D(32, 3×3, relu, same)  → MaxPool(2×2)
Conv2D(64, 3×3, relu, same)  → MaxPool(2×2)
Conv2D(128, 3×3, relu, same) → MaxPool(2×2)
Flatten → Dense(128, relu) → Dense(100, softmax)
```

It was trained by the model's author with Adam, batch size 256, 10 epochs and
categorical cross-entropy. The class order in `classes.txt` is the order the
model's 100 outputs were trained with; SketchAI loads the list from the same
release as the weights and refuses to run if the two disagree on class count.
The displayed percentages come straight from the model's softmax output.

### Supported classes of the 100-class fallback

The following list belongs only to the third-party fallback model. The primary
345-class model uses the complete official Quick, Draw! category list in
`public/model-345/classes.txt`.

```
drums, sun, laptop, anvil, baseball_bat, ladder, eyeglasses, grapes, book, dumbbell
traffic_light, wristwatch, wheel, shovel, bread, table, tennis_racquet, cloud, chair, headphones
face, eye, airplane, snake, lollipop, power_outlet, pants, mushroom, star, sword
clock, hot_dog, syringe, stop_sign, mountain, smiley_face, apple, bed, shorts, broom
diving_board, flower, spider, cell_phone, car, camera, tree, square, moon, radio
hat, pizza, axe, door, tent, umbrella, line, cup, fan, triangle
basketball, pillow, scissors, t-shirt, tooth, alarm_clock, paper_clip, spoon, microphone, candle
pencil, envelope, saw, frying_pan, screwdriver, helmet, bridge, light_bulb, ceiling_fan, key
donut, bird, circle, beard, coffee_cup, butterfly, bench, rifle, cat, sock
ice_cream, moustache, suitcase, hammer, rainbow, knife, cookie, baseball, lightning, bicycle
```

Both `flower` and `sun` are in the fallback list. Classes such as `house`,
`fish`, `dog` and `heart` are not predicted by this 100-class model; it can only
return one of the listed labels. The primary 345-class model has broader coverage,
but it still always ranks one of its known classes and has no explicit unknown-
object rejection.

### Suggestion artwork

Every one of the 345 official categories has metadata (display name, icon key,
tier, source) in `src/data/categories.js`, and 323 of them have a bundled vector
icon in `src/data/icons.js`:

| Tier | Meaning | Count |
| --- | --- | --- |
| A | Icon depicts the object | 265 |
| B | Recognisable stand-in | 58 |
| C | No honest icon — the card shows the category name as typography | 22 |

Artwork comes from Fluent Emoji Flat (MIT), Noto Emoji (Apache-2.0) and Material
Design Icons (Apache-2.0), plus separately credited imported and derived line art;
all assets are bundled locally. Categories and artwork are reviewed against
rendered sheets. With the 345-class model, any official category can be predicted,
but 22 categories have no insertable illustration and appear as typographic cards.
The fallback can predict only its own 100 labels. For the first 50 canonical
categories, the variant pool now has at least three distinct additional SVG
options plus a separate line-art option. The original drawings live in
`src/data/first50-artwork.js`; source versions and licenses are pinned in
`scripts/oss-art-sources.mjs`, with the generated icon map and per-icon
attribution records in `src/data/imported-art-variants.js` and
`scripts/oss-art-variant-credits.json`.

![Artwork coverage for the 345 categories](docs/images/artwork-coverage.png)

### Why SketchAI trains its own 345-class model instead of bundling one

All 345 official Quick, Draw! categories need a model with 345 outputs. The obvious
candidate, [yining1023/doodleNet](https://github.com/yining1023/doodleNet)
("DoodleClassifier_345", ~50k drawings per class), was investigated and rejected:

- **License:** the GitHub API reports `license: null`, there is no `LICENSE` file
  in the repository or anywhere in its 26-commit history, and neither the README
  nor the training notebook grants redistribution rights. Copyright therefore
  defaults to all rights reserved, so redistributing its weights is not permitted.
- **Mislabelled order:** its `class_names.txt` is not in the official category
  order, so its output index → name mapping would have had to be derived
  separately. Shipping a guessed mapping could silently mislabel every prediction.
- It also has a malformed first layer, and its training data is described as
  "50k per class" rather than the definitive Quick Draw counts.

A search for an alternative found no browser-ready 345-class model with a
redistribution licence (other Quick, Draw! CNN projects on GitHub carry no licence,
`NOASSERTION`, or ship code only, with no weights). Rather than ignore the licensing
problem just because a repository is public, SketchAI **trains its own** classifier
on the Quick, Draw! dataset itself — the dataset is CC BY 4.0 and explicitly
redistributable, so the resulting weights are ours to ship.

The honest trade-off: the checked-in model was trained from a mirror that provides
100 drawings per class, so it used 34,500 drawings—not the full 50 million. Its
top-1 accuracy is 37.7% on that model's held-out split. Free-only Colab
workflows are prepared for an interim run with 200 training examples/class plus
held-out data (`training/SketchAI_QuickDraw_200_Colab.ipynb`) and the full official
archive (`training/SketchAI_QuickDraw_50M_Colab.ipynb`). Neither has been run here; the
checked-in weights remain unchanged, and no new training or accuracy improvement
is claimed until a run completes and is evaluated.

The rest of the app is built to be class-count agnostic:

- the full official list of 345 categories lives in
  `src/data/quickdraw-categories.txt` (CC BY 4.0), with metadata for every class;
- recognition, the panel and the suggestion strip are all class-count agnostic
  (top 10, live count in the status pill);
- the artwork library covers 323 of the 345 categories already.

The app loads the project's 345-class model first and reports the active class
count. The 100-class third-party model is a real fallback, not a padded extension;
if it is active, the UI reports 100 classes and explains the fallback.

### Training our own 345-class model

The licensing problem above has a clean solution: **train the model ourselves**
on Google's Quick, Draw! dataset, which *is* clearly licensed (CC BY 4.0). The
complete pipeline lives in [`training/`](training/README.md) and has been run —
the result is the 345-class model described above.

```
training/train_345.py                  training and app-compatible export pipeline
training/quickdraw_gcs.py              chunked full-archive GCS range loader
training/SketchAI_QuickDraw_200_Colab.ipynb  free-only 200/class Colab run (not yet run)
training/SketchAI_QuickDraw_50M_Colab.ipynb  free-only full-data Colab workflow (not yet run)
training/quickdraw_ndjson.py           loads + normalises the small local mirror
training/fetch_quickdraw_data.py       downloads the small dataset mirror
training/manual_test.py                16 authored doodle paths -> top 10
scripts/install-model-345.mjs          validate + install a trained model
scripts/audit-app.mjs                  end-to-end app checks (no browser needed)
training/SketchAI_345_Training.ipynb   small-mirror smoke notebook
```

Real Quick, Draw! drawings -> re-normalised into SketchAI's own 28×28 geometry ->
memory-mapped batches (never the whole dataset in RAM) -> a 214,649-parameter CNN
-> TensorFlow.js export -> `public/model-345/`.

The **small-mirror** training run documented above took about 12.5 minutes on a
CPU; that timing does not apply to the full 50M archive. For full data, use the
free-only Colab workflow linked above; Google may not offer enough GPU time or
disk, so completion is not guaranteed. The category order always comes from
`src/data/quickdraw-categories.txt`, never from a directory listing.

### Two models, one app

| | Primary | Fallback |
| --- | --- | --- |
| Classes | 345 (ours, trained here) | 100 (MIT third-party) |
| Location | `public/model-345/` | `public/model/` |
| Preprocessing | profile `"345"` | profile `"100"` (frozen) |
| Status pill | "AI ready — 345 objects" | "AI ready — 100 objects" |

The 345-class model is tried first. Its model, weights and labels are committed
under `public/model-345/`, so a normal checkout uses it. If those files cannot
be loaded or fail validation, the app falls back to `public/model/` and shows
"Extended AI unavailable — using 100-object model". Drawing, object editing and
undo/redo remain available either way. Each model has its own preprocessing
profile because the models were trained differently.

## How AI recognition works

A separate transparent canvas tracks the current sketch, so inserted
illustrations never reach the model.

1. **Bounds** – the alpha channel of the sketch canvas is read once, and the
   bounding box of every inked pixel is computed.
2. **Guards** – a blank canvas or an accidental tap (fewer than 240 ink pixels or
   a bounding box under 16 px) is never sent to the network; the panel explains
   that more drawing is needed.
3. **Crop** – a centred square around that box, `1.186 ×` the box's longest side,
   is used. That ratio reproduces the Quick, Draw! rasterisation, where a cartoon
   is scaled to fill about 84% of the 28 × 28 frame. Aspect ratio is preserved,
   and the padding keeps petals, rays, wheels and antennae inside the frame.
4. **Resample** – each of the 28 × 28 cells is an area average of the source
   pixels, so thin strokes fade rather than disappear.
5. **Contrast normalisation** – browser strokes can become pale after resampling.
   The primary 345-class profile raises the 97th-percentile ink value to 1.0
   (with a minimum gamma of 0.25), matching its full-opacity training bitmaps.
   The separate 100-class fallback profile targets 0.9 with a 0.15 minimum gamma.
   Both adjust intensity without moving the sketch geometry.
6. **Inference** – `tf.tensor4d(ink, [1, 28, 28, 1])` is passed once to the
   active model's `predict()` inside `tf.tidy()`, the scores are sorted, and the
   top ten classes are kept. The 345-class primary and 100-class fallback are not
   ensembled: the fallback is loaded only when the primary cannot be used. The
   panel shows the best guess plus four alternatives; the strip can show up to 12
   cards including distinct artwork variants. Scores below 0.5% are shown as
   `<1%` rather than `0%`, and a best guess under 45% changes the wording to
   “AI isn't completely sure. Maybe:”. WebGL is used when available and the CPU
   backend otherwise.

Recognition is debounced: one prediction runs ~600 ms after drawing stops, and a
new stroke cancels the pending timer, so the interface stays responsive.

![What the network receives for a flower sketch, before and after the preprocessing fix](docs/images/preprocessing-flower.png)

The displayed values are ranked softmax scores, **not calibrated guarantees of
correctness**. The primary model recognizes 345 classes and can still make
mistakes; the fallback recognizes 100. Simple, centered, single-object doodles
tend to work best, and neither model has an explicit unknown-class response.
Accepted illustrations are rendered deterministically from the editable scene
objects. A separate temporary sketch canvas feeds the recognizer, so accepted
artwork never enters the model input and rough drawing never changes it.

## Editable workspace and export decision

Accepted illustrations and text become structured scene objects. Artwork stores
its immutable variant and transforms; text stores its content, safe font settings,
size, alignment, position and transforms. The scene-object list is the source of
truth, and the clean-art canvas is only a deterministic render of that list.
Rough sketch ink and flood-fill pixels live on separate raster canvases. Flood
analysis temporarily composites visible layers for boundary detection but never
flattens or mutates scene objects. The entire canvas background is a separate
undoable color value.

The document remains in one 1200 × 720 logical coordinate space. A CSS view
transform provides zoom and pan; pointer conversion inverts that transform for
all tools and selection handles. Changing the view does not move or scale scene
data. Completed content actions—including text edits, fills and background
changes—are one undo step each; view navigation is not in document history.

PNG download/export was intentionally removed as a product decision. SketchAI's
workspace is focused on editable scene objects rather than flattening the current
canvas composition into a PNG. There is no download button, export fallback,
transparent-export setting or PNG export helper in the browser editor.

## Inspecting the model input (development only)

Every prediction can be inspected visually. In a development build the
“Preprocessing inspector” appears under the prediction panel; on a deployed build
open `?debug=ai` to show it. It displays the original canvas, the cropped and
centred region, and the exact 28 × 28 grayscale image sent to the network, plus
the detected bounds, crop side, ink peak → gamma and backend.

## Running locally

Requires a recent Node.js LTS release (Node 20 or newer is recommended).

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Model files and fonts are included in the
application; no inference request or API key is needed. The initial application
and its assets must be served over HTTP, rather than opened directly as a file.

## Building and deploying

```bash
npm run build
npm run preview
```

The static output is in `dist/`. Deploy that folder to Vercel, or publish it to
GitHub Pages (for example using a Pages workflow). Vite uses relative asset paths,
including for the model, so it works under a repository subpath. On Vercel use
`npm run build` as the build command and `dist` as the output directory.
TensorFlow.js ships as its own chunk (`assets/tfjs-*.js`, ~1.6 MB / 250 kB gzipped).

## Testing

There is no `npm test` script yet. After `npm ci`, the repository checks can be
run directly:

```bash
npm run build
for f in scripts/test-*.mjs; do node "$f" || exit 1; done
node scripts/audit-app.mjs
node scripts/audit-app.mjs --force-fallback
node scripts/demo-test.mjs
node scripts/demo-test.mjs --force-fallback
```

The app audit uses a DOM/canvas harness and the demos run inference on CPU; these
checks are not a substitute for testing real browsers, WebGL, touch or stylus
hardware.

## Audit and measurements

`docs/AI-AUDIT.md` is a historical audit of the original 100-class fallback's
preprocessing and test results. Its accuracy figures are not current metrics for
the primary 345-class model.

## Release notes

`docs/RELEASE-345.md` is a historical release record for the 345-category
licensing investigation, top-10 predictions, artwork library and release tests.
It also notes that its PNG export feature has since been intentionally retired.

## Limitations

- The primary CNN was trained on 100 drawings per class (34,500 total), not the
  much larger complete Quick, Draw! dataset. Its held-out test accuracy is
  top-1 37.7%, top-3 58.1% and top-10 76.1%. Expect misses, especially on unusual
  styles. The in-repository 16-doodle smoke test is small and is not a benchmark.
- 28 × 28 grayscale input loses fine detail; texture, color and small features do
  not contribute to recognition.
- The primary model predicts among 345 Quick, Draw! labels; the fallback is
  restricted to its 100 labels. Neither model rejects unknown objects, so an
  unsupported or ambiguous drawing can receive a confident but incorrect guess.
- 323 of 345 categories have artwork in the library; 22 appear as typographic
  cards without insertable illustration. The 100-class fallback can surface only
  its own labels.
- Recognition uses the current unfinalized sketch as one image. Multiple objects
  drawn before accepting a suggestion are classified together.
- The interface has no save/load or export feature. Work is held in browser
  memory and can be lost when the page is refreshed or closed; PNG export was
  intentionally removed.
- Inference speed and backend availability depend on the device. WebGL is used
  when available, with a CPU fallback; real-browser and real-device performance
  should be tested on target hardware.
- Very thick pens on very small drawings can overfill the frame; intensity
  normalization cannot recover details that have already merged.

## Model attribution

SketchAI's 345-class classifier is **trained for this project** using Google's
Quick, Draw! dataset. It is not Google's model, not AutoDraw, and not a
third-party checkpoint. SketchAI is not affiliated with or endorsed by Google.

The dataset is Google's; we did not create it and did not draw any of the
training data. The model-training/export pipeline includes an `ATTRIBUTION.txt`
with these credits. (The editor itself currently has no user-facing export.)
`training/README.md` documents the dataset source, license, sample counts,
architecture, preprocessing and measured metrics.

## Credits / licenses

- Model and labels: [GuessTheDoodle](https://github.com/AniketDogra/GuessTheDoodle),
  MIT; the license text is included in `public/model/LICENSE`.
- Category names: Google's official Quick, Draw! category list, CC BY 4.0
  (`src/data/quickdraw-categories.txt`, license text alongside it). We did not
  create the dataset and did not draw the training data.
- Suggestion icons: [Fluent Emoji Flat](https://github.com/microsoft/fluentui-emoji)
  (MIT), [Noto Emoji](https://github.com/googlefonts/noto-emoji) (Apache-2.0) and
  [Material Design Icons](https://github.com/Pictogrammers/MaterialDesignIcons)
  (Apache-2.0), via the Iconify JSON packages. Bundled, not fetched.
- Training data: [The Quick, Draw! Dataset](https://github.com/googlecreativelab/quickdraw-dataset),
  Google, Inc., CC BY 4.0. The dataset itself is not bundled here.
- Interface icons: [Lucide](https://lucide.dev/), ISC license.
- Fonts: DM Sans and DM Serif Display, distributed through
  [Fontsource](https://fontsource.org/), SIL Open Font License 1.1.
- React, Vite and TensorFlow.js are open-source dependencies; see their
  respective package licenses.
