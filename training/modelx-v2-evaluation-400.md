# ModelX (updated archive) — evaluation on the frozen 400-drawing bench

Run date: 2026-11-20 · Branch: `arena/7171830c-sketchai`
Harness: [`evaluate_modelx.py`](evaluate_modelx.py) · Raw data: [`modelx-v2-evaluation-400.json`](modelx-v2-evaluation-400.json)

## What was measured

The updated archive was taken from Google Drive (`ModelX/modelX (2).zip`,
7,634,535 bytes, sha256 `d2c1621…f8ff6`) and inspected:

| Property | Value |
| --- | --- |
| File inside the zip | `modelX.keras` (8,384,007 bytes, sha256 `a5a87d7…f43ff`) |
| Model type | Keras Sequential: 4 × (Conv2D → BatchNorm → MaxPool), GlobalAveragePooling, Dense+ReLU, Dense+Softmax |
| Parameters | 692,749 |
| Input shape | `(None, 96, 96, 3)` |
| Output shape | `(None, 333)` softmax |
| Class map | `class_indices (1).json`, 333 keys → indices 0–332, bijective (sha256 `c3a6fc2…8fa5c`), archived here as [`modelx-v2-class-indices.json`](modelx-v2-class-indices.json) |

This is the same input/output signature as the previous archive, so the archive is
an updated set of weights rather than a different model family. The previous
weights were deleted after their evaluation, so a weight-level diff is not
possible; only the fresh measurement below stands.

The confirmed input contract supplied by the model owner was used as the primary
configuration — **96×96×3 RGB float32, values 0–1, white background ≈1.0, black
strokes ≈0.0, batch dimension at inference** — and each part of that contract was
probed rather than assumed.

## Bench protocol

* 400 drawings, 10 each from 40 classes, from the frozen manifest
  [`evaluation-400-manifest.json`](evaluation-400-manifest.json) (bitmaps fixed in
  [`fetch_quickdraw_data.py`](fetch_quickdraw_data.py) data). All 40 bench labels
  are present in the 333-class map.
* The same 400 drawings are the ones behind the project's 345-class reference
  numbers, so every difference below is **paired** — drawing-for-drawing.
* Intervals are 95% Wilson intervals on a single configuration; the
  ModelX-minus-345 deltas use a **paired cluster bootstrap** (10,000 resamples of
  the 40 classes), which respects the fact that the ten drawings of a class are
  not independent.
* Unknowns that no amount of testing here can remove: the training rasterisation
  (kernel, padding, stroke width, antialiasing) and whether any of these 400
  drawings were in ModelX's training split. Both are flagged again in *Caveats*.

## 1. The stated contract is correct, and it is load-bearing

Bilinear 28→96 upscale, ink replicated across RGB, batch `(400, 96, 96, 3)`:

| Input as fed to ModelX | Top-1 | Top-3 | Top-5 | Top-10 | Within-class top-1 agreement |
| --- | ---: | ---: | ---: | ---: | ---: |
| **Black strokes on white, 0–1** (confirmed contract) | **28** (7.0%) | 57 (14.3%) | 82 (20.5%) | 108 (27.0%) | 0.43 |
| White strokes on black, 0–1 (previous app default) | 0 (0.0%) | 0 (0.0%) | 9 (2.3%) | 18 (4.5%) | 0.89 |
| Black on white, 0–255 (no `/255`) | 10 (2.5%) | 10 | 10 | 10 | 1.00 |
| Black on white, −1…1 | 1 (0.3%) | 10 (2.5%) | 17 (4.3%) | 43 (10.8%) | 0.45 |

Three conclusions, all independent of the resize filter:

* Feeding the *inverse* polarity collapses top-1 to zero, and the 0–255 variant
  collapses to a **single constant prediction for all 400 drawings**
  (agreement 1.00, confidence 1.00). The confirmed 0–1 black-on-white contract is
  right, and any deviation breaks the model outright.
* The polarity-mismatch run is *not* evidence of a shuffled class map. It keeps a
  within-class top-1 agreement of 0.89 while scoring 0/400: the network is stable
  and class-discriminative but scored against the wrong labels. A permuted
  `class_indices` file would instead have shown high agreement **and** high
  accuracy for the neuron order we did not have. Neither happened, so the map is
  consistent with what the model learned.
* The map's coverage is complete for this bench (40/40 labels), so the low scores
  are not "right answer, missing class".

## 2. The class map is aligned — and it is *not* the app's shipped ordering

The new map still holds the same 333 class names, but 300 of them sit at a
different index than the map committed for the previous archive
([`training/backup/model-333-source/class_indices.json`](../training/backup/model-333-source/class_indices.json)):
the new file is in strict alphabetical order, so `The Eiffel Tower`,
`The Great Wall of China` and `The Mona Lisa` now occupy indices 0–2 and most
other names shifted by three. Scoring the same predictions against the two
orderings separates "wrong labels" from "weak model":

| Labels applied to identical ModelX predictions | Top-1 | Top-3 | Top-5 | Top-10 |
| --- | ---: | ---: | ---: | ---: |
| New Drive map (bilinear + stroke −3 px) | 58 (14.5%) | 93 (23.3%) | 122 (30.5%) | 163 (40.8%) |
| Previous archive's map (same predictions) | 4 (1.0%) | 13 (3.3%) | 16 (4.0%) | 23 (5.8%) |
| New Drive map (app pipeline + thin 3 px) | 77 (19.3%) | 135 (33.8%) | 166 (41.5%) | 220 (55.0%) |
| Previous archive's map (app pipeline + thin 3 px) | 5 (1.3%) | 17 (4.3%) | 26 (6.5%) | 48 (12.0%) |

So the Drive map is the one the updated weights were trained with, and neuron
order is no longer a caveat. It also means the app's shipped
`public/model-333/classes.txt` (which follows the *previous* ordering) would
label every prediction wrongly if this archive were dropped in beside it.

## 3. Resampling kernel and stroke weight dominate the score

All runs below use the confirmed polarity/scale. "Stroke −3 px" is a 3×3
grayscale erosion of the ink (min-pool) — the crisp thin strokes a 28-pixel
bitmap actually has once it is scaled up, versus the fat soft strokes a
bilinear/bicubic upscale produces.

| Preprocessing of the same 400 bitmaps | Top-1 | Top-3 | Top-5 | Top-10 |
| --- | ---: | ---: | ---: | ---: |
| Bilinear 28→96, as-is | 28 (7.0%) | 57 (14.3%) | 82 (20.5%) | 108 (27.0%) |
| Bicubic 28→96, as-is | 24 (6.0%) | 55 (13.8%) | 70 (17.5%) | 110 (27.5%) |
| Area 28→96, as-is | 9 (2.3%) | 32 (8.0%) | 50 (12.5%) | 71 (17.8%) |
| Nearest 28→96, as-is | 4 (1.0%) | 20 (5.0%) | 40 (10.0%) | 56 (14.0%) |
| **Bilinear + stroke −3 px** | **58 (14.5%)** | **93 (23.3%)** | **122 (30.5%)** | **163 (40.8%)** |
| Bilinear + stroke −5 px (too thin) | 35 (8.8%) | 50 (12.5%) | 64 (16.0%) | 89 (22.3%) |
| Bilinear + stroke +3 px (fatter) | 8 (2.0%) | 28 (7.0%) | 44 (11.0%) | 64 (16.0%) |
| Area + stroke −3 px | 22 (5.5%) | 41 (10.3%) | 58 (14.5%) | 79 (19.8%) |

The spread from "nearest, as-is" (4) to "bilinear, thinned" (58) is a factor of 14
on identical drawings and identical labels. That is much larger than the
difference between kernels, and it means **ModelX's accuracy cannot be judged
without its training rasterisation.** Thickening the ink hurts (−3 px beats
+3 px by 50 drawings), which points at crisp strokes of roughly one pixel at
96×96 as the training appearance.

## 4. End-to-end through the app's own 96×96 canvas pipeline

The app does not resize bitmaps; it rasterises the live drawing — area-averaged
bounding-box crop with `CROP_PADDING = 1.186`, contrast normalisation to peak
1.0, alpha→ink. Reproducing that exact path at 96×96 (node + `@napi-rs/canvas`,
then black-on-white RGB 0–1):

| Pipeline | Top-1 | Top-3 | Top-5 | Top-10 |
| --- | ---: | ---: | ---: | ---: |
| App canvas 96×96, confirmed polarity | 17 (4.3%) | 49 (12.3%) | 60 (15.0%) | 95 (23.8%) |
| App canvas 96×96, confirmed polarity + ink thinned 3 px | **77 (19.3%)** | **135 (33.8%)** | **166 (41.5%)** | **220 (55.0%)** |
| App canvas 96×96, white ink on black (current app profile) | 0 (0.0%) | 0 (0.0%) | 14 (3.5%) | 17 (4.3%) |

The app's antialiased pencil rendering is the *worst* fit: its pale, soft strokes
are the opposite of what this archive expects. Sharpening the ink to its crisp
core (the −3 px probe, i.e. a stronger contrast curve / thinner pen) moves the
same pipeline from 17 to 77 correct drawings.

## 5. Against the project's 345-class model on the same 400 drawings

| Metric | ModelX, best proxy (bilinear, stroke −3 px) | ModelX, app pipeline + thin | Project 345-class |
| --- | ---: | ---: | ---: |
> **345 reference updated 2026-11-20.** The CPU refinement described in
> [`model-345-refinement-2026-11-20.md`](model-345-refinement-2026-11-20.md) moved the
> same-model figures to 158 / 233 / 257 / 282 (39.5% / 58.2% / 64.2% / 70.5%). The
> 345 column below still shows the pre-refinement weights, so the gaps shown are
> conservative for the shipped model.

| Top-1 | 58 (14.5%) | 77 (19.3%) | 152 (38.0%) |
| Top-3 | 93 (23.3%) | 135 (33.8%) | 222 (55.5%) |
| Top-5 | 122 (30.5%) | 166 (41.5%) | 248 (62.0%) |
| Top-10 | 163 (40.8%) | 220 (55.0%) | 280 (70.0%) |

Paired cluster-bootstrap deltas versus the 345-class model (ModelX − 345):

| Configuration | Top-1 | Top-3 | Top-5 | Top-10 |
| --- | ---: | ---: | ---: | ---: |
| Bilinear, as-is | −31.0 pp [−40.8, −20.8] | −41.3 pp [−52.3, −29.3] | −41.5 pp [−53.8, −29.0] | −43.0 pp [−54.8, −31.0] |
| Bilinear, stroke −3 px | −23.5 pp [−33.3, −13.5] | −32.3 pp [−43.8, −20.3] | −31.5 pp [−43.5, −19.5] | −29.3 pp [−41.0, −17.5] |
| App pipeline + thin 3 px | −18.8 pp [−27.5, −9.8] | −21.8 pp [−32.0, −11.0] | −20.5 pp [−30.5, −10.5] | −15.0 pp [−24.3, −6.0] |

Every interval excludes zero. Even at the most favourable operating point found
here, the updated ModelX is ~19 pp behind the project's own 28×28 model at
top-1 and ~15 pp behind at top-10, on identical drawings.

## Verdict

* The updated archive is intact, well-formed, and **does** consume the stated
  contract: `(1, 96, 96, 3)` float32 RGB in 0–1, black ink on white. Wrong
  polarity, wrong value range, or `ink-on-black` all destroy it, exactly as the
  owner described.
* Its accuracy on the frozen bench is 14.5% top-1 as a direct resize proxy and
  19.3% top-1 at the best end-to-end proxy — **still well below the 345-class
  model's 38.0%**, with a paired confidence interval that excludes parity.
* The single biggest unknown is the training rasterisation. A factor-of-14 swing
  lives in stroke weight alone, so ModelX may be better than these numbers — but
  it cannot be shown better than the incumbent without that detail.
* The class map shipped with the archive is the aligned one (58 vs 4 correct
  drawings against the previous archive's ordering), but it is **not** the
  ordering the app ships today, so any integration must regenerate
  `public/model-333/classes.txt` from it.
* **Recommendation: do not switch the app to this archive.** Keep the 345-class
  model as the default and the 100-class model as the fallback.

## What the app currently does with a 96×96 supplied model (and why nothing was changed)

The app's `333` profile in [`src/ai/preprocess.js`](../src/ai/preprocess.js) and
`model-333` asset in `public/` are the *previous* archive's converted
1-channel (`96×96×1`) GraphModel, fed white-on-black with an antialiased pencil
render. Against the new archive that is three independent mismatches (channels,
polarity, stroke crispness) — the measured consequence is row 3 of section 4
(0/400 top-1). Wiring the new archive in would need: a TF.js conversion of the
`.keras` file (only Keras/TF can read it), a 3-channel input path, a
black-on-white profile, and a crisper stroke render — for a model that is still
19 pp behind the incumbent. No app code was changed in this evaluation.

## Caveats and what would settle it

1. **Training rasterisation unknown.** The harness varies the plausible knobs;
   the real one may be absent from the grid. A training script or one training
   image would close this immediately.
2. **Split overlap unknown.** The 400 drawings are frozen from the public Quick,
   Draw! bitmaps. If ModelX trained on those same public files, the true
   held-out accuracy is lower than anything above; if it trained on a disjoint
   split, the numbers are unbiased. Nothing in the archive says which.
3. **Neuron order is verified for this map, not for arbitrary edits.** The Drive
   map beats the previous archive's ordering by 54 drawings at top-1 on identical
   predictions (section 2). If the class list is ever re-sorted when converting
   the model, that alignment has to be regenerated with it.
4. **The bench is 40 of the 333 classes.** It covers everyday doodle classes and
   is shared with the 345-class reference, which is what makes the comparison
   paired — it is not a claim about the other 293 classes.
5. Numbers differ from the earlier exploratory run in
   [`modelx-evaluation-400-results.md`](modelx-evaluation-400-results.md) even for
   identically named filters (that run used a different resize implementation and
   without antialiasing control). Where the two disagree, this report supersedes
   it: it is one harness, one kernel definition, one class map.

## Reproducing

```bash
python -m venv /tmp/modelx-eval-venv && /tmp/modelx-eval-venv/bin/pip install tensorflow-cpu
python training/fetch_quickdraw_data.py --dest /tmp/sketchai-quickdraw-test-data

/tmp/modelx-eval-venv/bin/python training/evaluate_modelx.py \
  --model /path/to/modelX.keras \
  --class-indices training/modelx-v2-class-indices.json \
  --drawings /tmp/sketchai-quickdraw-test-data/drawings \
  --alt-class-indices training/backup/model-333-source/class_indices.json \
  --app-inputs app-canvas-96px=/path/to/app-96x96x3-float32-dump.bin
```

`--app-inputs` takes `(400, 96, 96, 3)` float32 dumps produced by the app's own
preprocessing, so the production path can be scored alongside the bitmap proxies.
The run is deterministic (fixed bootstrap seed 20261118).
