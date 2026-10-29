# SketchAI

SketchAI is a small, browser-based drawing studio. Draw a rough object, see a neural network's three most likely guesses and their confidence scores, and add a clean illustration beside your sketch. No account, backend, API key, or paid service is required. Your drawing stays in your browser.

## Features

- Mouse, stylus and touch drawing with pencil, eraser, colors and brush size.
- Local AI recognition after a 600 ms pause; top three probabilities and matching vector suggestions.
- Add an illustration beside the current sketch, then start drawing another object. Suggestions use the current brush color; bold and fine variants change the line weight.
- Undo/redo (including insertion and erasing), clear, and PNG export. History keeps the most recent 12 states to limit memory use. Use Ctrl/Cmd+Z to undo and Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y to redo.
- A short “How it works” explanation for a school demonstration.

## Technologies used

React, Vite, JavaScript, TensorFlow.js and the HTML Canvas API. Lucide provides the vector icons.

## How AI recognition works

A separate transparent canvas tracks the current sketch. The app finds its non-empty pixels, crops the bounds, preserves the aspect ratio, adds a little padding and centers it in a 28 × 28 image. Pixel alpha is used as the ink intensity, so colored strokes work too. The intensities are divided by 255, producing white ink on a black background in a `[1, 28, 28, 1]` tensor. TensorFlow.js runs the convolutional neural network in the browser, sorts its softmax output, and displays the top three scores as percentages. Temporary tensors are disposed after inference.

These numbers are model confidence scores, **not guaranteed accuracy**. The model recognizes 100 classes and can make mistakes; simple, centered, single-object doodles tend to work best. Not all predicted classes have a matching icon. If none of the top three has one, the app says so instead of inventing a suggestion. Once an illustration is inserted, a new recognition sketch begins; the existing artwork stays on the canvas. Recognition does not treat all finished objects together as a new sketch.

## Running locally

Requires a recent Node.js LTS release (Node 20 or newer is recommended).

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Model files and fonts are included in the application; no inference request or API key is needed. The initial application and its assets must be served over HTTP, rather than opened directly as a file.

## Building and deploying

```bash
npm run build
npm run preview
```

The static output is in `dist/`. Deploy that folder to Vercel, or publish it to GitHub Pages (for example using a Pages workflow). Vite uses relative asset paths, including for the model, so it works under a repository subpath. On Vercel use `npm run build` as the build command and `dist` as the output directory.

## AI model

The pretrained 100-class TensorFlow.js CNN, its class ordering, and weights are from [Aniket Dogra’s GuessTheDoodle](https://github.com/AniketDogra/GuessTheDoodle), copyright 2019 Aniket Dogra, under the MIT license. The original license is included in `public/model/LICENSE`. We did not train this model. Its training notebook describes training on up to 5,000 Quick, Draw! images per class, normalized to 0–1. SketchAI uses the packaged model directly and does not make cloud AI calls.

## Dataset

The model was trained on [Google’s Quick, Draw! dataset](https://github.com/googlecreativelab/quickdraw-dataset), made available by Google, Inc. under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The dataset itself is not bundled here. See the model author’s notebook for the training process and class selection.

## Credits / licenses

- Model and labels: [GuessTheDoodle](https://github.com/AniketDogra/GuessTheDoodle), MIT; license included with the model.
- Training data: [The Quick, Draw! Dataset](https://github.com/googlecreativelab/quickdraw-dataset), Google, Inc., CC BY 4.0.
- Interface and suggestion icons: [Lucide](https://lucide.dev/), ISC license.
- Fonts: DM Sans and DM Serif Display, distributed through [Fontsource](https://fontsource.org/), SIL Open Font License 1.1.
- React, Vite and TensorFlow.js are open-source dependencies; see their respective package licenses.
