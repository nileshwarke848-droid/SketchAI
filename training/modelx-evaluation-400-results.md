# ModelX evaluation on the frozen 400-drawing set

## Result

ModelX's observed score under the app-style input pipeline was very low and
substantially below the project 345-class model on the exact same 400 drawings.
This result is **provisional, not a definitive model ranking**, because the
ModelX archive does not document its training preprocessing and its input
signature is incompatible with the app's existing 333-class profile.

| Metric | ModelX (provisional app-style input) | Project 345-class reference | ModelX − 345 |
| --- | ---: | ---: | ---: |
| Top-1 | 3/400 — **0.8%** (95% Wilson CI 0.3–2.2%) | 152/400 — **38.0%** (33.4–42.8%) | −37.3 pp |
| Top-3 | 9/400 — **2.3%** (1.2–4.2%) | 222/400 — **55.5%** (50.6–60.3%) | −53.3 pp |
| Top-5 | 10/400 — **2.5%** (1.4–4.5%) | 248/400 — **62.0%** (57.2–66.6%) | −59.5 pp |
| Top-10 | 10/400 — **2.5%** (1.4–4.5%) | 280/400 — **70.0%** (65.3–74.3%) | −67.5 pp |

A paired class-cluster bootstrap (10,000 resamples of the 40 categories) for
ModelX minus the 345-class reference gives 95% intervals of −45.8 to −29.0 pp
(top-1), −62.5 to −42.8 pp (top-3), −68.3 to −50.0 pp (top-5), and −75.0 to
−59.0 pp (top-10). The reference figures are from
[`evaluation-400-results.md`](evaluation-400-results.md).

## Compatibility and protocol

- The archive loads as a Keras Sequential model with input shape **96×96×3**
and output shape **333**. This is not the existing app's 96×96×1, supplied
333-class artifact/profile; ModelX cannot be dropped into that profile as-is.
- `class_indices (1).json` contains exactly 333 unique, contiguous indices
(0–332), and all 40 test labels occur in its keys. This verifies map shape and
coverage, **not** that the mapping matches the learned neuron order.
- The evaluation reused the frozen manifest and identical canvas images from
the earlier comparison (400 drawings, 40 classes, 10 per class). ModelX input
was passed through SketchAI's 96×96 crop/area-average/contrast pipeline as
white ink on black, then that grayscale plane was replicated to RGB and kept
in 0–1. This is a reasonable compatibility adapter, but it is not known to be
the model's training-time input convention.
- Preprocessing sensitivity is material: an exploratory **inverted-polarity**
black-ink-on-white 0–1 input scored 12/400 top-1, 31/400 top-3, 44/400 top-5,
and 74/400 top-10. That diagnostic is not substituted for the stated main
protocol; neither polarity is authenticated as the training convention.
- Training-data provenance, normalization, color/polarity, resizing method,
and output-label alignment were not supplied. Possible overlap with the
Quick, Draw! test records is also unknown.

## Additional 96×96 direct-resize experiment

At the user's request, I also resized each original 28×28 test bitmap directly
to 96×96, replicated the grayscale image across RGB, and tested common resize
filters with both ink polarities, keeping values in 0–1. The best top-1 result
among these exploratory variants used area resizing with black ink on white;
nearest-neighbor resizing had the best top-10 result:

| Direct 96×96 input | Top-1 | Top-3 | Top-5 | Top-10 |
| --- | ---: | ---: | ---: | ---: |
| Area resize, black ink on white, 0–1 | 15/400 (3.8%) | 43/400 (10.8%) | 61/400 (15.3%) | 88/400 (22.0%) |
| Nearest resize, black ink on white, 0–1 | 12/400 (3.0%) | 38/400 (9.5%) | 56/400 (14.0%) | 90/400 (22.5%) |
| Bicubic resize, black ink on white, 0–1 | 8/400 (2.0%) | 20/400 (5.0%) | 35/400 (8.8%) | 67/400 (16.8%) |
| Bilinear resize, black ink on white, 0–1 | 3/400 (0.8%) | 14/400 (3.5%) | 30/400 (7.5%) | 57/400 (14.3%) |

This improves on the first app-style ModelX run (3/400 top-1), but remains
below the 345 model's 152/400 top-1 and is still only a sensitivity experiment:
we do not know which polarity or resize filter ModelX was trained with. Since
multiple preprocessing variants were compared on this same test set, do not
select a production pipeline based on whichever variant scores best here. Also,
the source Quick, Draw! images are already 28×28; enlarging them to 96×96 adds
no original detail.

## Conclusion

The tested 96×96 variants improved ModelX's observed scores somewhat, but none
establishes that ModelX outperforms the 345-class model or how it performs with
its intended training-time inputs. The RGB adaptation and training
preprocessing remain unverified. For a fair comparison, obtain the exact
training/serving preprocessing (including input range, color polarity,
resize/crop, and channel handling) and confirm the class index ordering against
the trained output layer. Do not replace the current model on the basis of
these exploratory runs.

Full per-drawing ranks, top-10 predictions, per-class results, protocol details,
and paired bootstrap intervals are in
[`modelx-evaluation-400-results.json`](modelx-evaluation-400-results.json).
The frozen source rows are unchanged at
[`evaluation-400-manifest.json`](evaluation-400-manifest.json).
