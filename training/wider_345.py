#!/usr/bin/env python3
"""Pilot: does a wider network learn more per epoch than the shipped one?

The shipped model is 32/64/128 filters with a 256-unit head (214,649 parameters,
0.88 MB). This script builds wider versions of the same shape — same layers, same
augmentation, same split, same seed — and measures what they reach in a fixed,
deliberately small number of epochs. It answers one question only: *at equal
budget, is the extra capacity worth anything?*

It does not touch `public/model-345/`. Training the winner to convergence is a
separate step, and the comparison has to survive the same paired test the shipped
model did.

Data ceiling: the quickdraw.js mirror holds 100 drawings per category (34,500 in
total), so "600 drawings per class" cannot be satisfied from this network. The
script refuses to invent data and trains on everything the licence allows.

Usage::

    python training/wider_345.py --width 1 --epochs 2     # control (shipped shape)
    python training/wider_345.py --width 2 --epochs 2     # 64/128/256 + 512-unit head
    python training/wider_345.py --width 3 --epochs 2     # 96/192/384 + 768-unit head
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

WIDTHS = {
    1: {"filters": (32, 64, 128), "dense": 256},
    2: {"filters": (64, 128, 256), "dense": 512},
    3: {"filters": (96, 192, 384), "dense": 768},
}


def build_wider(num_classes: int, width: int, dropout: float, seed: int = 42):
    """The same network as `train_345.build_model`, with wider layers."""
    import tensorflow as tf

    design = WIDTHS[width]
    f1, f2, f3 = design["filters"]
    tf.keras.utils.set_random_seed(seed)
    model = tf.keras.Sequential(
        [
            tf.keras.layers.Input(shape=(T.IMAGE_SIZE, T.IMAGE_SIZE, 1)),
            tf.keras.layers.Conv2D(f1, 3, padding="same", use_bias=False),
            tf.keras.layers.BatchNormalization(),
            tf.keras.layers.Activation("relu"),
            tf.keras.layers.MaxPooling2D(),
            tf.keras.layers.Conv2D(f2, 3, padding="same", use_bias=False),
            tf.keras.layers.BatchNormalization(),
            tf.keras.layers.Activation("relu"),
            tf.keras.layers.MaxPooling2D(),
            tf.keras.layers.Conv2D(f3, 3, padding="same", activation="relu"),
            tf.keras.layers.GlobalAveragePooling2D(),
            tf.keras.layers.Dense(design["dense"], activation="relu"),
            tf.keras.layers.Dropout(dropout),
            tf.keras.layers.Dense(num_classes, activation="softmax", name="predictions"),
        ],
        name=f"sketchai_345_w{width}",
    )
    return model


def evaluate_test(model, bundle: T.DatasetBundle, batch: int = 512) -> dict:
    """Top-1/3/10 on the held-out test rows, straight from the cached bitmaps."""
    pairs = bundle.test.indices
    labels = pairs[:, 0].astype(np.int64)
    images = np.zeros((len(pairs), T.IMAGE_SIZE, T.IMAGE_SIZE, 1), np.float32)
    for i, (label, row) in enumerate(pairs):
        images[i, :, :, 0] = bundle.cache[int(label)][int(row)].astype(np.float32).reshape(
            T.IMAGE_SIZE, T.IMAGE_SIZE) / 255.0
    probs = model.predict(images, batch_size=batch, verbose=0)
    order = np.argsort(-probs, axis=1)
    hits = {
        "n": int(len(labels)),
        "top1": round(float((order[:, 0] == labels).mean() * 100), 2),
        "top3": round(float((order[:, :3] == labels[:, None]).any(axis=1).mean() * 100), 2),
        "top10": round(float((order[:, :10] == labels[:, None]).any(axis=1).mean() * 100), 2),
    }
    truth = probs[np.arange(len(labels)), labels][:, None]
    hits["ranks"] = ((probs > truth).sum(axis=1) + 1).astype(np.int32)
    return hits


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--width", type=int, default=2, choices=sorted(WIDTHS))
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--dropout", type=float, default=0.4)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", default=None)
    args = parser.parse_args(argv)

    import tensorflow as tf

    out = Path(args.out or (HERE / "work" / "wider" / f"w{args.width}-e{args.epochs}"))
    out.mkdir(parents=True, exist_ok=True)

    categories = T.fetch_categories()
    cfg = T.Config(batch_size=args.batch_size, seed=args.seed)
    try:
        bundle = T.build_splits(categories, cfg)
    except FileNotFoundError:
        print("28x28 cache missing — building it from the drawings first…")
        T.download_dataset(categories, cfg)
        bundle = T.build_splits(categories, cfg)

    model = build_wider(len(categories), args.width, args.dropout, args.seed)
    params = int(model.count_params())
    weights_mb = params * 4 / 1e6
    print(f"width {args.width}: filters {WIDTHS[args.width]['filters']}, head {WIDTHS[args.width]['dense']} "
          f"→ {params:,} params ({weights_mb:.2f} MB as float32)")
    print(f"training on {len(bundle.train):,} train rows, validating on {len(bundle.val):,}, "
          f"test {len(bundle.test):,} untouched")

    train_ds, steps = T.make_dataset(bundle, "train", training=True)
    val_ds, val_steps = T.make_dataset(bundle, "val", training=False)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(args.lr),
        loss=tf.keras.losses.SparseCategoricalCrossentropy(),
        metrics=["accuracy"],
    )

    started = time.time()
    history = model.fit(
        train_ds, validation_data=val_ds, steps_per_epoch=steps, validation_steps=val_steps,
        epochs=args.epochs, verbose=2,
    )
    minutes = (time.time() - started) / 60

    report = {
        "width": args.width,
        "design": {"filters": list(WIDTHS[args.width]["filters"]), "dense": WIDTHS[args.width]["dense"]},
        "params": params,
        "weights_mb_f32": round(weights_mb, 2),
        "epochs": args.epochs,
        "lr": args.lr,
        "batch_size": args.batch_size,
        "dropout": args.dropout,
        "seed": args.seed,
        "train_rows": int(len(bundle.train)),
        "test_rows": int(len(bundle.test)),
        "minutes": round(minutes, 2),
        "history": {key: [round(float(v), 4) for v in values] for key, values in history.history.items()},
    }

    test = evaluate_test(model, bundle)
    np.save(out / "ranks.npy", test.pop("ranks"))
    report["test"] = test
    print(f"\ntest after {args.epochs} epochs: top-1 {test['top1']:.2f}%  top-3 {test['top3']:.2f}%  "
          f"top-10 {test['top10']:.2f}%   ({minutes:.1f} min)")

    model.save(out / "model.keras")
    (out / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"wrote {out / 'model.keras'} and {out / 'report.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
