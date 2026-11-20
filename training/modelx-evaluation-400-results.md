# ModelX evaluation on the frozen 400-drawing set

> **Superseded for the updated archive.** A newer `modelX (2).zip` was supplied on
> 2026-11-20 and measured end-to-end with the confirmed input contract; see
> [`modelx-v2-evaluation-400.md`](modelx-v2-evaluation-400.md). This file records
> the earlier archive and the first exploratory probes, kept for provenance.

## Result

The first app-style ModelX run scored very low on the same 400 drawings, but
that pipeline used white ink on black and is now known not to match the training
polarity. The user has since confirmed ModelX's input contract: black strokes on
a white background, float32 values in 0–1, and 96×96×3 RGB. The direct-resize
experiments below match those confirmed input properties; their exact resize
filter remains unknown, so they are still exploratory rather than a definitive
model ranking.

| Metric | ModelX initial app-style diagnostic (polarity mismatch) | Project 345-class reference | Difference |
| --- | ---: | ---: | ---: |
> **345 reference updated 2026-11-20.** The CPU refinement described in
> [`model-345-refinement-2026-11-20.md`](model-345-refinement-2026-11-20.md) moved the
> same-model figures to 158 / 233 / 257 / 282 (39.5% / 58.2% / 64.2% / 70.5%). The
> 345 column below still shows the pre-refinement weights, so the gaps shown are
> conservative for the shipped model.

| Top-1 | 3/400 — **0.8%** (95% Wilson CI 0.3–2.2%) | 152/400 — **38.0%** (33.4–42.8%) | −37.3 pp |
| Top-3 | 9/400 — **2.3%** (1.2–4.2%) | 222/400 — **55.5%** (50.6–60.3%) | −53.3 pp |
| Top-5 | 10/400 — **2.5%** (1.4–4.5%) | 248/400 — **62.0%** (57.2–66.6%) | −59.5 pp |
| Top-10 | 10/400 — **2.5%** (1.4–4.5%) | 280/400 — **70.0%** (65.3–74.3%) | −67.5 pp |

These paired cluster-bootstrap intervals describe the initial polarity-mismatch
run only; they should not be used as the comparison for the now-confirmed
input convention. The 345-class reference figures are from
[`evaluation-400-results.md`](evaluation-400-results.md).

## Compatibility and protocol

- The archive loads as a Keras Sequential model with input shape **96×96×3**
and output shape **333**. This is not the existing app's 96×96×1, supplied
333-class artifact/profile; ModelX cannot be dropped into that profile as-is.
- `class_indices (1).json` contains exactly 333 unique, contiguous indices
(0–332), and all 40 test labels occur in its keys. This verifies map shape and
coverage, **not** that the mapping matches the learned neuron order.
- The user confirmed ModelX was trained for **white background, black strokes,
96×96×3 RGB, float32 normalized to 0–1**, with a batch dimension at inference.
The direct-resize experiments below match these polarity, shape, and value-range
requirements, replicating the grayscale drawing across RGB channels.
- The initial app-style run instead used white ink on black with the app's
96×96 crop/area-average/contrast normalization. It is retained as a diagnostic,
not as a score using the confirmed training convention.
- The precise training resize/crop/rendering procedure and output-label alignment
are still unverified. The supplied map has 333 unique contiguous indices and all
40 tested labels, but that does not prove neuron-order alignment. Training-data
provenance is also missing, so overlap with the test examples is unknown.

## Additional 96×96 direct-resize experiment

To match the confirmed input contract, I resized each original 28×28 test
bitmap directly to 96×96, inverted it to black strokes on a white background,
replicated it across RGB, and passed float32 values in 0–1 with a batch dimension.
Because the exact training resize filter was not supplied, common filters were
tested; area resizing had the best observed top-1 and nearest-neighbor the best
top-10:

| Direct 96×96 input | Top-1 | Top-3 | Top-5 | Top-10 |
| --- | ---: | ---: | ---: | ---: |
| Area resize, black ink on white, 0–1 | 15/400 (3.8%) | 43/400 (10.8%) | 61/400 (15.3%) | 88/400 (22.0%) |
| Nearest resize, black ink on white, 0–1 | 12/400 (3.0%) | 38/400 (9.5%) | 56/400 (14.0%) | 90/400 (22.5%) |
| Bicubic resize, black ink on white, 0–1 | 8/400 (2.0%) | 20/400 (5.0%) | 35/400 (8.8%) | 67/400 (16.8%) |
| Bilinear resize, black ink on white, 0–1 | 3/400 (0.8%) | 14/400 (3.5%) | 30/400 (7.5%) | 57/400 (14.3%) |

This improves on the first app-style ModelX run (3/400 top-1), but remains
below the 345 model's 152/400 top-1. The reported polarity is now known; the
resize filter remains unknown. Since multiple preprocessing variants were
compared on this same test set, do not select a production pipeline based on the
best observed score. Also, the source Quick, Draw! images are already 28×28;
enlarging them to 96×96 adds no original detail.

## Conclusion

The direct 96×96 runs now match the reported polarity, RGB shape, float32 range,
and batch input convention, but their scores remain below the 345-class
reference. The exact resize/crop/rendering procedure and output-label alignment
are still unknown, so these results do not settle ModelX's true capability. Get
the precise training transform and verify class-index ordering against the
trained output layer before making a production comparison. Do not replace the
current model on the basis of these exploratory runs.

Full per-drawing ranks, top-10 predictions, per-class results, protocol details,
and paired bootstrap intervals are in
[`modelx-evaluation-400-results.json`](modelx-evaluation-400-results.json).
The frozen source rows are unchanged at
[`evaluation-400-manifest.json`](evaluation-400-manifest.json).
