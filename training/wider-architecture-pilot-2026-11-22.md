# Wider architecture pilot — 2026-11-22

**Question asked.** Train a wider network, on 600 drawings per class, for 2 epochs.

**Two of those three are not available, so here is what was actually run.** This note
records the measurement rather than a guess, including the parts that say "no".

## The 600-drawings question

600 drawings per class cannot be built from this network:

- the only licensed Quick, Draw! source reachable here is `quickdraw.js@1.0.6` from
  npm, and it ships **exactly 100 drawings per category** — verified again today by
  counting rows in all 345 gzipped files (345 × 100 = 34,500);
- `storage.googleapis.com/quickdraw_dataset` and Hugging Face are both unreachable
  from this sandbox (TLS dropped), which is why the mirror was chosen in the first place;
- a GitHub search for a preprocessed `.npy` release of the dataset returns only
  trained models and toy samples, nothing with 600+ rows per class.

Inventing drawings is not an option: the model's whole claim is that it was trained
on real Quick, Draw! data. So the pilot used **all 34,500 available drawings**
(27,600 train / 3,450 validation / 3,450 test).

## The 2-epoch question

Two epochs is a plumbing test, not an accuracy test: from a random start the network
sees each drawing twice. Both widths end up near chance (0.29 %).

| width | filters / head | params | epoch time | test top-1 | top-3 | top-10 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (shipped shape) | 32/64/128 · 256 | 214,649 | 14 s | 2.03 % | 5.13 % | 13.94 % |
| 2 (wider) | 64/128/256 · 512 | 678,809 | 35 s | 2.20 % | 6.52 % | 16.99 % |

The wider net learns faster per epoch even here (top-10 13.94 → 16.99 %), but both
numbers are noise-level and cannot rank the architectures.

## So it was run at 20 epochs — the smallest budget that says anything

Same split, same seed (42), same augmentation (translation ±5 %, rotation ±0.05 rad,
pen-width jitter), train rows only, test rows never touched:

| width | params | weights | 20-epoch time | test top-1 | top-3 | top-10 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (shipped shape) | 214,649 | 0.86 MB | 4.4 min | 30.72 % | 49.22 % | 69.48 % |
| 2 (wider) | 678,809 | 2.72 MB | 12.4 min | **31.42 %** | **51.25 %** | **71.36 %** |

Delta: **+0.70 pp** top-1, **+2.03 pp** top-3, **+1.88 pp** top-10 — for **2.8× the
training time** and **3.2× the browser download** (2.72 MB vs 0.86 MB of weights).

## Verdict

The wider network is **not obviously worth it**. It is a little better per epoch, but:

- the gain at equal budget (+0.7 pp) is smaller than the gain the shipped model got
  from simply training longer (+2.38 pp from refinement, +0.64 pp from continuation);
- it costs 2.8× the CPU time and 3.2× the download, on a project whose selling point
  is a 0.88 MB model that loads instantly in a school lab;
- the ceiling is the dataset, not the capacity: 100 drawings per class is the binding
  constraint, and a bigger network mainly memorises those 100 faster.

Deciding whether width 2 beats the shipped 40.72 % needs a convergence run
(~60 epochs ≈ 38 min on this CPU, plus export, parity and the paired test). That is
the right experiment to run next — not a 2-epoch screenshot.

## What is deliberately unchanged

`public/model-345/` still ships the 40.72 % width-1 model. Nothing here touches it,
because nothing here beat it — the pilots are trained on train-rows-only for 20
epochs and are far behind a model that trained on train + validation for 130 epochs.

## Reproduce

```bash
python training/fetch_quickdraw_data.py
python training/wider_345.py --width 1 --epochs 2      # control, 2 epochs
python training/wider_345.py --width 2 --epochs 2      # wider, 2 epochs
python training/wider_345.py --width 1 --epochs 20     # control, real budget
python training/wider_345.py --width 2 --epochs 20     # wider, real budget
```

Each run writes `model.keras` + `report.json` (params, weights size, per-epoch
history, test top-1/3/10, timings) under `training/work/wider/`, which is gitignored.
`--width 3` (96/192/384 · 768) is wired up but was not run — it would be 4.5 MB and
about 3× the width-2 cost for a trend that is already flat.
