"""Train SketchAI's own 345-class Quick, Draw! classifier.

The small-mirror path can run locally; the full GCS path is intended for a free
Colab GPU runtime. Free capacity and completion are not guaranteed, and no paid
cloud resources are provisioned. Both paths produce the files SketchAI needs in
the browser:

    export/model-345/model.json + group1-shard*.bin + classes.txt

Design notes for students
-------------------------
* ``quickdraw-js`` trains from the project's small npm mirror; ``quickdraw-gcs-full``
  reads the complete official archive and ``quickdraw-gcs-sampled`` reads a fixed
  number of rows per class. Both use bounded public GCS byte ranges and a cloud
  runtime memory-mapped cache.
* The class order is read from the repository's canonical category list, never
  from a directory listing, and the same list is written out as classes.txt.
  Output neuron N therefore always means classes.txt line N.
* Training batches are read from memory-mapped files; the complete dataset is
  never loaded into RAM. The GCS path stores no source copy and writes only the
  transformed cache to the cloud runtime's scratch disk.
* QUICK_TEST runs a tiny version of the whole pipeline (few categories, few
  samples, few epochs) so you can prove the plumbing works before committing
  hours of training.

Usage
-----
    python train_345.py --quick-test                   # small pipeline smoke test
    python train_345.py --dataset quickdraw-js         # local mirror, <=100 rows/class
    python train_345.py --dataset quickdraw-gcs-sampled --samples-per-class 200
    python train_345.py --dataset quickdraw-gcs-full   # full archive; cloud-only
    python train_345.py --help

The full 50M-data Colab workflow is in SketchAI_QuickDraw_50M_Colab.ipynb.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import math
import os
import random
import shutil
import subprocess
import sys
import types
import time
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Sequence

# --------------------------------------------------------------------------------------
# 1. Setup
# --------------------------------------------------------------------------------------

# The converter only understands Keras 2 models, so ask TensorFlow for the legacy
# implementation before importing anything that touches Keras.
os.environ.setdefault("TF_USE_LEGACY_KERAS", "1")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import numpy as np  # noqa: E402  (after the env vars above)

sys.path.insert(0, str(Path(__file__).resolve().parent))
import quickdraw_ndjson  # noqa: E402  (local real Quick, Draw! NDJSON source)


HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent
CATEGORY_FILE = REPO_ROOT / "src" / "data" / "quickdraw-categories.txt"
WORK_DIR = HERE / "work"
EXPORT_DIR = HERE / "export" / "model-345"

# The default `quickdraw-js` mode reads the local NDJSON mirror. The opt-in
# `quickdraw-gcs-full` mode is implemented in quickdraw_gcs.py and streams the
# official public GCS bitmap objects in bounded ranges (intended for free Colab).
QUICKDRAW_SOURCE_DIR = Path(__file__).resolve().parent / "quickdraw-source" / "drawings"
IMAGE_SIZE = 28
PIXELS_PER_IMAGE = IMAGE_SIZE * IMAGE_SIZE


# --------------------------------------------------------------------------------------
# 2. Configuration
# --------------------------------------------------------------------------------------


@dataclass
class Config:
    """Every knob that matters, in one place.

    Defaults use the small local mirror's 100-row ceiling. The full GCS mode reads
    every available row and ignores ``samples_per_class`` outside quick-test mode.
    """

    samples_per_class: int = 100
    # Bounded GCS transfer size for the full archive (each source row is 784 bytes).
    gcs_chunk_rows: int = 4096
    batch_size: int = 256
    epochs: int = 20
    seed: int = 42

    # 80 / 10 / 10, taken per class after a seeded shuffle.
    train_fraction: float = 0.8
    val_fraction: float = 0.1

    # QUICK_TEST: 20 categories, 500 samples each, 10 epochs. Proves the pipeline.
    #
    # The epoch count is deliberately generous. A quick test trains on only ~8000
    # examples, which at batch size 256 is ~32 optimiser steps per epoch -- three
    # epochs (96 steps) is nowhere near enough for a CNN to learn anything, so the
    # run looks broken when it is merely short. Capping the batch size and giving
    # it ten epochs turns that into ~630 steps, enough to watch validation accuracy
    # actually climb. The full run gets ~6700 steps per epoch and does not care.
    quick_test: bool = False
    category_limit: int = 0  # 0 = all categories; >0 only trims for debugging
    quick_test_categories: int = 20
    quick_test_samples: int = 500
    quick_test_epochs: int = 10
    quick_test_batch_size: int = 128

    # Light augmentation only. Doodles are defined by their shape, so we nudge
    # position and rotation a little and nothing else (no flips: a flipped
    # umbrella or fork is a different drawing).
    augment: bool = True
    augment_translation: float = 0.05   # +/-5% of the image = +/-1.4 px
    augment_rotation: float = 0.05      # +/- ~2.9 degrees

    # Pen-width invariance. Quick, Draw! strokes are ~1.5 px wide on the 28x28
    # grid; a browser pen ends up at ~0.3-0.6 px. Without this the model is right
    # on the test split and wrong on real hand-drawn doodles.
    thickness_augment: bool = True

    # Dataset source. "quickdraw-js" is the small local mirror; "quickdraw-gcs-full"
    # streams the official full archive in chunks on a cloud runtime. "synthetic"
    # is an offline self-test only and is never a real training run.
    dataset: str = "quickdraw-js"
    quickdraw_source_dir: Path = QUICKDRAW_SOURCE_DIR
    data_dir: Path = WORK_DIR / "data"
    cache_dir: Path = WORK_DIR / "cache"
    output_dir: Path = WORK_DIR / "run"
    export_dir: Path = EXPORT_DIR

    early_stopping_patience: int = 4
    learning_rate: float = 1e-3
    dropout: float = 0.4
    dense_units: int = 256

    # Optional Google Drive checkpointing (never required).
    drive_checkpoint_dir: Path | None = None

    def resolve(self) -> "Config":
        """Apply QUICK_TEST settings."""
        if self.quick_test:
            self.samples_per_class = min(self.samples_per_class, self.quick_test_samples)
            self.epochs = min(self.epochs, self.quick_test_epochs)
            self.batch_size = min(self.batch_size, self.quick_test_batch_size)
        return self

    def describe(self) -> dict:
        data = asdict(self)
        for key in ("data_dir", "cache_dir", "output_dir", "export_dir",
                    "drive_checkpoint_dir", "quickdraw_source_dir"):
            value = data.get(key)
            data[key] = str(value) if value else None
        return data


# --------------------------------------------------------------------------------------
# 3. Category list — the single source of truth for label order
# --------------------------------------------------------------------------------------


def fetch_categories(path: Path = CATEGORY_FILE) -> list[str]:
    """Read the canonical 345 categories in their fixed, deterministic order."""
    if not path.exists():
        raise FileNotFoundError(
            f"Canonical category list not found at {path}.\n"
            "In Colab, clone the SketchAI repository first (see the notebook)."
        )
    categories = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(categories) != 345:
        raise ValueError(f"Expected 345 categories in {path}, found {len(categories)}")
    duplicates = {c for c in categories if categories.count(c) > 1}
    if duplicates:
        raise ValueError(f"Duplicate categories in {path}: {sorted(duplicates)}")
    return categories


def quick_test_categories(categories: Sequence[str], count: int) -> list[str]:
    """A deterministic spread across the full list, so a quick test is not just A-C."""
    if count >= len(categories):
        return list(categories)
    step = len(categories) / count
    return [categories[min(len(categories) - 1, int(i * step))] for i in range(count)]


def slug(name: str) -> str:
    return "".join(ch if ch.isalnum() else "_" for ch in name).strip("_").lower()


# --------------------------------------------------------------------------------------
# 4. Dataset download (memory and disk friendly)
# --------------------------------------------------------------------------------------


def load_class_samples(name: str, rows: int, cfg: Config) -> np.ndarray:
    """Load real Quick, Draw! samples for one category as uint8 (n, 784).

    Drawings come from the local NDJSON mirror documented in
    `quickdraw_ndjson.py` and are re-rasterised into SketchAI's own input
    geometry first. Results are cached per category so a re-run is instant.
    """
    cfg.cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cfg.cache_dir / f"{slug(name)}.npy"
    if cache_file.exists():
        cached = np.load(cache_file, mmap_mode="r")
        if cached.shape[0] >= rows:
            return np.asarray(cached[:rows])
    array, available = quickdraw_ndjson.load_class_samples(
        name, rows, cfg.quickdraw_source_dir)
    if available < rows:
        print(f"  note: {name} has only {available} drawings in the source "
              f"(asked for {rows}); using {available}")
    np.save(cache_file, array)
    return array

def synthetic_class_samples(name: str, rows: int, seed: int) -> np.ndarray:
    """Deterministic procedural doodles for offline pipeline self-tests.

    This is NOT Quick, Draw! data. It exists so the whole train → export → browser
    path can be exercised where the dataset cannot be downloaded. The export
    manifest records dataset="synthetic-offline-selftest" so it can never be
    mistaken for a real model.
    """
    rng = np.random.default_rng(seed)
    variant = int(hashlib.sha256(name.encode()).hexdigest()[:8], 16) % 8
    images = np.zeros((rows, IMAGE_SIZE, IMAGE_SIZE), dtype=np.uint8)
    grid = np.arange(IMAGE_SIZE)
    yy, xx = np.meshgrid(grid, grid, indexing="ij")
    for i in range(rows):
        dx, dy = rng.integers(-2, 3, size=2)
        wobble = rng.normal(0, 0.35, size=2)
        cx, cy = 13.5 + dx + wobble[0], 13.5 + dy + wobble[1]
        if variant == 0:
            mask = np.abs(np.hypot(xx - cx, yy - cy) - 8) < 1.1
        elif variant == 1:
            mask = (np.abs(np.abs(xx - cx) - 7) < 1.1) & (np.abs(yy - cy) < 7)
            mask |= (np.abs(np.abs(yy - cy) - 7) < 1.1) & (np.abs(xx - cx) < 7)
        elif variant == 2:
            mask = np.abs((xx - cx) - (yy - cy)) < 1.1
        elif variant == 3:
            mask = np.abs((xx - cx) + (yy - cy)) < 1.1
        elif variant == 4:
            mask = np.hypot(xx - cx, yy - cy) < 6
        elif variant == 5:
            mask = (np.abs(xx - cx) < 8) & (np.abs(yy - cy) < 2)
        elif variant == 6:
            mask = (np.abs(yy - cy) < 8) & (np.abs(xx - cx) < 2)
        else:
            mask = (np.abs(xx - cx) < 7) & (np.abs(yy - cy) < 7)
        images[i] = np.where(mask, 255, 0).astype(np.uint8)
    return images.reshape(rows, PIXELS_PER_IMAGE)


def download_dataset(categories: Sequence[str], cfg: Config, logger=print) -> Path:
    """Fetch category bitmaps into a memory-mapped cache.

    The GCS modes read official public NPY objects in bounded HTTP byte ranges,
    one category/chunk at a time. Full source files are never loaded into RAM or
    downloaded into this repository's workspace.
    """
    cfg.cache_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = cfg.cache_dir / "manifest.json"
    started = time.time()

    if cfg.dataset in {"quickdraw-gcs-full", "quickdraw-gcs-sampled"}:
        from quickdraw_gcs import prepare_full_cache

        row_limit = (
            cfg.samples_per_class if cfg.dataset == "quickdraw-gcs-sampled" or cfg.quick_test
            else None
        )
        if cfg.dataset == "quickdraw-gcs-sampled" and row_limit < 1:
            raise ValueError("quickdraw-gcs-sampled requires --samples-per-class > 0")
        logger("  Source: official Google Cloud Storage numpy_bitmap objects (HTTP Range)")
        logger("  Transfer: one category and one bounded row chunk at a time; cloud scratch only")
        manifest = prepare_full_cache(
            list(categories), cfg.cache_dir,
            chunk_rows=cfg.gcs_chunk_rows,
            row_limit=row_limit,
            logger=logger,
        )
        if (cfg.dataset == "quickdraw-gcs-full" and not cfg.quick_test
                and len(categories) == 345 and manifest.get("total_rows", 0) < 45_000_000):
            raise RuntimeError(
                f"Expected the full Quick, Draw! archive (~50M rows), only "
                f"{manifest.get('total_rows', 0):,} rows were staged."
            )
        return cfg.cache_dir

    manifest = {"dataset": cfg.dataset, "samples_per_class": cfg.samples_per_class, "classes": {}}
    for index, name in enumerate(categories):
        target = cfg.cache_dir / f"{slug(name)}.npy"
        if target.exists():
            existing = int(np.load(target, mmap_mode="r").shape[0])
            if existing >= cfg.samples_per_class:
                manifest["classes"][name] = {"rows": existing, "cached": True}
                continue
            target.unlink()
        if cfg.dataset == "synthetic":
            array = synthetic_class_samples(name, cfg.samples_per_class, cfg.seed + index)
        else:
            array = load_class_samples(name, cfg.samples_per_class, cfg)
        np.save(target, array)
        manifest["classes"][name] = {"rows": int(array.shape[0]), "cached": False}
        if index % 10 == 0 or index == len(categories) - 1:
            logger(f"  [{index + 1}/{len(categories)}] {name}: {array.shape[0]} samples "
                   f"({(time.time() - started):.0f}s elapsed)")
    manifest_path.write_text(json.dumps(manifest, indent=2))
    return cfg.cache_dir


# --------------------------------------------------------------------------------------
# 5. Data loader (memory mapped, batched, never fully in RAM)
# --------------------------------------------------------------------------------------


@dataclass
class Split:
    """Row indices per class for one split."""

    indices: np.ndarray  # shape (n, 2): [class_index, row_in_cache]
    labels: np.ndarray   # shape (n,): class_index

    def __len__(self) -> int:
        return int(self.indices.shape[0])


@dataclass
class DatasetBundle:
    train: Split
    val: Split
    test: Split
    cache: list  # list of np.memmap per class
    categories: list[str]
    cfg: Config = field(repr=False)

    @property
    def num_classes(self) -> int:
        return len(self.categories)


def build_splits(categories: Sequence[str], cfg: Config, logger=print) -> DatasetBundle:
    """Seeded per-class split: 80% train, 10% validation, 10% test.

    Rows are shuffled per class with a fixed seed before splitting, so the three
    sets are disjoint and a rerun reproduces exactly the same partition.
    """
    rng = np.random.default_rng(cfg.seed)
    caches: list[np.memmap] = []
    train_idx, val_idx, test_idx = [], [], []
    for class_index, name in enumerate(categories):
        path = cfg.cache_dir / f"{slug(name)}.npy"
        if not path.exists():
            raise FileNotFoundError(f"Missing cached data for '{name}' ({path}). Run download_dataset first.")
        cache = np.load(path, mmap_mode="r")
        caches.append(cache)
        rows = int(cache.shape[0])
        order = rng.permutation(rows)
        n_train = int(rows * cfg.train_fraction)
        n_val = int(rows * cfg.val_fraction)
        train_idx.append(np.column_stack([np.full(n_train, class_index), order[:n_train]]))
        val_idx.append(np.column_stack([np.full(n_val, class_index), order[n_train:n_train + n_val]]))
        test_idx.append(np.column_stack([np.full(rows - n_train - n_val, class_index), order[n_train + n_val:]]))
    bundle = DatasetBundle(
        train=Split(np.vstack(train_idx).astype(np.int32), None),
        val=Split(np.vstack(val_idx).astype(np.int32), None),
        test=Split(np.vstack(test_idx).astype(np.int32), None),
        cache=caches,
        categories=list(categories),
        cfg=cfg,
    )
    bundle.train.labels = bundle.train.indices[:, 0].astype(np.int32)
    bundle.val.labels = bundle.val.indices[:, 0].astype(np.int32)
    bundle.test.labels = bundle.test.indices[:, 0].astype(np.int32)
    logger(f"  train {len(bundle.train)}, validation {len(bundle.val)}, test {len(bundle.test)}")
    return bundle


def _thickness_augment(batch: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Vary stroke thickness and ink intensity, independently per image.

    Quick, Draw! bitmaps were drawn with a ~1.5 px pen on the 28x28 grid. A
    browser pen on SketchAI's 1200x720 canvas is far thinner once it has been
    squashed into 28x28 -- measured at roughly 0.3-0.6 px -- so a model that only
    ever saw fat strokes meets a systematically different input in production and
    its accuracy collapses on real doodles.

    Thickening and thinning (a 3x3 grey max/min filter) plus a log-uniform
    intensity gamma teach the network that ink width is not a class feature.
    """
    from scipy.ndimage import maximum_filter, minimum_filter

    out = batch.copy()
    for i in range(out.shape[0]):
        image = out[i, :, :, 0]
        roll = rng.random()
        if roll < 0.30:  # fatter pen
            image = maximum_filter(image, size=3)
        elif roll < 0.60:  # thinner pen
            image = minimum_filter(image, size=3)
        # Log-uniform around 1.0 so brightening and darkening are equally likely.
        gamma = float(np.exp(rng.uniform(-0.7, 0.7)))
        out[i, :, :, 0] = np.power(image, gamma)
    return out


def _read_batch(
    bundle: DatasetBundle,
    pairs: np.ndarray,
    augment: bool = False,
    rng: np.random.Generator | None = None,
) -> np.ndarray:
    """Materialise (batch, 28, 28, 1) float32 from the memmaps."""
    out = np.empty((pairs.shape[0], IMAGE_SIZE, IMAGE_SIZE, 1), dtype=np.float32)
    # Group the indexed gathers by class. This avoids one Python/memmap lookup per
    # image on the 40M+ example cloud run while keeping only a single batch in RAM.
    class_ids = pairs[:, 0]
    rows = pairs[:, 1]
    for class_index in np.unique(class_ids):
        positions = np.flatnonzero(class_ids == class_index)
        batch = np.asarray(bundle.cache[int(class_index)][rows[positions]])
        out[positions, :, :, 0] = batch.reshape(-1, IMAGE_SIZE, IMAGE_SIZE)
    out /= 255.0  # Quick, Draw! bitmaps are 0-255 white ink on black
    if augment and rng is not None:
        out = _thickness_augment(out, rng)
    return out


def make_dataset(bundle: DatasetBundle, split: str, training: bool):
    """tf.data pipeline backed by a Python generator over memory-mapped files."""
    import tensorflow as tf

    source = getattr(bundle, split)
    cfg = bundle.cfg

    def generator() -> Iterator[tuple[np.ndarray, np.ndarray]]:
        """Yields batches forever, reshuffling the order at the start of each pass.

        Shuffling is done here, in numpy, rather than with `dataset.shuffle()`:
        a tf.data shuffle buffer holds whole *batches*, and a buffer big enough to
        shuffle 1.7 million examples properly would be gigabytes of RAM. In here it
        costs one index array. Because the generator is infinite, `repeat()` is not
        needed and `steps_per_epoch` still defines where an epoch ends.
        """
        rng = np.random.default_rng(cfg.seed)
        # A separate stream for thickness so changing it never reorders the data.
        ink_rng = np.random.default_rng(cfg.seed + 1) if (training and cfg.augment
                                                          and cfg.thickness_augment) else None
        while True:
            order = np.arange(len(source))
            rng.shuffle(order)
            for start in range(0, len(order), cfg.batch_size):
                chunk = order[start:start + cfg.batch_size]
                pairs = source.indices[chunk]
                yield _read_batch(bundle, pairs, augment=ink_rng is not None,
                                  rng=ink_rng), source.labels[chunk]

    signature = (
        tf.TensorSpec(shape=(None, IMAGE_SIZE, IMAGE_SIZE, 1), dtype=tf.float32),
        tf.TensorSpec(shape=(None,), dtype=tf.int32),
    )
    dataset = tf.data.Dataset.from_generator(generator, output_signature=signature)

    if training:
        if cfg.augment:
            augmenter = _make_augmenter(tf)
            if augmenter is not None:
                dataset = dataset.map(
                    lambda x, y: (augmenter(x, training=True), y),
                    num_parallel_calls=tf.data.AUTOTUNE,
                )

    options = tf.data.Options()
    options.experimental_deterministic = not training
    dataset = dataset.with_options(options)
    # Note: no .cache() here — a 345-class test split would cost hundreds of MB of
    # RAM, which is exactly what this loader exists to avoid. prefetch(2) keeps at
    # most two batches in flight instead of letting AUTOTUNE overshoot on a small
    # Colab runtime.
    dataset = dataset.prefetch(2)
    return dataset, math.ceil(len(source) / cfg.batch_size)


def _make_augmenter(tf):
    """Light translation + rotation, applied only while training."""
    try:
        return tf.keras.Sequential([
            tf.keras.layers.RandomTranslation(
                height_factor=0.05, width_factor=0.05, fill_mode="constant", fill_value=0.0
            ),
            tf.keras.layers.RandomRotation(
                factor=0.05, fill_mode="constant", fill_value=0.0
            ),
        ])
    except AttributeError:  # very old TensorFlow
        return None


# --------------------------------------------------------------------------------------
# 6. Model
# --------------------------------------------------------------------------------------


def build_model(num_classes: int, cfg: Config):
    """Compact CNN: ~215k parameters, about 0.9 MB as float32 weights.

    Small enough to load in a browser in well under a second on a normal
    connection, but deep enough for 28x28 line drawings.
    """
    import tensorflow as tf

    tf.keras.utils.set_random_seed(cfg.seed)
    model = tf.keras.Sequential(
        [
            tf.keras.layers.Input(shape=(IMAGE_SIZE, IMAGE_SIZE, 1)),
            tf.keras.layers.Conv2D(32, 3, padding="same", use_bias=False),
            tf.keras.layers.BatchNormalization(),
            tf.keras.layers.Activation("relu"),
            tf.keras.layers.MaxPooling2D(),
            tf.keras.layers.Conv2D(64, 3, padding="same", use_bias=False),
            tf.keras.layers.BatchNormalization(),
            tf.keras.layers.Activation("relu"),
            tf.keras.layers.MaxPooling2D(),
            tf.keras.layers.Conv2D(128, 3, padding="same", activation="relu"),
            tf.keras.layers.GlobalAveragePooling2D(),
            tf.keras.layers.Dense(cfg.dense_units, activation="relu"),
            tf.keras.layers.Dropout(cfg.dropout),
            tf.keras.layers.Dense(num_classes, activation="softmax", name="predictions"),
        ],
        name="sketchai_345",
    )
    model.compile(
        optimizer=tf.keras.optimizers.Adam(cfg.learning_rate),
        loss=tf.keras.losses.SparseCategoricalCrossentropy(),
        metrics=[
            "accuracy",
            tf.keras.metrics.SparseTopKCategoricalAccuracy(k=3, name="top3_accuracy"),
            tf.keras.metrics.SparseTopKCategoricalAccuracy(k=10, name="top10_accuracy"),
        ],
    )
    return model


# --------------------------------------------------------------------------------------
# 7. Training
# --------------------------------------------------------------------------------------


def train_model(model, bundle: DatasetBundle, cfg: Config, logger=print):
    import tensorflow as tf

    cfg.output_dir.mkdir(parents=True, exist_ok=True)
    train_ds, train_steps = make_dataset(bundle, "train", training=True)
    val_ds, val_steps = make_dataset(bundle, "val", training=False)

    checkpoint_h5 = cfg.output_dir / "best.h5"      # HDF5: required by the TFJS converter
    checkpoint_keras = cfg.output_dir / "best.keras"  # native Keras format, for reuse

    callbacks = [
        tf.keras.callbacks.ModelCheckpoint(
            filepath=str(checkpoint_h5), monitor="val_accuracy", save_best_only=True, verbose=1
        ),
        tf.keras.callbacks.EarlyStopping(
            monitor="val_accuracy", patience=cfg.early_stopping_patience, restore_best_weights=True, verbose=1
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=2, min_lr=1e-5, verbose=1
        ),
        tf.keras.callbacks.CSVLogger(str(cfg.output_dir / "training_log.csv")),
    ]
    if cfg.drive_checkpoint_dir:
        cfg.drive_checkpoint_dir.mkdir(parents=True, exist_ok=True)
        callbacks.extend([
            tf.keras.callbacks.ModelCheckpoint(
                filepath=str(cfg.drive_checkpoint_dir / "best.h5"),
                monitor="val_accuracy",
                save_best_only=True,
                verbose=0,
            ),
            tf.keras.callbacks.BackupAndRestore(
                backup_dir=str(cfg.drive_checkpoint_dir / "fit-backup"),
                save_freq="epoch",
                delete_checkpoint=False,
            ),
        ])

    started = time.time()
    history = model.fit(
        train_ds,
        steps_per_epoch=train_steps,
        validation_data=val_ds,
        validation_steps=val_steps,
        epochs=cfg.epochs,
        callbacks=callbacks,
        verbose=2,
    )
    logger(f"Training finished in {(time.time() - started) / 60:.1f} minutes")

    # The run directory carries its own copy of the labels it was trained on, so a
    # quick-test model (20 outputs) is never evaluated against the full 345 list.
    (cfg.output_dir / "classes.txt").write_text("\n".join(bundle.categories) + "\n")

    # Keep a Keras-format copy as well, if this Keras version can write it.
    try:
        model.save(str(checkpoint_keras))
    except Exception as error:  # pragma: no cover - format availability varies
        logger(f"  (could not also write best.keras: {error})")
    (cfg.output_dir / "history.json").write_text(json.dumps({k: [float(v) for v in vals] for k, vals in history.history.items()}, indent=2))
    return history


# --------------------------------------------------------------------------------------
# 8. Evaluation and error analysis
# --------------------------------------------------------------------------------------


def evaluate_model(model, bundle: DatasetBundle, cfg: Config, logger=print) -> dict:
    """Top-1 / top-3 / top-10 on the held-out test split."""
    import tensorflow as tf

    test_ds, steps = make_dataset(bundle, "test", training=False)
    values = model.evaluate(test_ds, steps=steps, verbose=0, return_dict=True)
    result = {
        "test_accuracy": float(values.get("accuracy", float("nan"))),
        "test_top3_accuracy": float(values.get("top3_accuracy", float("nan"))),
        "test_top10_accuracy": float(values.get("top10_accuracy", float("nan"))),
        "test_loss": float(values.get("loss", float("nan"))),
        "test_samples": len(bundle.test),
        "parameters": int(model.count_params()),
    }
    logger("Test results:")
    logger(f"  top-1  {result['test_accuracy'] * 100:5.2f}%")
    logger(f"  top-3  {result['test_top3_accuracy'] * 100:5.2f}%")
    logger(f"  top-10 {result['test_top10_accuracy'] * 100:5.2f}%")
    logger(f"  parameters: {result['parameters']:,}")
    return result


def confusion_pairs(model, bundle: DatasetBundle, cfg: Config, limit: int = 12, sample: int = 5000) -> list[dict]:
    """Most frequent (expected -> predicted) mistakes, instead of a 345x345 grid."""
    import tensorflow as tf

    test = bundle.test
    take = min(sample, len(test))
    rng = np.random.default_rng(cfg.seed)
    chosen = rng.choice(len(test), size=take, replace=False)
    pairs = test.indices[chosen]
    labels = test.labels[chosen]
    counts: dict[tuple[int, int], int] = {}
    batch = 512
    for start in range(0, take, batch):
        chunk = pairs[start:start + batch]
        predictions = np.argmax(model.predict(_read_batch(bundle, chunk), verbose=0), axis=1)
        for expected, predicted in zip(labels[start:start + batch], predictions):
            if expected != predicted:
                key = (int(expected), int(predicted))
                counts[key] = counts.get(key, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    report = [
        {
            "expected": bundle.categories[a],
            "predicted": bundle.categories[b],
            "count": count,
            "share_of_sample": count / take,
        }
        for (a, b), count in ranked
    ]
    if report:
        print("Most confused pairs (expected -> predicted):")
        for row in report:
            print(f"  {row['expected']:>22s} -> {row['predicted']:<22s} {row['count']:5d}  ({row['share_of_sample'] * 100:.2f}% of sample)")
    return report


def plot_history(cfg: Config) -> dict:
    """Accuracy and loss curves, saved as PNGs (matplotlib ships with Colab)."""
    import csv

    log_path = cfg.output_dir / "training_log.csv"
    if not log_path.exists():
        return {}
    rows = list(csv.DictReader(log_path.open()))
    epochs = [int(r["epoch"]) + 1 for r in rows]
    paths = {}
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception as error:  # pragma: no cover
        print(f"matplotlib unavailable, skipping plots: {error}")
        return {}

    for metric, title, filename in (
        ("accuracy", "Accuracy", "training-accuracy.png"),
        ("loss", "Loss", "training-loss.png"),
    ):
        plt.figure(figsize=(6, 4))
        plt.plot(epochs, [float(r[metric]) for r in rows], label="train")
        plt.plot(epochs, [float(r[f"val_{metric}"]) for r in rows], label="validation")
        plt.xlabel("epoch")
        plt.ylabel(metric)
        plt.title(f"{title} per epoch")
        plt.legend()
        plt.tight_layout()
        plt.savefig(cfg.output_dir / filename, dpi=120)
        plt.close()
        paths[metric] = str(cfg.output_dir / filename)
    return paths


# --------------------------------------------------------------------------------------
# 9. Save + TensorFlow.js conversion + packaging
# --------------------------------------------------------------------------------------


def model_file_size(path: Path) -> int:
    return path.stat().st_size if path.exists() else 0


def convert_to_tfjs(keras_path: Path, output_dir: Path, logger=print) -> Path:
    """Convert an HDF5 Keras model into a TensorFlow.js Layers model.

    The converter is used in-process (it is a plain function) and, if that is not
    importable, through the ``tensorflowjs_converter`` console script that ships
    with the same package.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    for stale in output_dir.glob("group*-shard*of*.bin"):
        stale.unlink()
    arguments = [
        "--input_format=keras",
        str(keras_path),
        str(output_dir),
        "--weight_shard_size_bytes", str(8 * 1024 * 1024),
    ]

    # tensorflowjs imports tensorflow_decision_forests even though we only convert
    # a Keras CNN. If that optional package is missing or broken (it often is on
    # Colab), register an empty placeholder so the import succeeds. Nothing in this
    # project uses TF-DF trees.
    try:
        import tensorflow_decision_forests  # noqa: F401
    except Exception:  # pragma: no cover - depends on the environment
        stub = types.ModuleType("tensorflow_decision_forests")
        stub.__version__ = "0.0.0-sketchai-stub"
        sys.modules["tensorflow_decision_forests"] = stub

    try:
        from tensorflowjs.converters.converter import convert

        logger("Converting with the tensorflowjs Python API …")
        convert(list(arguments))
    except Exception as api_error:  # pragma: no cover - depends on the install
        logger(f"In-process conversion unavailable ({api_error}); trying the CLI …")
        executable = shutil.which("tensorflowjs_converter") or str(Path(sys.executable).parent / "tensorflowjs_converter")
        completed = subprocess.run([executable, *arguments], capture_output=True, text=True)
        if completed.returncode != 0:
            raise RuntimeError(
                "TensorFlow.js conversion failed.\n"
                f"stdout:\n{completed.stdout[-2000:]}\nstderr:\n{completed.stderr[-2000:]}"
            )
    if not (output_dir / "model.json").exists():
        raise RuntimeError("Converter finished but model.json is missing")
    return output_dir


def _topology_spec_layers(spec: dict) -> list:
    """Layer list from a model.json written by either the converter or tfjs."""
    topology = spec.get("modelTopology", {})
    return ((topology.get("model_config") or topology).get("config") or {}).get("layers", [])


def _topology_layers(spec: dict) -> list:
    return [layer.get("class_name") for layer in _topology_spec_layers(spec)]


def verify_export(export_dir: Path, categories: Sequence[str]) -> dict:
    """Sanity-check the exported package exactly as the browser will use it."""
    model_json = export_dir / "model.json"
    classes_txt = export_dir / "classes.txt"
    if not model_json.exists():
        raise FileNotFoundError(f"{model_json} missing")
    if not classes_txt.exists():
        raise FileNotFoundError(f"{classes_txt} missing")
    labels = [line for line in classes_txt.read_text().splitlines() if line.strip()]
    if labels != list(categories):
        raise ValueError("classes.txt does not match the canonical category order used for training")
    spec = json.loads(model_json.read_text())
    weights = [w for group in spec["weightsManifest"] for w in group["paths"]]
    missing = [w for w in weights if not (export_dir / w).exists()]
    if missing:
        raise FileNotFoundError(f"missing weight shards: {missing}")
    topology = spec.get("modelTopology", {})
    # tensorflowjs_converter wraps the config; tfjs model.save() does not.
    layers = ((topology.get("model_config") or topology).get("config") or {}).get("layers", [])
    output_units = None
    for layer in layers:
        config = layer.get("config", {})
        if layer.get("class_name") == "Dense" and config.get("activation") == "softmax":
            output_units = config.get("units")
    if output_units != len(labels):
        raise ValueError(f"model outputs {output_units} classes but classes.txt has {len(labels)}")
    size = sum((export_dir / name).stat().st_size for name in weights) + model_json.stat().st_size
    return {
        "classes": len(labels),
        "output_units": output_units,
        "weight_shards": len(weights),
        "bytes": size,
        "megabytes": round(size / 1024 / 1024, 2),
    }


def save_and_export(model, bundle: DatasetBundle, metrics: dict, cfg: Config, history=None, logger=print) -> dict:
    """Write best.h5, convert it, add classes.txt + manifest, and zip everything."""
    cfg.output_dir.mkdir(parents=True, exist_ok=True)
    best = cfg.output_dir / "best.h5"
    if not best.exists():
        best = cfg.output_dir / "final.h5"
        model.save(str(best))

    convert_to_tfjs(best, cfg.export_dir, logger=logger)
    (cfg.export_dir / "classes.txt").write_text("\n".join(bundle.categories) + "\n")

    verification = verify_export(cfg.export_dir, bundle.categories)
    weight_bytes = verification["bytes"]

    manifest = {
        "name": "SketchAI 345-class doodle classifier",
        "trained_for": "SketchAI (school demonstration project)",
        "dataset": (
            "Google Quick, Draw! full 28x28 numpy bitmaps (CC BY 4.0), streamed from public GCS"
            if cfg.dataset == "quickdraw-gcs-full"
            else "Google Quick, Draw! sampled 28x28 bitmaps (CC BY 4.0), streamed from public GCS"
            if cfg.dataset == "quickdraw-gcs-sampled"
            else "Google Quick, Draw! drawings (CC BY 4.0), accessed via the quickdraw.js npm redistribution"
            if cfg.dataset == "quickdraw-js"
            else "synthetic-offline-selftest (NOT Quick, Draw!)"
        ),
        "dataset_url": "https://github.com/googlecreativelab/quickdraw-dataset",
        "dataset_access_path": (
            "Google Cloud Storage byte-range reads: gs://quickdraw_dataset/full/numpy_bitmap/"
            if cfg.dataset in {"quickdraw-gcs-full", "quickdraw-gcs-sampled"}
            else "npm:quickdraw.js@1.0.6 (CC BY 4.0, data by Google, Inc.)"
        ),
        "is_self_test_only": cfg.dataset == "synthetic",
        "categories": len(bundle.categories),
        "samples_per_class": None if cfg.dataset == "quickdraw-gcs-full" else cfg.samples_per_class,
        "source_rows_per_category": {
            name: int(cache.shape[0]) for name, cache in zip(bundle.categories, bundle.cache)
        },
        "source_total_rows": sum(int(cache.shape[0]) for cache in bundle.cache),
        "train_samples": len(bundle.train),
        "validation_samples": len(bundle.val),
        "test_samples": len(bundle.test),
        "split": {"train": cfg.train_fraction, "validation": cfg.val_fraction, "test": 1 - cfg.train_fraction - cfg.val_fraction},
        "seed": cfg.seed,
        "input_shape": [1, IMAGE_SIZE, IMAGE_SIZE, 1],
        "input_format": "28x28x1 float32, white ink on black, 0-1",
        "output_classes": verification["output_units"],
        "preprocessing": {
            "profile": "quickdraw-28",
            "crop_padding": 1.186,
            "centre": True,
            "preserve_aspect_ratio": True,
            "ink_source": "canvas alpha",
            "normalisation": "white ink on black, 0-1; 97th-percentile ink lifted to 1.0 (min gamma 0.25)",
        },
        "augmentation": {
            "enabled": cfg.augment,
            "translation": cfg.augment_translation,
            "rotation": cfg.augment_rotation,
        },
        "architecture": _topology_layers(json.loads((cfg.export_dir / "model.json").read_text())),
        "parameters": metrics.get("parameters"),
        "metrics": {k: v for k, v in metrics.items() if k.startswith("test_")},
        "weights_bytes": weight_bytes,
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "config": cfg.describe(),
        "license": {
            "dataset": "CC BY 4.0 (Google, Inc.)",
            "model": "trained for this project; no third-party weights included",
        },
    }
    (cfg.export_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    (cfg.export_dir / "ATTRIBUTION.txt").write_text(
        "SketchAI 345-class doodle classifier\n"
        "===================================\n\n"
        "This network was trained for the SketchAI school project. It is not Google's\n"
        "model, not AutoDraw and not a third-party checkpoint: the weights in this\n"
        "folder were produced by training/train_345.py (or the Colab notebook) on\n"
        "Google's Quick, Draw! dataset.\n\n"
        f"Dataset : Google Quick, Draw! 28x28 numpy bitmaps ({manifest['dataset']})\n"
        "License : CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/\n"
        "Source  : https://github.com/googlecreativelab/quickdraw-dataset\n"
        f"Source rows: {manifest['source_total_rows']:,} across {manifest['categories']} classes\n"
        f"Split   : {manifest['train_samples']} train / {manifest['validation_samples']} validation / "
        f"{manifest['test_samples']} test (seed {manifest['seed']})\n"
        f"Metrics : top-1 {metrics.get('test_accuracy', 0):.4f}, "
        f"top-3 {metrics.get('test_top3_accuracy', 0):.4f}, "
        f"top-10 {metrics.get('test_top10_accuracy', 0):.4f} (held-out test split)\n"
        f"Params  : {manifest['parameters']:,}\n"
        f"Trained : {manifest['trained_at']}\n\n"
        "Quick, Draw! is a Google project; the dataset is used here under CC BY 4.0.\n"
        "SketchAI is not affiliated with or endorsed by Google.\n"
    )

    archive = cfg.export_dir.parent / "sketchai-model-345.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle_zip:
        for path in sorted(cfg.export_dir.iterdir()):
            if path.is_file():
                bundle_zip.write(path, arcname=f"model-345/{path.name}")

    logger(f"Exported to {cfg.export_dir} ({verification['megabytes']} MB)")
    logger(f"Zip archive: {archive}")
    return {"verification": verification, "manifest": manifest, "archive": str(archive)}


# --------------------------------------------------------------------------------------
# 10. Pipeline entry points
# --------------------------------------------------------------------------------------


def run_pipeline(cfg: Config, logger=print, categories: Sequence[str] | None = None) -> dict:
    """Full train → evaluate → export pipeline. Returns a summary dictionary."""
    started = time.time()
    cfg = cfg.resolve()
    if categories is None:
        categories = fetch_categories()
        if cfg.quick_test:
            categories = quick_test_categories(categories, cfg.quick_test_categories)
    categories = list(categories)

    logger("Configuration:")
    for key, value in cfg.describe().items():
        logger(f"  {key}: {value}")
    logger(f"Categories: {len(categories)}")

    logger("\n[1/6] Downloading dataset")
    download_dataset(categories, cfg, logger=logger)

    logger("\n[2/6] Building splits")
    bundle = build_splits(categories, cfg, logger=logger)

    logger("\n[3/6] Building model")
    model = build_model(len(categories), cfg)
    model.summary(print_fn=logger)

    logger("\n[4/6] Training")
    history = train_model(model, bundle, cfg, logger=logger)

    logger("\n[5/7] Evaluating on the held-out test split")
    metrics = evaluate_model(model, bundle, cfg, logger=logger)

    logger("\n[6/7] Error analysis")
    confusions = confusion_pairs(model, bundle, cfg)
    plots = plot_history(cfg)

    logger("\n[7/7] Exporting to TensorFlow.js")
    exported = save_and_export(model, bundle, metrics, cfg, history=history, logger=logger)

    summary = {
        "quick_test": cfg.quick_test,
        "dataset": cfg.dataset,
        "categories": len(categories),
        "category_names": categories,
        "config": cfg.describe(),
        "metrics": metrics,
        "confusions": confusions,
        "plots": plots,
        "export": exported["verification"],
        "archive": exported["archive"],
        "export_dir": str(cfg.export_dir),
        "minutes": round((time.time() - started) / 60, 2),
    }
    (cfg.output_dir / "summary.json").write_text(json.dumps(summary, indent=2))
    logger(f"\nDone in {summary['minutes']} minutes. Summary: {cfg.output_dir / 'summary.json'}")
    return summary


def parse_args(argv: Sequence[str] | None = None) -> Config:
    parser = argparse.ArgumentParser(description="Train SketchAI's 345-class Quick, Draw! classifier.")
    parser.add_argument("--quick-test", action="store_true", help="small end-to-end run (20 classes, up to 500 rows/class, 10 epochs)")
    parser.add_argument("--samples-per-class", type=int, default=Config.samples_per_class)
    parser.add_argument("--epochs", type=int, default=Config.epochs)
    parser.add_argument("--batch-size", type=int, default=Config.batch_size)
    parser.add_argument("--seed", type=int, default=Config.seed)
    parser.add_argument("--dataset", choices=["quickdraw-js", "quickdraw-gcs-sampled", "quickdraw-gcs-full", "synthetic"], default="quickdraw-js",
                        help="quickdraw-gcs-sampled reads N rows/class; quickdraw-gcs-full reads all official GCS rows; synthetic is only a self-test")
    parser.add_argument("--gcs-chunk-rows", type=int, default=Config.gcs_chunk_rows,
                        help="rows per bounded GCS transfer chunk (default: %(default)s)")
    parser.add_argument("--no-augment", action="store_true", help="disable light augmentation")
    parser.add_argument("--categories", type=int, default=0, help="limit the number of categories (debug)")
    parser.add_argument("--drive-dir", type=Path, default=None, help="optional Google Drive checkpoint directory")
    parser.add_argument("--export-dir", type=Path, default=None)
    args = parser.parse_args(list(argv) if argv is not None else None)

    # A quick test must never be mistaken for a real model, so it exports into the
    # scratch work directory instead of training/export/model-345.
    if args.export_dir is not None:
        export_dir = args.export_dir
    elif args.quick_test:
        export_dir = WORK_DIR / "quick-test-export" / "model-345"
    else:
        export_dir = EXPORT_DIR

    cfg = Config(
        samples_per_class=args.samples_per_class,
        gcs_chunk_rows=args.gcs_chunk_rows,
        epochs=args.epochs,
        batch_size=args.batch_size,
        seed=args.seed,
        quick_test=args.quick_test,
        category_limit=args.categories,
        augment=not args.no_augment,
        dataset=args.dataset,
        drive_checkpoint_dir=args.drive_dir,
        export_dir=export_dir,
        output_dir=WORK_DIR / ("quick-test-run" if args.quick_test else "run"),
        cache_dir=WORK_DIR / ("quick-test-cache" if args.quick_test else "cache"),
    )
    return cfg


def main(argv: Sequence[str] | None = None) -> int:
    cfg = parse_args(argv)
    cfg = cfg.resolve()
    categories = fetch_categories()
    if cfg.quick_test:
        categories = quick_test_categories(categories, cfg.quick_test_categories)
    if cfg.category_limit:
        categories = categories[: cfg.category_limit]
    sample_description = (
        "all source rows" if cfg.dataset == "quickdraw-gcs-full" and not cfg.quick_test
        else f"up to {cfg.samples_per_class} rows/class"
    )
    print(f"Training {len(categories)} classes · {sample_description} · "
          f"{cfg.epochs} epochs · dataset={cfg.dataset}")
    run_pipeline(cfg, categories=categories)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
