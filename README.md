# SketchAI

SketchAI is a small, browser-based drawing studio. Draw a rough object, see a
pretrained neural network's top guesses and their confidence scores, and accept
a clean illustration as an editable scene object. No account, backend,
API key, or paid service is required. Your drawing stays in your browser.

## Features

- Mouse, trackpad, stylus and touch input with select, Select Doodle, pencil, editable line, rectangle, ellipse/circle and arrow, text, fill, eraser and pan tools. Shape geometry stays parametric: line and arrow endpoints, arrowhead style, outline, fill and stroke width can be edited; Shift constrains shape proportions or line angles. Shapes use the shared move, resize, rotate, flip, recolor, layer and undo controls. The selection toolbar includes a signed thickness adjustment with an explicit Apply action; it affects hand-drawn marks, parametric shape strokes and genuine outlined suggestion artwork, but leaves solid filled artwork and text unchanged. Thickness is editable and undoable. Each finished pencil drag is its own editable object; Shift, marquee and Select Doodle can select multiple strokes. With Guessing enabled, selecting hand-drawn strokes/shapes refreshes recognition; selected hand-drawn marks are combined, while suggested artwork and text are excluded.
- **Select Doodle** makes a closed freehand loop select enclosed or crossed objects, while an open doodle selects the objects it touches. It never erases; hold Shift to add to the current selection. Its dotted outline defaults to blue and has its own color picker.
- Two eraser modes. **Classic** erases sketch ink and removes any object the
  stroke crosses. **Doodle** is a brush-like eraser that trims live while you
  drag: it shaves pixels off illustrations, text and doodle remnants, and keeps
  whatever survives as a normal editable object that can be moved, resized,
  rotated, recolored, duplicated, flipped, reordered or deleted. Rubbing out
  part of a pencil doodle converts the remaining ink into editable doodle
  objects too, so nothing you draw is ever trapped as flat pixels.
- Text is a structured scene object: add it inline, edit by double-clicking, then move, resize, rotate, recolor, change its safe font family, size, weight and alignment, duplicate, reorder or delete it.
- Zoom from 25% to 400% with pointer-anchored wheel zoom, step controls and reset. Pan with Space + drag or the Hand tool; view navigation never changes document coordinates.
- Bucket-fill enclosed regions directly into the object you click, so filled shapes remain selectable, resizable, recolorable and erasable as one scene object. Fills on empty canvas stay on a dedicated raster layer beneath editable objects. Set the entire canvas background separately, with one-step undo/redo and Reset to White.
- Live AI recognition refreshes about every 220 ms while you draw, followed by a final check shortly after each stroke; the top 10 probabilities drive a horizontally scrollable strip of clean suggestion cards.
- The **Guessing** switch beside Clear canvas turns AI suggestions on or off. No hides the suggestion and prediction panels and stops model loading/inference while leaving the drawing tools usable. The preference is remembered on that device; turning it back on reloads the model and checks the current sketch.
- "AI thinks you might be drawing…" framing: the panel reports the model's
  uncertainty (for example `Cat 54% · Dog 31% · Tiger 8%`) instead of claiming a
  certain answer.
- Doodle-erased remainders and converted doodles are structured scene objects
  too, with their own stack position, rotation and flip preserved.
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

## Search and AI-crawler setup

The page includes a descriptive title and summary, Open Graph/Twitter metadata,
SoftwareApplication and FAQ structured data, crawlable product/FAQ copy, a
permissive `robots.txt`, `llms.txt` with a factual project overview, and the
Google Search Console HTML verification file. After deployment, the
verification file should be available at
`/googleacdd14b6f7c7efb9.html`. The sitemap and canonical URL are generated
only when the deployment's real HTTPS origin is configured; this avoids
publishing a guessed Vercel URL or a non-canonical preview URL.

For production on Vercel, add the project environment variable
`VITE_SITE_URL` with the canonical origin only (for example,
`https://sketchai.example`, with no path or trailing slash), then redeploy. The
build will add canonical/Open Graph URLs, the absolute application URL in
structured data, social-card image URLs, and `sitemap.xml` plus its `robots.txt`
reference. Use the stable production hostname (a custom domain or Vercel's
production `*.vercel.app` hostname), not a per-deployment preview URL. Without
this setting, the build omits canonical URLs and the sitemap rather than
emitting placeholders.

These files improve crawlability and machine-readable context, but do not
promise search ranking or rich-result placement. Google and other search
engines control indexing and feature eligibility.

## Technologies used

React, Vite, JavaScript, TensorFlow.js and the HTML Canvas API. Lucide provides
the vector icons.

## The AI model

SketchAI uses its verified **345-class project-trained model** by default,
then the original **100-class third-party fallback**. A supplied **333-class
model** is included for evaluation, but it is not selected automatically until
its attached class-index map is verified against the learned output ordering.
Each enabled candidate is validated at load time; if it is missing, incomplete
or invalid, the app advances to the next one. The 333-class model's conversion
is verified against the source model, but its label semantics and training-data
provenance are not. A 400-drawing paired evaluation currently favors the
345-class model by 17.5 percentage points at top-1 and top-10; see the
[evaluation report](training/evaluation-400-results.md). Because the 333 model's
label map and normalization remain unverified, keep its results provisional.
To opt in for evaluation, build with `VITE_ENABLE_UNVERIFIED_333_MODEL=true`.

### Supplied 333-class model (provisional)

| | |
| --- | --- |
| Files | `public/model-333/` (GraphModel, weight shards and 333 labels) |
| Source | Joined Keras archive and attached class map in `training/backup/model-333-source/` |
| Input / output | `[1, 96, 96, 1]` grayscale input / 333 softmax outputs |
| Label ordering | `classes.txt` is sorted by the attached map's indices (0–332); its alignment with the trained output neurons remains unverified |
| Training provenance | Dataset, normalization details and held-out evaluation metrics were not included in the source artifact |
| Paired 400-drawing test | 333-class: 20.5% top-1, 33.8% top-3, 40.5% top-5, 52.5% top-10; 345-class: 39.5%, 58.2%, 64.2%, 70.5%. Full protocol and uncertainty limits: [evaluation report](training/evaluation-400-results.md). |

The conversion was checked on a random input against the joined Keras model
(maximum absolute output difference below 8e-8). This verifies conversion
fidelity, not label semantics or predictive quality. See
[`public/model-333/manifest.json`](public/model-333/manifest.json).

### The 345-class model (trained for this project)

This is **SketchAI's classifier trained on the Google Quick Draw dataset**. It is
*not* Google's model, not AutoDraw and not a third-party checkpoint: every weight
was produced inside this repository — by `training/train_345.py`, then refined by
`training/refine_model_345.py`.

| | |
| --- | --- |
| Files | `public/model-345/model.json` + `public/model-345/group1-shard1of1.bin` (0.88 MB, one shard) |
| Dataset | [Google Quick, Draw!](https://github.com/googlecreativelab/quickdraw-dataset) — CC BY 4.0, © Google, Inc. |
| Data access path | `quickdraw.js@1.0.6` npm package (MIT wrapper redistributing the official dataset). The canonical Google Cloud Storage bucket and Hugging Face were both unreachable from the training environment, so this mirror was used instead; its own licence file carries the CC BY 4.0 attribution to Google. |
| Examples per class | **100** — the maximum that mirror provides (34,500 drawings total, not the full 50 M) |
| Split | 27,600 train / 3,450 validation / 3,450 test, stratified per class, `SEED = 42` |
| Input | `[1, 28, 28, 1]` float32, white ink on black, values 0–1 |
| Output | 345 softmax probabilities |
| Parameters | 214,649 |
| Test accuracy | **top-1 40.1% · top-3 59.3% · top-10 77.6%** (3,450 held-out drawings; random baseline 0.29%) |
| Hand-drawn doodles | top-1 6/16 · top-3 9/16 · top-10 14/16 on 16 hand-drawn doodles (the previous weights scored 7/16 · 9/16 · 12/16 — 16 samples cannot separate the two) |

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
each training image was randomly thickened, thinned or gamma-shifted. Without
that, the model scored 41.9% top-1 on the clean test split but only 9/16 top-10
on real hand-drawn doodles; with it the doodle score rose to 12/16.

Those 60 epochs produced 37.7% top-1. The shipped weights were then refined
further on CPU — 24 epochs on the train rows with a zoom augmentation and label
smoothing, then 26 epochs on train+validation rows with EMA weights — reaching
**40.1% top-1** (+2.4 pp, cluster-bootstrap 95% CI +1.4…+3.4 pp, McNemar
p = 4 × 10⁻⁷, 169 drawings fixed vs 87 broken, test rows never trained on). The
architecture, input contract and class order are unchanged. Method, negative
results and reproduction steps:
[`training/model-345-refinement-2026-11-20.md`](training/model-345-refinement-2026-11-20.md).

See [Training our own 345-class model](#training-our-own-345-class-model) for how
to reproduce it, and `training/export/model-345/ATTRIBUTION.txt` for the
attribution shipped alongside the weights.

**Fallback model (bundled).** SketchAI does not redistribute a model it trained
here; the bundled one is pretrained:

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

### Supported classes (100)

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

Both `flower` and `sun` are in the list. Classes such as `house`, `fish`, `dog`
and `heart` are **not** predicted by this model — it can only answer with one of
the 100 above, which is why an unsupported object is answered with the closest
supported shape.

### Suggestion artwork

Every one of the 345 official categories has metadata (display name, icon key,
tier, source) in `src/data/categories.js`, and every category now has at least
one bundled drawing available for suggestion cards. Icon metadata tiers are:

| Tier | Meaning | Count |
| --- | --- | --- |
| A | Icon depicts the object | 265 |
| B | Recognisable stand-in | 56 |
| C | No suitable bundled icon; reviewed line art or an original fallback drawing is used | 24 |

Icons come from Fluent Emoji Flat (MIT), Noto Emoji (Apache-2.0) and Material
Design Icons (Apache-2.0), bundled locally, no network requests. Twelve labels
that previously had no artwork variant now use original hand-authored line
drawings in `src/data/fallback-art.js`, so every suggestion card can show an
icon. Categories are chosen by hand and reviewed against a rendered sheet,
because a wrong picture is worse than no picture. The 333-class model can produce suggestions for its mapped 333 labels (with
label-order provenance still unverified); the 345-class model covers all 345
official categories, while the 100-class fallback is limited to its 100 labels.

![Artwork coverage for the 345 categories](docs/images/artwork-coverage.png)

### Why SketchAI still maintains its own 345-class model

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

When the project-trained 345-class model was created, a search found no
browser-ready 345-class alternative with clear redistribution terms (other
Quick, Draw! CNN projects carried no licence, `NOASSERTION`, or code only).
That is why SketchAI maintains its own reproducible classifier trained on the
CC BY 4.0 Quick, Draw! dataset. The separately supplied 333-class artifact is
now also integrated, but its dataset provenance and class-index alignment have
not been established; it does not replace the 345-class model's known label
order or evaluation record.

The honest trade-off: the reachable mirror of the dataset provides 100 drawings per
class rather than the tens of thousands available from Google's own bucket, so this
model is trained on 34,500 drawings, not millions. That is why its top-1 accuracy
(37.7%) is below published Quick, Draw! numbers, and why the app shows a ranked
top-10 rather than a single verdict.

The rest of the app is built to be class-count agnostic:

- the full official list of 345 categories lives in
  `src/data/quickdraw-categories.txt` (CC BY 4.0), with metadata for every class;
- recognition, the panel and the suggestion strip are all class-count agnostic
  (top 10, live count in the status pill);
- the artwork library covers 323 of the 345 categories already.

The active profile's predictions are what you see; labels are never padded or
faked to look like broader coverage. If the supplied model is selected, its
labels follow the attached mapping, whose semantic alignment still needs
verification.

### Training our own 345-class model

The licensing problem above has a clean solution: **train the model ourselves**
on Google's Quick, Draw! dataset, which *is* clearly licensed (CC BY 4.0). The
complete pipeline lives in [`training/`](training/README.md) and has been run —
the result is the 345-class model described above.

```
training/train_345.py                  the training pipeline (start here)
training/quickdraw_ndjson.py           loads + normalises the real drawings
training/fetch_quickdraw_data.py       downloads the dataset mirror
training/manual_test.py                sixteen hand-drawn doodles -> top 10
training/refine_model_345.py           continue-train an existing checkpoint (CPU)
training/export_model_345.py           Keras -> TF.js export + parity check
scripts/install-model-345.mjs          validate + install a trained model
scripts/audit-app.mjs                  end-to-end app checks (no browser needed)
scripts/test-pencil-objects.mjs        editable pencil-stroke scene-object checks
scripts/test-shapes.mjs                parametric shape geometry and rendering checks
training/SketchAI_345_Training.ipynb   the same pipeline as a Colab notebook
```

Real Quick, Draw! drawings -> re-normalised into SketchAI's own 28×28 geometry ->
memory-mapped batches (never the whole dataset in RAM) -> a 214,649-parameter CNN
-> TensorFlow.js export -> `public/model-345/`.

Training runs fine on a **CPU**; the run documented above took about 12.5 minutes
without a GPU. `SAMPLES_PER_CLASS` and `QUICK_TEST` are the two switches that
matter, and the category order always comes from
`src/data/quickdraw-categories.txt`, never from a directory listing.

### Model profiles, one app

| Default order | Model | Location | Input profile |
| --- | --- | --- | --- |
| 1 | Project-trained 345-class model | `public/model-345/` | profile `"345"`, 28 × 28 |
| 2 | Original 100-class fallback | `public/model/` | profile `"100"`, 28 × 28 |

The supplied 333-class profile (`public/model-333/`, 96 × 96 grayscale) is
excluded from automatic selection until its labels are verified. Set
`VITE_ENABLE_UNVERIFIED_333_MODEL=true` only to evaluate it; in that mode it is
tried before the 345-class model. Every enabled candidate is validated, and a
failed candidate falls through to the next. Each profile keeps its own
preprocessing. The selected fallback is reported in the status notice.

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
5. **Contrast normalisation** – a browser pen is much thinner (relative to the
   drawing) than the Quick, Draw! pen, which leaves pale, sub-pixel strokes the
   model has never seen. Ink intensities are gamma-corrected so the 97th
   percentile is ~0.9 opaque, restoring the ink density of the training bitmaps
   without moving any geometry.
6. **Inference** – `tf.tensor4d(ink, [1, 28, 28, 1])` is passed to
   `model.predict()` inside `tf.tidy()`, the probabilities are sorted, and the top
   ten are kept. The panel shows the best guess plus four alternatives; the strip
   shows up to ten cards. Scores below 0.5% are shown as `<1%` rather than a
   misleading `0%`, and a best guess under 45% changes the wording to
   “AI isn't completely sure. Maybe:”. WebGL is used when available and the CPU backend
   otherwise.

Recognition is throttled while drawing: at most one prediction runs every ~220 ms,
never on every pointer sample. After a stroke ends, a final prediction runs after
~260 ms so the suggestion strip settles on the completed sketch without stalling
pointer input on every move.

![What the network receives for a flower sketch, before and after the preprocessing fix](docs/images/preprocessing-flower.png)

These numbers are model confidence scores, **not guaranteed accuracy**. The model
recognises 100 classes and can make mistakes; simple, centered, single-object
doodles tend to work best. Accepted illustrations are rendered deterministically
from the editable scene-object list. A separate temporary sketch canvas feeds the
recognizer, so clean objects never enter the model input and rough drawing never
changes accepted artwork.

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

## Audit and measurements

`docs/AI-AUDIT.md` records the recognition audit: how the model and its label
order were verified, the Quick, Draw! rasterisation the preprocessing now
reproduces, before/after measurements across pen widths and drawing sizes, the
problems found, and the application test results.

## Release notes

`docs/RELEASE-345.md` is a historical release record for the 345-category
licensing investigation, top-10 predictions, artwork library and release tests.
It also notes that its PNG export feature has since been intentionally retired.

## Limitations

- The two documented project classifiers are small CNNs trained on limited data
  compared with Google's production model; expect occasional misses, especially
  for unusual drawing styles. The supplied 333-class model has no held-out
  evaluation metrics, and its output-label alignment remains unverified.
- The supplied model uses 96 × 96 grayscale input; the two retained models use
  28 × 28. All lose fine detail, texture and colour.
- The selected profile only predicts labels represented in its own classes file.
  The 345-class model covers the official Quick, Draw! classes, while the
  100-class fallback is limited to its 100 labels. The 333-class model's mapping
  is provisional until its ordering is verified.
- The suggestion library covers all 345 categories, but only labels predicted
  by the active model can surface as cards.
- Recognition looks at the current unfinalised sketch. If two different objects
  are drawn before inserting an illustration, they are classified together.
- Inference time depends on the device: WebGL is fast, the CPU fallback is usable
  but slower.
- Very thick pens on a very small drawing can over-fill the frame; the contrast
  normalisation only repairs strokes that are too thin, not ones that are too fat.

## Model attribution

SketchAI's 345-class classifier is **trained for this project** using Google's
Quick, Draw! dataset. It is not Google's model, not AutoDraw, and not a
third-party checkpoint. SketchAI is not affiliated with or endorsed by Google.

The dataset is Google's; we did not create it and did not draw any of the
training data. Every export ships an `ATTRIBUTION.txt` restating this, and
`training/README.md` documents the dataset source, licence, sample counts,
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
