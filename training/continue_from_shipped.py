#!/usr/bin/env python3
"""Keep training the shipped model — one controlled stage, scored honestly.

`refine_model_345.py` was written to take the *base* 60-epoch checkpoint (37.7 %
top-1) up to the shipped model (40.1 %). Its two stages are therefore inappropriate
as a starting point here: stage A holds the validation rows out and selects the
best epoch on them, but the shipped model already trained on those rows in its own
stage B, so its validation score is optimistic and the selection would just pick
epoch 0 and move on.

This script does the honest version of "train it more":

* it starts from the shipped weights (imported back from the TensorFlow.js asset,
  see ``import_tfjs_345.py``);
* it trains one stage over the train **and** validation rows (27,600 + 3,450) with
  a small cosine-decayed learning rate, the same zoom/smoothing/thickness
  augmentation, and Adam EMA weights that are frozen into the model at the end;
* it never trains on the test rows, and it scores the result on those 3,450
  drawings against the starting model with a paired bootstrap + McNemar test, so
  a gain has to survive the same bar the published +2.38 pp had to clear.

Usage::

    python training/continue_from_shipped.py --epochs 20 --lr 1e-4 --out training/work/continue/v2

Nothing is written to ``public/`` — export is a separate, verified step.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import train_345 as T  # noqa: E402  (sets TF_USE_LEGACY_KERAS before TF loads)
import refine_model_345 as R  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--start", default=str(HERE / "work" / "continue" / "start.keras"))
    parser.add_argument("--out", default=str(HERE / "work" / "continue" / "v2"))
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--zoom", type=float, default=0.08)
    parser.add_argument("--label-smoothing", type=float, default=0.05)
    parser.add_argument("--ema-momentum", type=float, default=0.995)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args(argv)

    import tensorflow as tf

    tf.keras.utils.set_random_seed(args.seed)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    categories = T.fetch_categories()
    cfg = T.Config()
    bundle = T.build_splits(categories, cfg)

    start = Path(args.start)
    model = R.load_checkpoint(start, len(categories), cfg)
    model.compile(optimizer=tf.keras.optimizers.Adam(args.lr),
                  loss="sparse_categorical_crossentropy", metrics=["accuracy"])

    # A namespace is all stage_b reads; keep the same knobs the refined run used.
    stage_args = argparse.Namespace(
        ema_momentum=args.ema_momentum,
        finish_epochs=args.epochs,
        finish_lr=args.lr,
        zoom=args.zoom,
        label_smoothing=args.label_smoothing,
        batch_size=args.batch_size,
        seed=args.seed,
    )

    report: dict = {
        "start": str(start),
        "params": int(model.count_params()),
        "recipe": {
            "stage": "train + validation rows, Adam EMA, cosine decay",
            "epochs": args.epochs,
            "lr": args.lr,
            "zoom": args.zoom,
            "label_smoothing": args.label_smoothing,
            "ema_momentum": args.ema_momentum,
            "batch_size": args.batch_size,
            "seed": args.seed,
        },
    }

    report["before"], rank_before = R.evaluate(model, bundle, bundle.test.indices, "before / test rows")
    np.save(out / "ranks-before.npy", rank_before)

    started = time.time()
    report["training"] = R.stage_b(model, bundle, cfg, stage_args, out, len(categories), args.seed)
    report["training"]["minutes"] = round((time.time() - started) / 60, 2)

    model.save(out / "continued.keras")
    model.save(out / "continued.h5")
    model.compile(optimizer=tf.keras.optimizers.Adam(args.lr),
                  loss="sparse_categorical_crossentropy", metrics=["accuracy"])

    report["after"], rank_after = R.evaluate(model, bundle, bundle.test.indices, "after / test rows")
    np.save(out / "ranks-after.npy", rank_after)
    report["significance"] = R.paired_significance(rank_after, rank_before,
                                                   bundle.test.indices[:, 0], seed=args.seed + 11)

    delta = report["significance"]["delta_top1_pp"]
    print(f"\ntop-1 {report['before']['top1']:.2f}% -> {report['after']['top1']:.2f}% ({delta:+.2f} pp, "
          f"95% CI {report['significance']['delta_top1_ci95_pp']}, "
          f"McNemar p={report['significance']['mcnemar']['p_two_sided']:.1e})", flush=True)
    print(f"top-3 {report['before']['top3']:.2f}% -> {report['after']['top3']:.2f}%   "
          f"top-10 {report['before']['top10']:.2f}% -> {report['after']['top10']:.2f}%", flush=True)

    (out / "continue.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"\nwrote {out / 'continued.keras'} and {out / 'continue.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
