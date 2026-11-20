#!/usr/bin/env python3
"""Continue training the shipped 345-class model a little further on CPU.

The production model was trained for 60 epochs on 27,600 drawings and reaches
37.7 % top-1 on its 3,450-drawing held-out split. This script picks that exact
checkpoint back up and trains it two more times, in the two stages that were
found to help on CPU in ~10 minutes:

  stage A ("warm-up")  24 epochs over the train rows only, selecting the best
                       epoch on the validation rows. Cosine decay 2e-4 -> 5 %,
                       RandomZoom(0.06) added on top of the trainer's own
                       translation/rotation/thickness jitter, label smoothing
                       0.05. The only augmentation genuinely missing from
                       ``train_345`` was scale invariance.

  stage B ("finish")   26 epochs over train + validation rows with Adam EMA
                       (momentum 0.99, cosine 1e-4 -> 2 %) and the same zoom and
                       smoothing, then the EMA weights are frozen into the model.
                       Small-data fine-tunes benefit from the averaged weights,
                       and the validation rows stop being a held-out estimator,
                       so they are folded into training here.

The test rows are never trained on. They are scored by this script only to
report the result; nothing in the training loop reads them.

Usage::

    python training/refine_model_345.py \\
        --checkpoint training/backup/best.h5 \\
        --out training/work/refine

Expect ~10 minutes on a laptop CPU. The exported result is written to
``<out>/refined.keras`` (plus ``refined.h5`` for the TF.js converter) together
with ``refinement.json``, which records every number printed below.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import train_345 as T  # noqa: E402


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def load_checkpoint(path: Path, num_classes: int, cfg: T.Config):
    """Load `path` into a freshly built model.

    The shipped checkpoints are Keras 2 files; Keras 3 refuses their serialised
    config (BatchNormalization stores ``axis`` as a list, the loss stores a
    ``fn`` kwarg), so the identical architecture is rebuilt and the weights are
    poured into it instead.
    """
    import tensorflow as tf

    model = T.build_model(num_classes, cfg)
    try:
        model.load_weights(str(path))
    except Exception:
        return tf.keras.models.load_model(str(path))
    return model


def rows_to_xy(bundle: T.DatasetBundle, pairs: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    x = np.empty((len(pairs), 28, 28, 1), np.float32)
    for i, (class_index, row) in enumerate(pairs):
        x[i, :, :, 0] = bundle.cache[int(class_index)][int(row)].reshape(28, 28)
    x /= 255.0  # caches hold 0-255 ink; the model wants 0-1
    return x, pairs[:, 0].astype(np.int32)


def evaluate(model, bundle: T.DatasetBundle, pairs: np.ndarray, tag: str, batch: int = 512):
    """Top-1/3/10 plus the per-drawing rank (rank 1 = correct) for [pairs]."""
    ranks: list[int] = []
    loss_sum = 0.0
    pairs = np.asarray(pairs, np.int32)
    for start in range(0, len(pairs), batch):
        chunk = pairs[start:start + batch]
        x, y = rows_to_xy(bundle, chunk)
        probabilities = model.predict(x, verbose=0)
        loss_sum += float(-np.mean(np.log(np.clip(probabilities[np.arange(len(y)), y], 1e-7, 1)))) * len(y)
        order = np.argsort(-probabilities, axis=1)[:, :10]
        hit = order == y[:, None]
        first = hit.any(axis=1)
        rank = np.where(first, np.argmax(hit, axis=1) + 1, 11)  # 11 = outside top-10
        ranks.extend(int(r) for r in rank)
    ranks_array = np.asarray(ranks)
    metrics = {
        "n": int(len(pairs)),
        "top1": round(100 * float((ranks_array <= 1).mean()), 2),
        "top3": round(100 * float((ranks_array <= 3).mean()), 2),
        "top10": round(100 * float((ranks_array <= 10).mean()), 2),
        "loss": round(loss_sum / max(1, len(pairs)), 4),
    }
    print(f"{tag:28s} n={metrics['n']:5d}  top-1 {metrics['top1']:5.2f}%  "
          f"top-3 {metrics['top3']:5.2f}%  top-10 {metrics['top10']:5.2f}%", flush=True)
    return metrics, ranks_array


def paired_significance(new: np.ndarray, old: np.ndarray, classes: np.ndarray, seed: int = 11):
    """Cluster bootstrap CI + McNemar test on top-1, clustered by class."""
    rng = np.random.default_rng(seed)
    gain = (new <= 1).astype(np.int8) - (old <= 1).astype(np.int8)
    totals: dict[int, int] = {}
    for value, label in zip(gain, classes):
        totals[int(label)] = totals.get(int(label), 0) + int(value)
    keys = np.array(list(totals))
    counts = np.array([totals[k] for k in keys], float)
    draws = [counts[rng.integers(0, len(keys), len(keys))].sum() / len(gain) for _ in range(10000)]
    only_new = int(((new <= 1) & ~(old <= 1)).sum())
    only_old = int((~(new <= 1) & (old <= 1)).sum())
    statistic = (abs(only_new - only_old) - 1) ** 2 / max(1, only_new + only_old)
    return {
        "delta_top1_pp": round(100 * float(gain.mean()), 2),
        "delta_top1_ci95_pp": [round(100 * float(np.quantile(draws, 0.025)), 2),
                               round(100 * float(np.quantile(draws, 0.975)), 2)],
        "mcnemar": {"fixed": only_new, "broken": only_old, "chi2": round(statistic, 1),
                    "p_two_sided": float(f"{math.erfc(math.sqrt(statistic / 2)):.2e}")},
    }


def make_config(args) -> T.Config:
    cfg = T.Config(
        dataset="quickdraw-js",
        samples_per_class=100,
        batch_size=args.batch_size,
        seed=args.seed,
        quickdraw_source_dir=Path(args.data_dir),
        cache_dir=Path(args.cache_dir) if args.cache_dir else HERE / "work" / "cache",
        data_dir=HERE / "work" / "data",
        output_dir=Path(args.out),
        export_dir=HERE / "work" / "export",
    )
    return cfg.resolve()


# --------------------------------------------------------------------------- #
# training stages
# --------------------------------------------------------------------------- #
def stage_a(model, bundle, cfg, args, out: Path, num_classes: int, rng_seed: int):
    """Warm-up on train rows, selecting the best epoch on the validation rows."""
    import tensorflow as tf

    tf.keras.utils.set_random_seed(rng_seed)
    train_ds, steps = T.make_dataset(bundle, "train", True)
    val_ds, val_steps = T.make_dataset(bundle, "val", False)
    zoom = tf.keras.Sequential([tf.keras.layers.RandomZoom(args.zoom, fill_mode="constant",
                                                           fill_value=0.0)])
    schedule = tf.keras.optimizers.schedules.CosineDecay(
        args.warmup_lr, args.warmup_epochs * steps, alpha=0.05)
    model.compile(optimizer=tf.keras.optimizers.Adam(schedule),
                  loss=tf.keras.losses.CategoricalCrossentropy(label_smoothing=args.label_smoothing),
                  metrics=[tf.keras.metrics.CategoricalAccuracy(name="acc")])

    def onehot(x, y):
        return x, tf.one_hot(y, num_classes)

    train_ds = train_ds.map(lambda x, y: (zoom(x, training=True), y)).map(onehot).prefetch(2)
    val_ds = val_ds.map(onehot).prefetch(2)

    started = time.time()
    history = model.fit(
        train_ds, validation_data=val_ds, steps_per_epoch=steps, validation_steps=val_steps,
        epochs=args.warmup_epochs, verbose=2,
        callbacks=[
            tf.keras.callbacks.ModelCheckpoint(out / "stage-a.keras", monitor="val_acc",
                                               mode="max", save_best_only=True, verbose=1),
            tf.keras.callbacks.CSVLogger(out / "stage-a.csv"),
        ],
    )
    minutes = (time.time() - started) / 60
    print(f"stage A: {args.warmup_epochs} epochs in {minutes:.1f} min", flush=True)
    return {"epochs": args.warmup_epochs, "minutes": round(minutes, 2),
            "best_val_acc": round(float(max(history.history["val_acc"])), 4)}


def stage_b(model, bundle, cfg, args, out: Path, num_classes: int, rng_seed: int):
    """Finish on train+val rows with EMA weights applied before saving."""
    import tensorflow as tf

    tf.keras.utils.set_random_seed(rng_seed)
    pairs = np.vstack([bundle.train.indices, bundle.val.indices]).astype(np.int32)
    steps = int(math.ceil(len(pairs) / cfg.batch_size))
    print(f"stage B: {len(pairs)} rows (train+val; test rows still held out)", flush=True)

    schedule = tf.keras.optimizers.schedules.CosineDecay(
        args.finish_lr, args.finish_epochs * steps, alpha=0.02)
    model.compile(optimizer=tf.keras.optimizers.Adam(schedule, use_ema=True,
                                                    ema_momentum=args.ema_momentum),
                  loss=tf.keras.losses.CategoricalCrossentropy(label_smoothing=args.label_smoothing),
                  metrics=[tf.keras.metrics.CategoricalAccuracy(name="acc")])
    zoom = tf.keras.Sequential([tf.keras.layers.RandomZoom(args.zoom, fill_mode="constant",
                                                           fill_value=0.0)])

    def batches():
        # T._read_batch applies the trainer's own transl/rotate/thickness jitter.
        shuffle = np.random.default_rng(rng_seed)
        ink = np.random.default_rng(rng_seed + 1)
        while True:
            order = shuffle.permutation(len(pairs))
            for start in range(0, len(order), cfg.batch_size):
                batch = pairs[order[start:start + cfg.batch_size]]
                yield T._read_batch(bundle, batch, augment=True, rng=ink), batch[:, 0].astype(np.int32)

    dataset = tf.data.Dataset.from_generator(
        batches,
        output_signature=(tf.TensorSpec((None, 28, 28, 1), tf.float32),
                          tf.TensorSpec((None,), tf.int32)),
    )
    dataset = dataset.map(lambda x, y: (zoom(x, training=True),
                                        tf.one_hot(y, num_classes))).prefetch(2)

    started = time.time()
    model.fit(dataset, steps_per_epoch=steps, epochs=args.finish_epochs, verbose=2,
              callbacks=[tf.keras.callbacks.CSVLogger(out / "stage-b.csv")])
    minutes = (time.time() - started) / 60
    print(f"stage B: {args.finish_epochs} epochs in {minutes:.1f} min", flush=True)

    model.optimizer.finalize_variable_values(model.trainable_variables)  # freeze EMA weights
    return {"epochs": args.finish_epochs, "minutes": round(minutes, 2),
            "ema_momentum": args.ema_momentum, "rows": int(len(pairs))}


# --------------------------------------------------------------------------- #
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--checkpoint", required=True,
                        help="checkpoint to continue from (.h5 or .keras)")
    parser.add_argument("--data-dir", default=str(HERE / "quickdraw-source" / "drawings"),
                        help="folder of <category>.ndjson.gz drawings")
    parser.add_argument("--cache-dir", default=None, help="28x28 .npy cache (reused by train_345)")
    parser.add_argument("--out", default=str(HERE / "work" / "refine"))
    parser.add_argument("--bench", default=str(HERE / "evaluation-400-manifest.json"),
                        help="optional frozen 400-drawing manifest for an extra score")
    parser.add_argument("--warmup-epochs", type=int, default=24)
    parser.add_argument("--finish-epochs", type=int, default=26)
    parser.add_argument("--warmup-lr", type=float, default=2e-4)
    parser.add_argument("--finish-lr", type=float, default=1e-4)
    parser.add_argument("--zoom", type=float, default=0.06, help="RandomZoom fraction")
    parser.add_argument("--label-smoothing", type=float, default=0.05)
    parser.add_argument("--ema-momentum", type=float, default=0.99)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--skip-baseline", action="store_true",
                        help="skip re-scoring the starting checkpoint")
    args = parser.parse_args(argv)

    import tensorflow as tf
    tf.keras.utils.set_random_seed(args.seed)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    categories = T.fetch_categories()
    cfg = make_config(args)
    try:
        bundle = T.build_splits(categories, cfg)
    except FileNotFoundError:
        print("28x28 cache missing, building it from the drawings first…")
        T.download_dataset(categories, cfg)
        bundle = T.build_splits(categories, cfg)

    bench_pairs = None
    if Path(args.bench).exists():
        manifest = json.loads(Path(args.bench).read_text())
        index = {name: i for i, name in enumerate(categories)}
        try:
            bench_pairs = np.array([(index[r["label"]], int(r["source_row"]))
                                    for r in manifest["records"]], np.int32)
        except KeyError:
            print("bench manifest ignores labels outside this category set; skipping")
            bench_pairs = None

    model = load_checkpoint(Path(args.checkpoint), len(categories), cfg)
    report: dict = {
        "checkpoint": str(args.checkpoint),
        "params": int(model.count_params()),
        "architecture_unchanged": True,
        "recipe": {"warmup_epochs": args.warmup_epochs, "finish_epochs": args.finish_epochs,
                   "warmup_lr": args.warmup_lr, "finish_lr": args.finish_lr,
                   "zoom": args.zoom, "label_smoothing": args.label_smoothing,
                   "ema_momentum": args.ema_momentum, "batch_size": args.batch_size,
                   "seed": args.seed},
    }

    if not args.skip_baseline:
        report["baseline"], rank_base = evaluate(model, bundle, bundle.test.indices, "baseline / test rows")
        if bench_pairs is not None:
            report["baseline"]["bench"], _ = evaluate(model, bundle, bench_pairs, "baseline / 400 bench")

    report["stage_a"] = stage_a(model, bundle, cfg, args, out, len(categories), args.seed)

    model = load_checkpoint(out / "stage-a.keras", len(categories), cfg)
    model.compile(optimizer=tf.keras.optimizers.Adam(args.finish_lr),
                  loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    report["after_stage_a"], _ = evaluate(model, bundle, bundle.test.indices, "after stage A / test rows")
    if bench_pairs is not None:
        report["after_stage_a"]["bench"], _ = evaluate(model, bundle, bench_pairs, "after stage A / 400 bench")

    report["stage_b"] = stage_b(model, bundle, cfg, args, out, len(categories), args.seed)
    model.save(out / "refined.keras")
    model.save(out / "refined.h5")
    model.compile(optimizer=tf.keras.optimizers.Adam(args.finish_lr),
                  loss="sparse_categorical_crossentropy", metrics=["accuracy"])

    report["refined"], rank_new = evaluate(model, bundle, bundle.test.indices, "refined / test rows")
    if bench_pairs is not None:
        report["refined"]["bench"], _ = evaluate(model, bundle, bench_pairs, "refined / 400 bench")

    if not args.skip_baseline:
        report["significance"] = paired_significance(rank_new, rank_base,
                                                     bundle.test.indices[:, 0], seed=args.seed + 11)
        print(f"\ntop-1 {report['baseline']['top1']:.2f}% -> {report['refined']['top1']:.2f}% "
              f"({report['significance']['delta_top1_pp']:+.2f} pp, "
              f"95% CI {report['significance']['delta_top1_ci95_pp']}, "
              f"McNemar p={report['significance']['mcnemar']['p_two_sided']:.1e})", flush=True)

    (out / "refinement.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"\nwrote {out / 'refined.keras'} and {out / 'refinement.json'}")
    print(f"next: python training/export_model_345.py --weights {out / 'refined.keras'} "
          f"--manifest {out / 'manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
