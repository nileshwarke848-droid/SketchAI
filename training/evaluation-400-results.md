# 400-drawing paired model evaluation

## Result

The existing **345-class model is substantially ahead** on this test set. Both
models received the same 400 inputs through SketchAI's current inference and
preprocessing code.

| Metric | Supplied 333-class model | Existing 345-class model | Difference (333 − 345) |
| --- | ---: | ---: | ---: |
| Top-1 | 82/400 — **20.5%** (95% Wilson CI 16.8–24.7%) | 152/400 — **38.0%** (33.4–42.8%) | −17.5 percentage points |
| Top-3 | 135/400 — **33.8%** (29.3–38.5%) | 222/400 — **55.5%** (50.6–60.3%) | −21.8 pp |
| Top-5 | 162/400 — **40.5%** (35.8–45.4%) | 248/400 — **62.0%** (57.2–66.6%) | −21.5 pp |
| Top-10 | 210/400 — **52.5%** (47.6–57.3%) | 280/400 — **70.0%** (65.3–74.3%) | −17.5 pp |

A paired bootstrap over the 40 class clusters (10,000 resamples) gives these
95% intervals for the top-k accuracy difference, 333 minus 345:

| Metric | Class-cluster bootstrap 95% CI |
| --- | ---: |
| Top-1 | −25.5 to −9.5 pp |
| Top-3 | −31.0 to −12.8 pp |
| Top-5 | −29.8 to −13.3 pp |
| Top-10 | −26.3 to −9.0 pp |

All intervals favor the 345-class model for this sample. The 345-class result
(38.0% top-1) is also close to its documented full held-out score of 37.7%,
which is a useful check that the test sampling/split is behaving as expected.

## Test design

- Source: Google Quick, Draw! official bitmap data through `quickdraw.js@1.0.6`
  (CC BY 4.0), which provides 100 records for each of the 345 official classes.
- Class selection: 40 classes selected uniformly without replacement from the
  333 labels shared by both models, with selection seed `20261108`.
- Samples: 10 drawings per selected class, 400 total.
- Holdout: the exact 10% test partition used by this repository's 345-class
  training procedure: for each class, apply NumPy `default_rng(42).permutation(100)`
  and use rows 90–99 of the permutation. These drawings are disjoint from that
  model's 80% training and 10% validation partitions.
- Inference: Quick, Draw! bitmaps were alpha-rendered at a fixed size on a
  transparent SketchAI canvas, then passed through the app's current per-model
  preprocessing and prediction functions. The exact same image/canvas is used
  for both models. Top-k is measured against the official category label.
- Categories: arm, bed, bird, brain, broccoli, bucket, candle, cat, chandelier,
  computer, crocodile, cup, dragon, dresser, drill, dumbbell, floor lamp, foot,
  frog, hammer, headphones, helicopter, hockey puck, lightning, lobster, mug,
  nail, pear, remote control, sandwich, saw, scissors, shovel, snorkel, stereo,
  tiger, tooth, tractor, t-shirt, violin.

The frozen source-row list is [`evaluation-400-manifest.json`](evaluation-400-manifest.json).
Full per-drawing top-10 outputs, per-class results, confidence intervals, and
protocol metadata are in [`evaluation-400-results.json`](evaluation-400-results.json).
The manifest SHA-256 is `e0b99a688335b9ea9328539a87565bfd157e31e019ace2359762b5b582edfbb3`.

Reproduce from the repository root (the fetch script stores data outside Git):

```sh
python training/fetch_quickdraw_data.py --dest /tmp/sketchai-quickdraw-test-data
python scripts/make-quickdraw-400-manifest.py
node --expose-gc scripts/evaluate-quickdraw-400.mjs \
  --data-dir /tmp/sketchai-quickdraw-test-data/drawings \
  --manifest training/evaluation-400-manifest.json \
  --out training/evaluation-400-results.json
```


## Important limits on the conclusion

This is a much stronger comparison than the earlier 16-doodle smoke test, but
it does **not** certify the supplied model's generalization:

1. The supplied 333-class archive contains no training-data provenance, so it is
   unknown whether these Quick, Draw! drawings overlap with its training data.
2. Its attached class-index map has not been verified against the model's learned
   output-neuron order. Scores assume the attached map is correct.
3. Its training input normalization is undocumented. The test uses the app's
   provisional 333-class preprocessing; a mismatch could depress its score.
4. This evaluation samples 40 of the shared classes, not all 333 labels or the
   full drawing population.

Accordingly, the data strongly supports keeping the **345-class model as the
app default**. The 333-class model should remain evaluation-only until its label
map and training preprocessing are verified. The observed gap is large, but the
missing provenance means it should not be described as an audited benchmark of
the 333 model itself.
