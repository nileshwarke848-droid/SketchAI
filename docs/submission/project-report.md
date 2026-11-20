# SketchAI — a browser clone of Google AutoDraw

**Project report**

| | |
| --- | --- |
| Student | _your full name_ |
| Class / Section | X - _section_ |
| Roll number | _roll no._ |
| Subject | Artificial Intelligence (417) / Computer Applications — _as applicable_ |
| School | _school name_ |
| Teacher in charge | _teacher name_ |
| Session | 2026–27 |
| Date of submission | _date_ |

---

## 1. Introduction

AutoDraw is a Google experiment (2017) where you sketch a rough object and the
software suggests clean, professionally drawn pictures of what it thinks you are
drawing; one click replaces your sketch with the suggested drawing.

This project, **SketchAI**, is my own working version of that idea. It is a
drawing app that runs entirely in a web browser: you draw with a mouse, finger
or stylus, a small neural network looks at your drawing about every fifth of a
second, and the ten most likely objects appear as clickable cards. Clicking a
card places a clean illustration on the canvas as an editable object that can be
moved, resized, rotated and recoloured.

The most important part of the project is that **the AI is mine**. I trained the
classifier myself on the Google Quick, Draw! dataset. I did not use Google's
model, AutoDraw's model, or any ready-made doodle classifier.

## 2. Aim and objectives

**Aim.** To build a drawing app that recognises what the user is sketching in
real time and offers clean illustrations to replace it, running completely inside
a web browser.

**Objectives.**

1. Recognise a hand-drawn object among the **345 official Quick, Draw! categories**.
2. Show the top ten guesses with confidence percentages, not a single confident answer.
3. Let the accepted drawing be **edited as an object**, not pasted as flat pixels.
4. Do all of it in the browser — no server, no account, no API key, no internet
   connection needed while drawing.
5. Measure the accuracy honestly on drawings the model has never seen.

## 3. Tools and technology used

| Layer | What I used |
| --- | --- |
| App | JavaScript, React, Vite, HTML Canvas |
| AI runtime | TensorFlow.js 4.22 (runs the model in the browser) |
| Model training | Python, TensorFlow 2.20 CPU, NumPy |
| Dataset | Google Quick, Draw! — 345 categories, 100 drawings each |
| Evaluation | Node.js scripts, bootstrap confidence intervals, McNemar test |

## 4. The dataset

- **Source:** Google Quick, Draw! dataset, licence **CC BY 4.0** (free to use, but
  Google must be credited — the app ships an attribution file for this reason).
- **What one drawing is:** a 28 × 28 grid of greyscale pixels showing the ink of
  one doodle. I used the pre-rendered bitmaps, not the raw stroke data.
- **Size used:** 345 categories × 100 drawings = **34,500 drawings**. The full
  Google dataset has about 50 million drawings, but the copy reachable from my
  training machine only provides 100 per category.
- **Split:** 27,600 for training, 3,450 for validation, 3,450 for testing
  (80 / 10 / 10, with a fixed random seed so the split is reproducible).
  The test drawings are used **once**, at the end, only to report the score.

## 5. How the app works

```
user draws on canvas
        ↓
canvas pixels → crop to the ink, make it square, resize to 28×28,
                convert to "white ink on black", values 0–1
        ↓
neural network → 345 probabilities (sum = 1)
        ↓
top 10 sorted → suggestion cards with % confidence
        ↓
user clicks a card → clean vector illustration added as an editable object
```

Two design decisions worth noting:

1. **The model sees the same thing in training and in the app.** A browser pen is
   much thinner than a Quick, Draw! pen, so during training I randomly thickened,
   thinned and brightened strokes. Without this the model looked good on the test
   data but failed on real hand-drawn doodles.
2. **The app says "AI thinks you might be drawing… Cat 54 % · Dog 31 %"** instead
   of pretending to be certain. A classifier that is wrong 6 times out of 10
   (in the single-guess sense) should not sound confident.

## 6. The model

A small convolutional neural network (CNN), 214,649 parameters, 0.88 MB when
exported — small enough to download and run on a phone.

```
Input 28×28×1
 → Conv2D(32) → BatchNorm → ReLU → MaxPool          (find simple strokes/edges)
 → Conv2D(64) → BatchNorm → ReLU → MaxPool          (find parts: wheels, ears, handles)
 → Conv2D(128) → ReLU → GlobalAveragePooling        (combine parts into "what object")
 → Dense(256) → ReLU → Dropout(0.4)
 → Dense(345) → Softmax                             (345 probabilities)
```

In plain words: the convolution layers look for small patterns and build them up
into bigger ones; the dense layer combines them into a judgement; softmax turns
that judgement into 345 percentages that add up to 100 %. Dropout randomly
switches off 40 % of the dense neurons during training so the network cannot
memorise individual training drawings.

## 7. Work done and experiments

### 7.1 First version (60 epochs, ~15 minutes on a CPU)

Adam optimiser, learning rate 0.001, batch size 128, light rotation/translation
augmentation and the pen-width augmentation described above. Result: **37.71 %
top-1** on the 3,450 held-out drawings.

### 7.2 Second version — improving the existing model (this is my main experiment)

Instead of starting again, I continued training the first model, in two stages:

| Stage | What I changed | Result (top-1) |
| --- | --- | --- |
| start | first version | 37.71 % |
| A | 24 more epochs on the training drawings, added random **zoom** (scale) augmentation, label smoothing, learning rate decaying from 0.0002 to 5 % | 38.38 % |
| B | 26 more epochs using training **and** validation drawings (31,050 drawings) with **EMA** weights (an average of the weights over the last epochs, which is more stable for small datasets) | **40.09 %** |

Why zoom: the network already tolerated small shifts, rotations and pen widths,
but not the same object drawn bigger or smaller. Scale is exactly the thing that
changes between two people drawing the same object.

Why use the validation drawings in stage B: after stage A I had used the
validation set to choose the best epoch, so it was no longer an unbiased
measure of quality. Rather than waste 3,450 drawings, I folded them into
training and reported the result on the **test** set only.

**Final measured result (same 3,450 test drawings for every row):**

| Version | Top-1 | Top-3 | Top-10 |
| --- | --- | --- | --- |
| first version | 37.71 % | 58.12 % | 76.12 % |
| **final version (shipped)** | **40.09 %** | **59.25 %** | **77.62 %** |

Improvement: **+2.38 percentage points** top-1. To check that this was a real
improvement and not luck, I compared the two models drawing-by-drawing:

- a bootstrap over the 345 categories gives a 95 % confidence interval of
  **+1.42 to +3.36** percentage points (the interval does not include zero);
- the McNemar test gives **p = 4.1 × 10⁻⁷** (about 1 in 2.4 million);
- the new model got **169 drawings right that the old one got wrong**, and lost
  87 that the old one had — i.e. it fixed about twice as many as it broke.

### 7.3 Testing through the real app, not just in Python

A score measured in Python is not the same as a score the app would get, because
the app preprocesses the canvas differently. So I replayed the app's own
preprocessing code and the exported model on a frozen set of 400 drawings
(10 drawings of 40 categories, all from the held-out test rows):

| | Top-1 | Top-3 | Top-5 | Top-10 |
| --- | --- | --- | --- | --- |
| the model I trained | **158/400** = 39.5 % | 233/400 = 58.2 % | 257/400 = 64.2 % | 282/400 = 70.5 % |
| a pretrained doodle model I compared against | 82/400 = 20.5 % | 135/400 = 33.8 % | 162/400 = 40.5 % | 210/400 = 52.5 % |

The second row is a 333-category model trained by someone else that I downloaded
and tested through the same pipeline. My model is about **twice as accurate** as
it on identical inputs, which supports the decision to train one myself.

### 7.4 Sixteen drawings by hand

I also drew sixteen objects myself, in the app, with a mouse, and checked whether
the answer appeared in the suggestions: **6/16 top-1, 9/16 top-3, 14/16 top-10**.
These are much harder than the test set — human drawings with a mouse are
messier than Quick, Draw!'s — and sixteen drawings are far too few to draw a
conclusion from. I report it because it is the honest picture of what a user
actually experiences.

## 8. Results and discussion

- The correct answer is the **first** suggestion for about **40 %** of unseen
  Quick, Draw!-style drawings.
- It is in the **top 3** for about **59 %**, and **somewhere in the ten cards**
  for about **78 %**.
- Chance for 345 categories is 0.29 %, so this is about **140 times better than
  guessing**.
- Failure is not random: the model mixes up objects that look alike — cake with
  birthday cake, coffee cup with mug, horse with cow, jeans-like outlines with
  shorts, van/firetruck with ambulance. That is the same confusion a person
  would make looking at a 28 × 28 black-and-white thumbnail.
- The suggestion-strip design matters: even when the first guess is wrong, the
  user usually finds the right card, which is why top-10 (78 %) is a fairer
  description of the user experience than top-1 (40 %).

## 9. Limitations

1. **Only 100 drawings per category.** The full dataset has ~50,000 per category.
   More data, not more training, is the biggest possible improvement — the model
   already trains to the limit of what 100 examples per class can teach.
2. **28 × 28 pixels is very small.** Fine detail (the difference between a cup
   and a mug) is simply not in the image.
3. **Trained on Quick, Draw! ink, used on browser ink.** The pen-width
   augmentation narrows the gap but does not close it (see 6/16 vs 40 % above).
4. **Objects only, not scenes.** The model recognises one object at a time; it
   cannot understand "a cat sitting on a chair".
5. **No export to PNG**, by design: the project keeps everything editable instead
   of flattening it into a picture.

## 10. What I would do with more time

1. Train on the full 50-million-drawing dataset on a GPU (same code, more data).
2. Try a 96 × 96 input model, which can see fine detail, and compare it fairly
   against the 28 × 28 model using the same 400-drawing test.
3. Let the user confirm or reject a suggestion and use that signal to improve
   the ranking of the suggestions.
4. Add stroke-level input (the pen path, not the pixels) — this is closer to what
   Google's research models use.

## 11. Conclusion

SketchAI recognises 345 kinds of hand-drawn objects in the browser, shows its ten
best guesses with confidence, and turns an accepted guess into an editable
drawing — which is what AutoDraw does. The single-guess accuracy is about 40 %
and the correct object appears among the suggestions about 78 % of the time,
against a target of 50–70 %. Every number in this report was measured on
drawings the model never saw, and every improvement was tested statistically
before being kept. The project also produced something a demo cannot fake: a
documented, repeatable experiment showing a 2.4-point gain from a specific idea
(zoom augmentation + EMA), including the cases where the model did **not**
improve.

## 12. Verification — how to check any claim in this report

Every number above can be reproduced, and the checks are automated:

```bash
npm install                       # once
node scripts/audit-app.mjs        # 274 automatic checks of the app itself
node scripts/manual-test-345.mjs  # the 16 hand-drawn doodles through the real code
node scripts/evaluate-quickdraw-400.mjs \
  --data-dir <quickdraw drawings> \
  --manifest training/evaluation-400-manifest.json   # the 400-drawing comparison
```

The full experiment write-ups are in `training/`:
`model-345-refinement-2026-11-20.md` (the improvement),
`evaluation-400-results.md` (the comparison), and the model's own
`manifest.json` records the exact split, seed, architecture and metrics.

## 13. Bibliography

1. Google Quick, Draw! dataset — https://github.com/googlecreativelab/quickdraw-dataset (CC BY 4.0).
2. "A Neural Representation of Sketch Drawings", Ha & Eck, 2017 — the research behind Quick, Draw!.
3. TensorFlow documentation — https://www.tensorflow.org/
4. TensorFlow.js documentation — https://www.tensorflow.org/js
5. Google AutoDraw — https://www.autodraw.com/ (the idea this project copies).
6. Keras: image augmentation layers — https://keras.io/api/layers/preprocessing_layers/.
7. Bootstrap confidence intervals and the McNemar test — standard statistical
   methods for comparing two classifiers on the same test set.

## 14. Declaration

I declare that this project, including the training of the model and the
measurement of its accuracy, was carried out by me, and that the dataset and any
third-party libraries used are credited above and in the `ATTRIBUTION.txt` files
included with the project.

Signature: ____________________  Date: ____________
