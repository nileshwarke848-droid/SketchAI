# SketchAI

SketchAI is a small, browser-based drawing studio. Draw a rough object, see a
pretrained neural network's three most likely guesses and their confidence
scores, and add a clean illustration beside your sketch. No account, backend,
API key, or paid service is required. Your drawing stays in your browser.

## Features

- Mouse, trackpad, stylus and touch drawing with pencil, eraser, colors and brush size.
- Local AI recognition after a 600 ms pause; the top 10 probabilities drive a
  horizontally scrollable strip of up to 10 clean suggestion cards.
- One-click PNG export (1200 × 720, white background by default, optional
  transparency) that composites every visible layer and needs no server.
- "AI thinks you might be drawing…" framing: the panel reports the model's
  uncertainty (for example `Cat 54% · Dog 31% · Tiger 8%`) instead of claiming a
  certain answer.
- Add an illustration beside the current sketch, then start drawing another object.
  Suggestions use the current brush color; bold and fine variants change line weight.
- Undo/redo (including insertion and erasing), clear, and PNG export. History keeps
  the most recent 12 states. Use Ctrl/Cmd+Z to undo and Ctrl/Cmd+Shift+Z or
  Ctrl/Cmd+Y to redo.
- A short “How it works” explanation for a school demonstration.

## Technologies used

React, Vite, JavaScript, TensorFlow.js and the HTML Canvas API. Lucide provides
the vector icons.

## The AI model

SketchAI does **not** train a model. It bundles a pretrained doodle classifier:

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
tier, source) in `src/data/categories.js`, and 323 of them have a bundled vector
icon in `src/data/icons.js`:

| Tier | Meaning | Count |
| --- | --- | --- |
| A | Icon depicts the object | 265 |
| B | Recognisable stand-in | 58 |
| C | No honest icon — the card shows the category name as typography | 22 |

Icons come from Fluent Emoji Flat (MIT), Noto Emoji (Apache-2.0) and Material
Design Icons (Apache-2.0), bundled locally, no network requests. Categories are
chosen by hand and reviewed against a rendered sheet, because a wrong picture is
worse than no picture. Only the 100 predicted classes can actually appear today,
but the library and mapping are ready for a 345-class model.

![Artwork coverage for the 345 categories](docs/images/artwork-coverage.png)

### Why the app does not ship a 345-class model

All 345 official Quick, Draw! categories would need a model with 345 outputs. The
obvious candidate, [yining1023/doodleNet](https://github.com/yining1023/doodleNet)
("DoodleClassifier_345", ~50k drawings per class), was investigated and rejected
for bundling:

- **License:** the GitHub API reports `license: null`, there is no `LICENSE` file
  in the repository or anywhere in its 26-commit history, and neither the README
  nor the training notebook grants redistribution rights. Copyright therefore
  defaults to all rights reserved, so redistributing its weights is not permitted.
- **Mislabelled order:** its `class_names.txt` is not in the official category
  order, so its output index → name mapping would have had to be derived
  separately. Shipping a guessed mapping could silently mislabel every prediction.
- It also has a malformed first layer, and its training data is described as
  "50k per class" rather than the definitive Quick Draw counts.

Searching for an alternative turned up no browser-ready 345-class model with a
redistribution licence (other Quick, Draw! CNN projects on GitHub carry no licence,
`NOASSERTION`, or ship code only, with no weights). Rather than ignore the
licensing problem just because the repository is public, SketchAI keeps the
clearly-licensed MIT 100-class model and is honest about its coverage.

**Everything else in this release is built to support 345 categories**, so a
licensed 345-class model can be dropped in without UI work:

- the full official list of 345 categories lives in
  `src/data/quickdraw-categories.txt` (CC BY 4.0), with metadata for every class;
- recognition, the panel and the suggestion strip are all class-count agnostic
  (top 10, live count in the status pill);
- the artwork library covers 323 of the 345 categories already.

The 100-class model's own predictions are what you see; nothing is padded or
faked to look like broader coverage.

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

Recognition is debounced: one prediction runs ~600 ms after drawing stops, and a
new stroke cancels the pending timer, so the interface stays responsive.

![What the network receives for a flower sketch, before and after the preprocessing fix](docs/images/preprocessing-flower.png)

These numbers are model confidence scores, **not guaranteed accuracy**. The model
recognises 100 classes and can make mistakes; simple, centered, single-object
doodles tend to work best. Once an illustration is inserted, a new recognition
sketch begins; the existing artwork stays on the canvas, and recognition never
treats all finished objects together as a new sketch.

## Exporting a PNG

The drawing lives on more than one canvas while you work: the visible art canvas
(strokes plus inserted illustrations) and a separate overlay holding the
temporary recognition sketch. `src/lib/download.js` composites the visible layers
into a fresh 1200 × 720 canvas — never the recognition overlay — and saves it via
`canvas.toBlob()` + a `blob:` object URL + an `<a download>`. It falls back to a
data URL if `toBlob` returns nothing or throws, attaches the anchor to the DOM
before clicking (Firefox and older Safari ignore detached anchors), and shows a
manual “Save the PNG again” link in case the browser blocks the download. The
“Transparent” toggle exports with an alpha background instead of white.

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

`docs/RELEASE-345.md` covers the PNG export repair, the 345-category licensing
investigation and its outcome, top-10 predictions, the artwork library and the
full test results for this release.

## Limitations

- The classifier is a small CNN trained on only ~5,000 images per class; it is
  noticeably weaker than Google's Quick, Draw! production model. Expect
  occasional misses, especially for unusual drawing styles.
- 28 × 28 grayscale input means fine detail is lost; texture, colour and small
  features do not contribute to the prediction.
- Only the 100 Quick, Draw! classes above are recognised. Anything else (a house,
  a dog, a fish, a heart) can only be guessed at as a similar supported class —
  in testing, a drawn bus came back as "Car 83%" and a crayon as "Knife 79%".
  Suggestions are therefore useful for supported objects and unreliable for
  everything else; the app never claims a 345-class model.
- The suggestion library is larger than the model: 323 categories have artwork,
  but only the 100 predicted classes can currently surface as cards.
- Recognition looks at the current unfinalised sketch. If two different objects
  are drawn before inserting an illustration, they are classified together.
- Inference time depends on the device: WebGL is fast, the CPU fallback is usable
  but slower.
- Very thick pens on a very small drawing can over-fill the frame; the contrast
  normalisation only repairs strokes that are too thin, not ones that are too fat.

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
