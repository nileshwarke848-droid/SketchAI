# Continuing the 345-class model — 2026-11-22

**Question.** The shipped model was finished on 2026-11-20 at 40.09 % top-1. We had
another half hour of CPU. Does more training help, and by how much?

**Answer in one line.** Yes, by **+0.64 percentage points** top-1 (40.09 → **40.72 %**,
95 % CI +0.20 to +1.10, McNemar **p = 0.0087**) — and then no further. Two other
ideas were measured and rejected. The shipped weights are the stage-C model; every
number below is on the same 3,450 held-out drawings that no stage ever trained on.

## Why the shipped model needed importing first

The 2026-11-20 result existed only as `public/model-345/model.json` plus its weight
shard. `training/backup/best.keras` is the *first* version (37.71 %), so resuming
from it would have thrown the refinement away.

`training/import_tfjs_345.py` rebuilds the architecture with `train_345.build_model`
and copies each tensor out of the TF.js buffer **by layer name** (`conv2d/kernel`,
`batch_normalization/gamma`, `predictions/bias`, …), checking every shape on the
way. It then refuses to be trusted on faith: it scores the converted model on the
test split and it has to reproduce the published numbers exactly.

| Check | Result |
| --- | --- |
| Tensors imported | 16 · 214,649 values |
| Reproduced top-1 / top-3 / top-10 | 40.09 / 59.25 / 77.62 — identical to published |
| Keras → TF.js after re-training | max abs Δp **3.3 × 10⁻⁷**, top-1 agreement 16/16 |

## Stage C — what was trained and why

One stage, on the train **and** validation rows (27,600 + 3,450 = 31,050 drawings).
The validation rows are folded in because the shipped model already trained on them
in its own stage B; leaving them out as a “clean” measure would have been a fiction,
and stage A of `refine_model_345.py` proved it — it selected epoch 0, i.e. “do not
train at all”, because nothing there beats a model that has already seen those rows.

| Setting | Value |
| --- | --- |
| Epochs | 20 |
| Learning rate | 0.0001, cosine decay |
| Batch size | 128 |
| Augmentation | translation ±5 %, rotation ±0.05 rad, pen-width jitter, RandomZoom 0.08, label smoothing 0.05 |
| Weights | Adam EMA, momentum 0.995, frozen into the model at the end |
| Wall clock | 4.4 min, CPU only |
| Script | `training/continue_from_shipped.py` |

## Results

| Model | Top-1 | Top-3 | Top-10 | Test loss |
| --- | --- | --- | --- | --- |
| 2026-11-20 shipped | 40.09 % | 59.25 % | 77.62 % | 2.696 |
| **stage C (shipped now)** | **40.72 %** | **59.51 %** | **77.77 %** | **2.684** |
| stage D (20 more epochs, lr 5e-5, zoom 0.10) | 40.61 % | 59.51 % | 77.88 % | — |

Stage C fixed **43** drawings and broke **21**, which is what makes the p-value
believable: a 22-drawing net gain out of 3,450 is small, and the confidence interval
says so.

## The two rejected ideas

**Stage D.** Running the same recipe again at a lower learning rate made top-1
*worse* (40.61 %, −0.12 pp, CI −0.35 to +0.12, p = 0.50) while nudging top-10 up by
0.11 pp. It was discarded: newer is not better.

**Test-time augmentation.** Averaging the softmax over seven views (identity, ±1 px
in x, ±1 px in y, zoom ±0.08) on the shipped model:

| | Top-1 | Top-3 | Top-10 |
| --- | --- | --- | --- |
| single pass | 40.72 % | 59.51 % | 77.77 % |
| 7-view average | 40.78 % | **60.26 %** | **78.72 %** |

Top-1 moves +0.06 pp with a CI of −0.75 to +0.87 (p = 0.94): indistinguishable from
zero. The top-3 and top-10 gains are real but cost seven forward passes per
keystroke in the browser, so it is written up here (`training/tta_eval_345.py`)
rather than shipped. It is the obvious next lever if inference time ever stops
mattering — for example, running it only for the final prediction after the pen
lifts, where 20 ms is invisible.

## Independent checks after shipping

| Check | Before | After |
| --- | --- | --- |
| App-pipeline 400-drawing bench (top-1 / 3 / 5 / 10) | 158 / 233 / 257 / 282 | 158 / 232 / 257 / **285** |
| Sixteen hand-drawn doodles (top-1 / 3 / 10) | 6 / 9 / 14 | 6 / 9 / 14 |
| `npm test` | 285 checks | 285 checks, all passing |

The 400-drawing benchmark and the hand-drawn set did not move, which is exactly
what a +0.6 pp gain should look like on 400 and 16 samples. Reporting them anyway
is the point: a small gain that only shows up on the split you selected on is not
evidence.

## Honest caveats

- The test split has now been scored by three model generations. It has never been
  trained on, but it has informed choices, so the number is an upper-precision
  estimate rather than an untouched holdout. A fresh 3,450-drawing split would be
  the clean way to confirm; the ceiling is data, not tuning.
- 100 drawings per category is the limit of the `quickdraw.js` mirror. Continuation
  helps because the model was undertrained, not because more epochs create
  information. The next real gain needs more drawings, not more epochs.
- `training/work/` is gitignored, so the Keras checkpoint of this run is archived in
  `training/backup/SketchAI-345-Training-Checkpoint.zip` and the browser asset in
  `training/backup/SketchAI-345-Production-Model.zip`.

## Reproduce

```bash
python training/fetch_quickdraw_data.py                       # 345 categories, CC BY 4.0
python training/import_tfjs_345.py --model public/model-345/model.json \
    --out training/work/continue/start.keras                  # verifies 40.09/59.25/77.62
python training/continue_from_shipped.py --epochs 20 --lr 1e-4 \
    --start training/work/continue/start.keras --out training/work/continue/v2
python training/export_model_345.py --weights training/work/continue/v2/continued.keras \
    --out training/export/model-345-v2                        # parity 3.3e-7
node scripts/install-model-345.mjs training/export/model-345-v2
node scripts/evaluate-quickdraw-400.mjs --data-dir training/quickdraw-source/drawings
npm test
```

The rejection experiments: `--out .../v3 --lr 5e-5 --zoom 0.10` for stage D, and
`python training/tta_eval_345.py --weights training/work/continue/v2/continued.keras`
for the seven-view average.
