# Batch 1 artwork review

This review is limited to canonical Quick, Draw! categories **1–100**. No Batch 2 or Batch 3 artwork was added.

## Contact sheets

The 100-row overview is `batch-1-contact-sheet.png` (822 × 18,068). For legible review, use the ten full-resolution pages:

| File | Canonical categories |
|---|---:|
| `batch-1-contact-sheet-01.png` | 1–10 |
| `batch-1-contact-sheet-02.png` | 11–20 |
| `batch-1-contact-sheet-03.png` | 21–30 |
| `batch-1-contact-sheet-04.png` | 31–40 |
| `batch-1-contact-sheet-05.png` | 41–50 |
| `batch-1-contact-sheet-06.png` | 51–60 |
| `batch-1-contact-sheet-07.png` | 61–70 |
| `batch-1-contact-sheet-08.png` | 71–80 |
| `batch-1-contact-sheet-09.png` | 81–90 |
| `batch-1-contact-sheet-10.png` | 91–100 |

Each row identifies the category and shows the primary plus up to two alternatives from the app's default artwork pool, with a separate SketchAI line drawing when appropriate. Green options count as distinct; beige **NOT COUNTED** tiles still show an app-visible near-duplicate or weak option that was excluded from completeness counts. Blank hatched tiles are not invented artwork. `FALLBACK · TEXT ONLY` means no clean drawing is currently available.

## Counting rule and latest QA snapshot

A clean option is counted only if it renders, fits the frame, depicts the category, and is not a visual/semantic near-duplicate. The raster comparison uses intersection-over-union after one-pixel dilation, with a 0.62 cutoff; manual human-review decisions are recorded in `../../scripts/batch1-artwork-review.mjs`. Legacy icon/emoji fallbacks do not count as clean drawings.

Latest Batch-1 QA: **99/100** categories have a clean primary; the distinct-option distribution is **12 with 3+, 29 with exactly 2, 58 with exactly 1, and 1 with none**. The single no-clean-art category is **camouflage**, which remains text-only. The app's existing clean line art remains available, including options explicitly marked not counted here.

The current output set contains **25** reviewed, licensed source variants across **24** labels and **13** original local derived drawings. See `../../scripts/oss-art-credits.json`, `../../scripts/oss-art-variant-credits.json`, and `../../src/data/batch1-derived-art.js` for attribution and provenance.

Regenerate the overview and pages with:

```sh
node scripts/render-batch1-contact-sheet.mjs
```
