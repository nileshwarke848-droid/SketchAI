# 345-class model — CPU refinement, 2026-11-20

The shipped 345-class model (60 epochs, 37.71 % top-1 on its held-out split) was
picked back up and trained for another 50 epochs on CPU, without changing the
architecture, the input contract or the class order. It now scores
**40.09 % top-1 / 59.25 % top-3 / 77.62 % top-10**, and `public/model-345/` ships
those weights.

Everything below is reproducible from this repository with
`training/refine_model_345.py` + `training/export_model_345.py`.

## What was run

Both stages start from the existing checkpoint
(`training/backup/SketchAI-345-Training-Checkpoint.zip` → `best.h5`) and keep the
same per-class 80/10/10 split (`seed=42`), so the test rows are the same 3,450
drawings as before and are never trained on.

**Stage A — warm-up on the train rows (24 epochs, ~7 min).**
`train_345.py` already augments with ±0.05 translation/rotation and a stroke
thickness/intensity jitter; the one invariance it lacks is scale, which matters
when a user's funnel is not drawn with Quick, Draw!'s pen. Added
`RandomZoom(0.06)`, label smoothing 0.05, Adam with cosine decay 2e-4 → 5 %,
batch 128, checkpoint = best validation accuracy.

**Stage B — finish on train + validation rows with EMA (26 epochs, ~8 min).**
Stage A's validation rows stop being an unbiased estimator once they are used for
model selection, so they are folded into training (31,050 rows) and the cosine
decay restarts at 1e-4 → 2 %. Adam EMA (`use_ema=True, ema_momentum=0.99`)
averages the weights over the tail of training; `finalize_variable_values()`
freezes that average into the model before export. Metrics are reported on the
test rows only.

## Results (3,450 held-out drawings, identical rows for every row below)

| stage | top-1 | top-3 | top-10 | loss |
|---|---|---|---|---|
| shipped weights (60 epochs) | 37.71 % | 58.12 % | 76.12 % | 2.824 |
| after stage A (24 epochs) | 38.38 % | 57.42 % | 76.23 % | — |
| stage B, 10 epochs + EMA (alternative) | 39.88 % | 59.36 % | 77.36 % | — |
| **stage B, 26 epochs + EMA (shipped)** | **40.09 %** | **59.25 %** | **77.62 %** | **2.696** |

Paired comparison, shipped vs. this model, on the same 3,450 drawings:

- **+2.38 pp top-1**; per-class cluster bootstrap 95 % CI **+1.42 … +3.36 pp**
- McNemar: 169 drawings fixed vs 87 broken, chi² = 25.6, **p = 4.1e-7**
- parameters stay at 214,649 and the export is 0.88 MB, so app load time is unchanged

The 10-epoch and 26-epoch stage-B runs differ by 0.2 pp on the test split and
1.0 pp on the 400-drawing benchmark — i.e. they are indistinguishable. The longer
schedule is shipped because it was fixed before looking at the result, not because
it won.

Through the app's own code path (`scripts/evaluate-quickdraw-400.mjs`, which
replays `src/ai/preprocess.js` and loads the TF.js asset): **152/400 → 158/400**
top-1 (38.0 % → 39.5 %), top-3 222 → 233, top-10 248 → 282.

## Where it does *not* get better

`scripts/manual-test-345.mjs` draws sixteen doodles through the browser path:

| | top-1 | top-3 | top-10 |
|---|---|---|---|
| previous weights | 7/16 | 9/16 | 12/16 |
| shipped weights | 6/16 | 9/16 | 14/16 |

One drawing flipped: the umbrella, which used to come out at 63 % and now splits
48 % umbrella / 45 % mushroom. Sixteen samples cannot separate two weight sets —
the point of quoting this row is that the improvement is a modest shift on
Quick, Draw!-style ink, not a new model.

## Reproduction

```bash
# 1. get the drawings (100 per class, the mirror's ceiling)
python training/fetch_quickdraw_data.py --dest training/quickdraw-source/drawings

# 2. continue training (~16 min CPU; writes refined.keras + refinement.json)
python training/refine_model_345.py \
    --checkpoint training/backup/best.h5 \
    --data-dir training/quickdraw-source/drawings \
    --out training/work/refine

# 3. export to TF.js, patching the two Keras-3 renames and verifying against Keras
python training/export_model_345.py \
    --weights training/work/refine/refined.keras \
    --manifest training/work/refine/manifest.json

# 4. install into the app (validates 345 labels, 345 outputs, 28x28x1 input)
node scripts/install-model-345.mjs training/export/model-345

# 5. check the browser path end to end
node scripts/evaluate-quickdraw-400.mjs \
    --data-dir training/quickdraw-source/drawings \
    --manifest training/evaluation-400-manifest.json
node scripts/manual-test-345.mjs
```

## Export: two Keras 3 → TF.js gotchas

`tensorflowjs_converter` on a Keras 3 model produces a `model.json` that
tfjs-layers 4.22 rejects; `training/export_model_345.py` fixes both automatically
and refuses to install anything that disagrees with Keras by more than 1e-4:

1. the input layer's shape is written as `batch_shape`, tfjs wants
   `batch_input_shape` — otherwise `An InputLayer should be passed either a
   batchInputShape or an inputShape`;
2. weights can be prefixed with the model name (`sketchai_345/conv2d/kernel`),
   while tfjs looks them up as `conv2d/kernel` — otherwise
   `Provided weight data has no target variable`.

Also note that converting a **SavedModel** produces a TF.js *GraphModel*, which
`tf.loadLayersModel()` (what `src/ai/model.js` uses) cannot read. Always convert
the Keras file with `--input_format=keras`.

After patching, TF.js and Keras agree to max |Δp| = 2.7e-7 with 16/16 top-1
agreement, which is what makes the numbers above valid for the browser.

## Artifacts

- `public/model-345/` — the shipped TF.js asset + `manifest.json` with both runs
- `training/backup/SketchAI-345-Production-Model.zip` — same asset + `METRICS.md`
- `training/backup/SketchAI-345-Training-Checkpoint.zip` — original run *and*
  `refined/` (the weights this report is about, plus `refinement.json`)
- `training/refine_model_345.py`, `training/export_model_345.py` — the scripts

## Caveats

- The test split has now been scored a handful of times while choosing the recipe,
  so +2.38 pp carries a little optimism. The independent 400-drawing benchmark
  (+1.5 pp through the app pipeline) is smaller but agrees in sign and size.
- `samples_per_class=100` is the ceiling of the reachable mirror; more data would
  help far more than more epochs from here.
- Class order, preprocessing and the input contract are untouched — this is a
  drop-in weight swap.
