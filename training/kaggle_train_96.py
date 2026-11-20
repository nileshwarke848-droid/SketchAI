#!/usr/bin/env python3
"""SketchAI - Kaggle trainer for the 96x96x3 black-on-white doodle classifier.

Rewrite of the `modelX` Kaggle script. Same workflow (Kaggle input -> train ->
resume across sessions -> zip), but the pipeline now matches what the app does at
inference, and it exports what the app needs.

Why the old version underperformed
----------------------------------
1. Renderer / app mismatch. The old script drew strokes edge-to-edge on a 256x256
   white canvas at pen width 7 and bilinearly resized to 96. The app instead finds
   the ink bounding box, takes a square of side max(w,h) * 1.186 around its centre
   (src/ai/preprocess.js), area-averages it into the grid, and lifts the 97th
   percentile of ink to 1.0. Measured on the updated archive against our frozen
   400-drawing bench, exactly this mismatch cost ~19 % top-1 (14.5 % -> 4.3 %).
   Here every training image is produced by a Python port of the app pipeline.
2. Re-rendering every epoch. 333 classes x 500 drawings re-rasterised per epoch is
   ~460 CPU-seconds of waste per epoch, and the GPU mostly waits. Drawings are now
   rendered once into a uint8 cache (uint8 = 9 KB/drawing), so MAX_PER_CLASS can go
   from 500 to 2000+ and the input pipeline becomes I/O bound.
3. Stroke weight was pinned. The evaluated archive was brittle: thinning its input
   by 3 px moved top-1 from 7 % to 14.5 %, fattening it dropped it to 2 %. Pen
   width, pen opacity and drawing placement are now randomised per drawing, so the
   model cannot depend on one exact pen.
4. Missing pieces: no stratified split, no top-3 metric, no label smoothing, no
   mixed precision, no resume-safe checkpointing, no classes.txt / TF.js export.

Usage
-----
Paste this whole file into a Kaggle cell and run it (or save as
`kaggle_train_96.py` and use `!python kaggle_train_96.py ...`). With no arguments it
builds the cache, trains, evaluates and exports:

    python kaggle_train_96.py                       # everything
    python kaggle_train_96.py --stage cache          # only build/refresh the cache
    python kaggle_train_96.py --stage train          # train; rerun after a timeout
                                                     # to continue where it stopped
    python kaggle_train_96.py --stage export         # evaluate + export + zip

Sanity-check the pipeline in ~30 s on synthetic doodles, no dataset needed:

    python kaggle_train_96.py --selftest
"""

from __future__ import annotations

import argparse
import glob
import hashlib
import json
import math
import os
import random
import shutil
import subprocess
import sys
import time
import zipfile
from pathlib import Path
from typing import Optional, Sequence

import numpy as np
from PIL import Image, ImageDraw

# ======================================================================================
# EDIT THIS BLOCK
# ======================================================================================
DATASET_GLOB = ["/kaggle/input/**/*.ndjson"]  # your stroke-vector ndjson files
OUTPUT_DIR = "/kaggle/working/output"
CACHE_DIR = "/kaggle/working/cache96"
MODEL_NAME = "modelX96"

SAMPLES_PER_CLASS = 2000  # 500 was the old value; each drawing costs ~9 KB on disk
VAL_FRACTION = 0.05
EPOCHS_PER_RUN = 20  # resumable: run again for another 20
BATCH_SIZE = 256
PEAK_LR = 3e-3
BASE_FILTERS = 32

CLASSES_FILE = None  # e.g. "/kaggle/input/sketchai-app/classes.txt" to pin the label
#                      order to the app's existing public/model-345/classes.txt
INSTALL_TFJS = True  # pip-install tensorflowjs on first run (needs internet)
# ======================================================================================

# App pipeline constants - MUST match src/ai/preprocess.js.
APP_CANVAS_W, APP_CANVAS_H = 1200, 720  # logical canvas (App.jsx)
APP_PEN_WIDTH = 7  # default pen (App.jsx)
RENDER_SCALE = 0.8  # render at 960x576: 2.5x the model grid once cropped, good AA
CROP_PADDING = 1.186  # preprocess.js CROP_PADDING
INK_THRESHOLD = 10 / 255  # preprocess.js INK_ALPHA_THRESHOLD / 255
TARGET_INK_PEAK = 1.0  # preprocess.js profile for the 345/333 models
MIN_GAMMA = 0.25  # preprocess.js MIN_CONTRAST_GAMMA
MODEL_SIZE = 96

# Domain randomisation for the renderer.
DRAWING_SPAN = (0.35, 0.68)  # drawing bbox side as a fraction of canvas height
PEN_JITTER = (0.65, 1.45)  # multiplier on the 7 px pen
OPACITY_JITTER = (0.55, 1.0)  # pen alpha: pale strokes vs fully opaque


# --------------------------------------------------------------------------------------
# Renderer: emulate the app canvas, then run the app's own 96x96 preprocessing
# --------------------------------------------------------------------------------------
def _canvas_size() -> tuple[int, int]:
    return int(APP_CANVAS_W * RENDER_SCALE), int(APP_CANVAS_H * RENDER_SCALE)


def render_vector_canvas(strokes, rng: np.random.Generator) -> np.ndarray:
    """Draw Quick, Draw! `[xs, ys]` strokes like a user would in the app."""
    width, height = _canvas_size()
    canvas = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(canvas)

    xs_all, ys_all = [], []
    for stroke in strokes or []:
        if len(stroke) >= 2 and len(stroke[0]) and len(stroke[0]) == len(stroke[1]):
            xs_all.append(np.asarray(stroke[0], float))
            ys_all.append(np.asarray(stroke[1], float))
    if not xs_all:
        return np.zeros((height, width), np.uint8)
    xs_all = np.concatenate(xs_all)
    ys_all = np.concatenate(ys_all)

    span = max(xs_all.max() - xs_all.min(), ys_all.max() - ys_all.min(), 1.0)
    scale = rng.uniform(*DRAWING_SPAN) * height / span
    pen = max(1, int(round(APP_PEN_WIDTH * RENDER_SCALE * rng.uniform(*PEN_JITTER))))
    ink = int(round(255 * rng.uniform(*OPACITY_JITTER)))

    offset_x = width * rng.uniform(0.35, 0.65) - (xs_all.min() + xs_all.max()) / 2 * scale
    offset_y = height * rng.uniform(0.35, 0.65) - (ys_all.min() + ys_all.max()) / 2 * scale

    for stroke in strokes:
        if len(stroke) < 2:
            continue
        sx, sy = stroke[0], stroke[1]
        if len(sx) != len(sy) or len(sx) < 2:
            continue
        points = [(x * scale + offset_x, y * scale + offset_y) for x, y in zip(sx, sy)]
        draw.line(points, fill=ink, width=pen, joint="curve")
        r = pen / 2
        for x, y in (points[0], points[-1]):  # round caps, like ctx.lineCap = "round"
            draw.ellipse((x - r, y - r, x + r, y + r), fill=ink)
    return np.asarray(canvas, dtype=np.uint8)


def render_bitmap_canvas(bitmap, rng: np.random.Generator) -> np.ndarray:
    """Fallback for 28x28 bitmap sources (weights are baked in, so no pen jitter)."""
    width, height = _canvas_size()
    grid = np.clip(np.asarray(bitmap, dtype=np.float32).reshape(28, 28), 0.0, 1.0)
    rows, cols = np.nonzero(grid > 0.08)
    if rows.size == 0:
        return np.zeros((height, width), np.uint8)
    crop = grid[rows.min():rows.max() + 1, cols.min():cols.max() + 1]
    size = max(2, int(round(rng.uniform(*DRAWING_SPAN) * height)))
    image = Image.fromarray((crop * 255).astype(np.uint8)).resize((size, size), Image.BILINEAR)
    canvas = Image.new("L", (width, height), 0)
    canvas.paste(image, ((width - size) // 2, (height - size) // 2))
    return np.asarray(canvas, dtype=np.uint8)


def app_preprocess(ink_alpha: np.ndarray, size: int = MODEL_SIZE) -> Optional[np.ndarray]:
    """Python port of src/ai/preprocess.js -> the app's exact model input.

    bbox -> square of side max(w,h)*CROP_PADDING centred on the bbox -> area average
    into `size` -> lift the 97th percentile of ink to TARGET_INK_PEAK -> invert to
    black-on-white. Returns float32 0..1 (1.0 = paper), or None for a blank drawing.
    """
    alpha = ink_alpha.astype(np.float32) / 255.0
    mask = alpha > INK_THRESHOLD
    if not mask.any():
        return None
    rows, cols = np.nonzero(mask)
    x0, x1, y0, y1 = cols.min(), cols.max(), rows.min(), rows.max()
    side = max(x1 - x0 + 1, y1 - y0 + 1) * CROP_PADDING
    left = int(math.floor((x0 + x1 + 1) / 2 - side / 2))
    top = int(math.floor((y0 + y1 + 1) / 2 - side / 2))
    side_i = max(1, int(round(side)))

    crop = np.zeros((side_i, side_i), np.float32)  # outside the canvas = no ink
    sx0, sy0 = max(0, left), max(0, top)
    sx1, sy1 = min(alpha.shape[1], left + side_i), min(alpha.shape[0], top + side_i)
    if sx1 > sx0 and sy1 > sy0:
        crop[sy0 - top:sy1 - top, sx0 - left:sx1 - left] = alpha[sy0:sy1, sx0:sx1]

    grid = np.asarray(Image.fromarray(crop).resize((size, size), Image.BOX), dtype=np.float32)

    flat = grid.ravel()
    k = min(flat.size - 1, int(0.97 * (flat.size - 1)))
    peak = float(np.partition(flat, k)[k])
    if 0.0 < peak < TARGET_INK_PEAK:
        gamma = min(1.0, max(MIN_GAMMA, math.log(TARGET_INK_PEAK) / math.log(peak)))
        if gamma < 1.0:
            grid = np.power(grid, gamma)

    return np.clip(1.0 - grid, 0.0, 1.0)


def record_to_input(record, rng: np.random.Generator) -> Optional[np.ndarray]:
    if isinstance(record, dict) and record.get("drawing"):
        canvas = render_vector_canvas(record["drawing"], rng)
    elif isinstance(record, dict) and record.get("bitmap") is not None:
        canvas = render_bitmap_canvas(record["bitmap"], rng)
    elif isinstance(record, (list, tuple)) and len(record) == 784:
        canvas = render_bitmap_canvas(record, rng)
    else:
        return None
    return app_preprocess(canvas)


# --------------------------------------------------------------------------------------
# Class discovery and label order
# --------------------------------------------------------------------------------------
def _class_name(path: str) -> str:
    """`apple.ndjson`, `apple.ndjson.gz` and `apple.gz` all name the class "apple"."""
    name = Path(path).name
    for suffix in (".gz", ".ndjson", ".json", ".zip"):
        while name.lower().endswith(suffix):
            name = name[: -len(suffix)]
    return name


def discover_classes(patterns: Sequence[str]) -> dict[str, list[str]]:
    files: list[str] = []
    for pattern in patterns:
        files.extend(glob.glob(pattern, recursive=True))
    files = sorted({os.path.abspath(f) for f in files})
    if not files:
        raise SystemExit(
            "No .ndjson files found. Point DATASET_GLOB / --dataset-glob at the Kaggle "
            "dataset, e.g. '/kaggle/input/**/simplified/*.ndjson'."
        )
    by_class: dict[str, list[str]] = {}
    for path in files:
        by_class.setdefault(_class_name(path), []).append(path)
    return by_class


def resolve_class_order(available: dict[str, list[str]], classes_file: Optional[str],
                        allow_missing: bool) -> list[str]:
    """The app indexes labels by position in classes.txt, so the training order ships."""
    if not classes_file:
        return sorted(available)
    path = Path(classes_file)
    if not path.exists():
        raise SystemExit(f"--classes-file {classes_file} does not exist")
    order = [line.strip() for line in path.read_text().splitlines() if line.strip()]
    missing = [name for name in order if name not in available]
    if missing:
        message = (f"{len(missing)} of {len(order)} classes in {path.name} have no data "
                   f"here: {', '.join(missing[:8])}{' ...' if len(missing) > 8 else ''}")
        if not allow_missing:
            raise SystemExit(message + "\nPass --allow-missing to train the available "
                                       "classes only (the app then needs the reduced classes.txt).")
        print(f"  ! {message}\n    training {len(order) - len(missing)} available classes", flush=True)
    return [name for name in order if name in available]


# --------------------------------------------------------------------------------------
# Stage 1: render once into a uint8 cache
# --------------------------------------------------------------------------------------
def _build_one(job: dict) -> dict:
    import gzip

    index, name, paths = job["index"], job["name"], job["paths"]
    limit = job["samples_per_class"]
    rng = np.random.default_rng(job["seed"] + index)
    images: list[np.ndarray] = []

    for path in paths:
        opener = gzip.open if path.endswith(".gz") else open
        with opener(path, "rt", encoding="utf-8", errors="ignore") as handle:
            for line in handle:
                if len(images) >= limit:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if job["only_recognised"] and isinstance(record, dict) and record.get("recognized") is False:
                    continue
                sample = record_to_input(record, rng)
                if sample is not None:
                    images.append(np.rint(sample * 255.0).astype(np.uint8))
        if len(images) >= limit:
            break

    if not images:
        return {"index": index, "name": name, "train": 0, "val": 0}

    stacked = np.stack(images)
    order = rng.permutation(len(stacked))
    val_count = max(1, int(round(len(stacked) * job["val_fraction"]))) if len(stacked) > 4 else 0
    cache = Path(job["cache_dir"])
    np.save(cache / f"{index:03d}-train.npy", stacked[order[val_count:]])
    np.save(cache / f"{index:03d}-val.npy", stacked[order[:val_count]])

    if job.get("preview_dir") and index < job["preview_classes"]:
        preview = Path(job["preview_dir"])
        preview.mkdir(parents=True, exist_ok=True)
        for row in range(min(4, len(stacked))):
            Image.fromarray(stacked[row]).save(
                preview / f"{index:03d}-{name.replace(' ', '_')}-{row}.png")

    return {"index": index, "name": name, "train": int(len(stacked) - val_count), "val": int(val_count)}


def build_cache(args, class_names: Sequence[str], by_class: dict[str, list[str]]) -> dict:
    cache = Path(args.cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    manifest = {
        "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model_size": MODEL_SIZE,
        "crop_padding": CROP_PADDING,
        "target_ink_peak": TARGET_INK_PEAK,
        "samples_per_class": args.samples_per_class,
        "val_fraction": args.val_fraction,
        "classes": list(class_names),
        "counts": {},
    }

    estimate = len(class_names) * args.samples_per_class * MODEL_SIZE * MODEL_SIZE / 1e9
    print(f"Rendering up to {args.samples_per_class} drawings/class x {len(class_names)} "
          f"classes -> ~{estimate:.1f} GB uint8 cache in {cache}", flush=True)

    jobs = [{
        "index": i, "name": name, "paths": by_class[name],
        "samples_per_class": args.samples_per_class, "val_fraction": args.val_fraction,
        "seed": args.seed, "cache_dir": str(cache),
        "only_recognised": args.only_recognised,
        "preview_dir": str(Path(args.output_dir) / "preview") if args.preview else None,
        "preview_classes": args.preview,
    } for i, name in enumerate(class_names)]

    todo = [job for job in jobs if not (cache / f"{job['index']:03d}-train.npy").exists()]
    if len(todo) < len(jobs):
        print(f"  resuming: {len(jobs) - len(todo)} classes already cached", flush=True)

    started, done = time.time(), 0
    if args.workers > 1 and len(todo) > 1:
        import multiprocessing as mp
        with mp.Pool(args.workers) as pool:
            for result in pool.imap_unordered(_build_one, todo, chunksize=1):
                done += 1
                manifest["counts"][result["name"]] = result
                if done % 10 == 0 or done == len(todo):
                    elapsed = time.time() - started
                    eta = elapsed / done * (len(todo) - done)
                    print(f"  {done}/{len(todo)} classes | {elapsed / 60:.1f} min elapsed, "
                          f"~{eta / 60:.1f} min left | {result['name']} "
                          f"({result['train']} train / {result['val']} val)", flush=True)
    else:
        for job in todo:
            result = _build_one(job)
            done += 1
            manifest["counts"][result["name"]] = result
            if done % 10 == 0 or done == len(todo):
                print(f"  {done}/{len(todo)} classes | {result['name']}", flush=True)

    for index, name in enumerate(class_names):  # include classes cached in earlier runs
        if name not in manifest["counts"]:
            train = np.load(cache / f"{index:03d}-train.npy", mmap_mode="r")
            val = np.load(cache / f"{index:03d}-val.npy", mmap_mode="r")
            manifest["counts"][name] = {"index": index, "name": name,
                                        "train": int(train.shape[0]), "val": int(val.shape[0])}

    empty = [name for name, c in manifest["counts"].items() if c["train"] == 0]
    if empty:
        print(f"  ! {len(empty)} classes produced no drawings (skipped): {', '.join(empty[:6])}", flush=True)
        manifest["classes"] = [name for name in class_names if manifest["counts"][name]["train"] > 0]
        for new_index, name in enumerate(manifest["classes"]):
            manifest["counts"][name]["index"] = new_index

    manifest["total_train"] = sum(c["train"] for c in manifest["counts"].values())
    manifest["total_val"] = sum(c["val"] for c in manifest["counts"].values())
    (cache / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Cache ready: {manifest['total_train']} train + {manifest['total_val']} "
          f"validation drawings", flush=True)
    return manifest


# --------------------------------------------------------------------------------------
# Stage 2: fast tf.data loader over the cache
# --------------------------------------------------------------------------------------
class CacheReader:
    """Random access over the per-class .npy files without loading them into RAM."""

    def __init__(self, manifest: dict, cache_dir: Path, split: str):
        self.arrays: list[np.ndarray] = []
        self.offsets: list[int] = []
        labels: list[np.ndarray] = []
        running = 0
        for name in manifest["classes"]:
            index = manifest["counts"][name]["index"]
            path = cache_dir / f"{index:03d}-{split}.npy"
            if not path.exists():
                continue
            array = np.load(path, mmap_mode="r")
            if array.shape[0] == 0:
                continue
            self.arrays.append(array)
            self.offsets.append(running)
            labels.append(np.full(array.shape[0], index, np.int32))
            running += array.shape[0]
        self.offsets_arr = np.asarray(self.offsets, np.int64)
        self.size = running
        self.y = np.concatenate(labels) if labels else np.zeros(0, np.int32)

    def load_batch(self, gids: np.ndarray) -> np.ndarray:
        gids = np.asarray(gids, np.int64).ravel()
        slots = np.searchsorted(self.offsets_arr, gids, side="right") - 1
        out = np.empty((gids.size, MODEL_SIZE, MODEL_SIZE), np.uint8)
        for slot in np.unique(slots):
            rows = gids[slots == slot] - self.offsets[slot]
            out[slots == slot] = self.arrays[slot][rows]
        return out


_AUGMENT = None


def _augment(images):
    """Geometry jitter only - pen width/opacity were randomised at render time."""
    import tensorflow as tf

    global _AUGMENT
    if _AUGMENT is None:
        _AUGMENT = tf.keras.Sequential([
            tf.keras.layers.RandomRotation(0.045, fill_mode="constant", fill_value=1.0),
            tf.keras.layers.RandomTranslation(0.05, 0.05, fill_mode="constant", fill_value=1.0),
            tf.keras.layers.RandomZoom(0.06, fill_mode="constant", fill_value=1.0),
        ])
    # Keras augmentation layers follow mixed_float16; the contrast step needs a
    # fixed dtype, so bring the batch back to float32.
    images = tf.cast(_AUGMENT(images, training=True), tf.float32)
    ink = 1.0 - images  # a little contrast jitter so pale pens are not a new domain
    return 1.0 - ink * tf.random.uniform([], 0.85, 1.0)


def make_dataset(reader: CacheReader, batch_size: int, training: bool, seed: int, num_classes: int):
    import tensorflow as tf

    ds = tf.data.Dataset.from_tensor_slices(np.arange(reader.size, dtype=np.int64))
    if training:
        ds = ds.shuffle(min(reader.size, 60_000), seed=seed, reshuffle_each_iteration=True)
    ds = ds.batch(batch_size, drop_remainder=training)

    def load(gids):
        images = tf.numpy_function(reader.load_batch, [gids], tf.uint8)
        images.set_shape([None, MODEL_SIZE, MODEL_SIZE])
        images = tf.cast(images, tf.float32) / 255.0
        images = tf.image.grayscale_to_rgb(tf.expand_dims(images, -1))
        # Keras 3 only supports label smoothing for the one-hot loss, so labels are
        # one-hot; 345 floats per drawing is nothing next to the image.
        labels = tf.numpy_function(lambda g: reader.y[g], [gids], tf.int32)
        labels.set_shape([None])
        return images, tf.one_hot(labels, num_classes, dtype=tf.float32)

    ds = ds.map(load, num_parallel_calls=tf.data.AUTOTUNE, deterministic=False)
    if training:
        ds = ds.map(lambda x, y: (_augment(x), y),
                    num_parallel_calls=tf.data.AUTOTUNE, deterministic=False)
    return ds.prefetch(tf.data.AUTOTUNE)


# --------------------------------------------------------------------------------------
# Stage 3: model + training
# --------------------------------------------------------------------------------------
def build_model(num_classes: int, base: int = 32, dropout: float = 0.3):
    import tensorflow as tf
    from tensorflow.keras import layers

    # momentum 0.9 rather than 0.99: the batch distribution is randomised by the
    # renderer and moving statistics must also be usable after a short resume run.
    def norm(x):
        return layers.BatchNormalization(momentum=0.9)(x)

    def block(x, filters: int, repeat: int):
        for _ in range(repeat):
            x = layers.Conv2D(filters, 3, padding="same", use_bias=False)(x)
            x = norm(x)
            x = layers.Activation("relu")(x)
        return layers.MaxPooling2D()(x)

    inputs = layers.Input(shape=(MODEL_SIZE, MODEL_SIZE, 3), name="sketch")
    x = block(inputs, base, 2)  # 48
    x = block(x, base * 2, 2)  # 24
    x = block(x, base * 4, 2)  # 12
    x = block(x, base * 8, 1)  # 6
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dropout(dropout)(x)
    x = layers.Dense(512, use_bias=False)(x)
    x = norm(x)
    x = layers.Activation("relu")(x)
    x = layers.Dropout(dropout)(x)
    # Softmax stays float32 so mixed precision cannot round the probabilities.
    outputs = layers.Dense(num_classes, activation="softmax", dtype="float32", name="label")(x)
    return tf.keras.Model(inputs, outputs, name="sketchai-96")


def _optimizer(planned_epochs: int, steps_per_epoch: int, peak_lr: float):
    import tensorflow as tf

    steps = max(1, planned_epochs * steps_per_epoch)
    schedule = tf.keras.optimizers.schedules.CosineDecay(
        initial_learning_rate=peak_lr,
        decay_steps=steps,
        alpha=0.02,
        warmup_target=peak_lr,
        warmup_steps=max(1, int(0.06 * steps)),
    )
    try:
        return tf.keras.optimizers.AdamW(learning_rate=schedule, weight_decay=1e-4)
    except AttributeError:  # TF < 2.11
        return tf.keras.optimizers.Adam(learning_rate=schedule)


def train(args, manifest: dict) -> None:
    import tensorflow as tf

    tf.keras.utils.set_random_seed(args.seed)
    if args.mixed_precision:
        tf.keras.mixed_precision.set_global_policy("mixed_float16")
    if args.xla:
        tf.config.optimizer.set_jit(True)

    cache, output = Path(args.cache_dir), Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    model_path = output / f"{args.model_name}.keras"
    checkpoint_path = output / "checkpoints" / "best.keras"
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    state_path = output / "training_state.json"

    class_names = manifest["classes"]
    num_classes = len(class_names)
    train_reader = CacheReader(manifest, cache, "train")
    val_reader = CacheReader(manifest, cache, "val")
    if train_reader.size == 0:
        raise SystemExit("The cache is empty - run --stage cache first.")
    print(f"{train_reader.size} train / {val_reader.size} validation drawings, "
          f"{num_classes} classes", flush=True)

    train_ds = make_dataset(train_reader, args.batch_size, True, args.seed, num_classes)
    val_ds = make_dataset(val_reader, args.batch_size, False, args.seed, num_classes)
    steps_per_epoch = max(1, train_reader.size // args.batch_size)

    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    trained = int(state.get("total_epochs", 0))
    resuming = model_path.exists()
    if args.resume_from and Path(args.resume_from).exists():
        shutil.copy2(args.resume_from, model_path)
        resuming = True

    planned = trained + args.epochs_per_run
    model = (tf.keras.models.load_model(model_path, compile=False)
             if resuming else build_model(num_classes, args.base_filters, args.dropout))
    if resuming:
        print(f"Resuming {model_path} after {trained} epochs", flush=True)
    else:
        print(f"Model: {model.count_params():,} parameters, input {model.input_shape}", flush=True)

    lr = args.lr * (0.5 if resuming else 1.0)
    model.compile(
        optimizer=_optimizer(planned, steps_per_epoch, lr),
        loss=tf.keras.losses.CategoricalCrossentropy(label_smoothing=0.1),
        metrics=[
            tf.keras.metrics.CategoricalAccuracy(name="accuracy"),
            tf.keras.metrics.TopKCategoricalAccuracy(k=3, name="top3_accuracy"),
        ],
    )

    callbacks = [
        tf.keras.callbacks.ModelCheckpoint(
            checkpoint_path, monitor="val_accuracy", mode="max", save_best_only=True,
            # Without this a resume run that starts worse would overwrite the best.
            initial_value_threshold=state.get("best_val_accuracy"),
            verbose=1,
        ),
        tf.keras.callbacks.CSVLogger(output / "history.csv", append=bool(state)),
        tf.keras.callbacks.TerminateOnNaN(),
    ]
    if args.early_stop_patience:
        callbacks.append(tf.keras.callbacks.EarlyStopping(
            monitor="val_accuracy", mode="max", patience=args.early_stop_patience, verbose=1))

    print(f"Run {int(state.get('runs', 0)) + 1}: epochs {trained} -> {planned}", flush=True)
    started = time.time()
    history = model.fit(train_ds, validation_data=val_ds, initial_epoch=trained,
                        epochs=planned, callbacks=callbacks, verbose=2)
    print(f"Finished in {(time.time() - started) / 60:.1f} min", flush=True)

    model.save(model_path)  # "last" model, so the next session can continue
    vals = [float(v) for v in history.history.get("val_accuracy", [])]
    state.update({
        "runs": int(state.get("runs", 0)) + 1,
        "total_epochs": planned,
        "last_val_accuracy": vals[-1] if vals else None,
        "best_val_accuracy": max([state.get("best_val_accuracy") or 0.0] + vals),
    })
    state_path.write_text(json.dumps(state, indent=2) + "\n")
    print(f"State: {state}", flush=True)


# --------------------------------------------------------------------------------------
# Stage 4: evaluate + export for the app
# --------------------------------------------------------------------------------------
def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _convert_tfjs(saved_dir: Path, tfjs_dir: Path) -> None:
    if tfjs_dir.exists():
        shutil.rmtree(tfjs_dir)
    tfjs_dir.mkdir(parents=True, exist_ok=True)
    arguments = [str(saved_dir), str(tfjs_dir), "--input_format=tf_saved_model",
                 "--saved_model_tags=serve"]
    if os.environ.get("TFJS_QUANTIZE"):
        arguments.append("--quantize_uint8")
    commands = []
    exe = shutil.which("tensorflowjs_converter")
    if exe:
        commands.append([exe] + arguments)
    commands.append([sys.executable, "-m", "tensorflowjs.converters.convert"] + arguments)
    last_error = None
    for command in commands:
        try:
            subprocess.run(command, check=True, capture_output=True, text=True)
            return
        except Exception as error:  # noqa: BLE001
            last_error = error
    raise RuntimeError(f"converter unavailable ({last_error})")


def evaluate_and_export(args, manifest: dict) -> dict:
    import tensorflow as tf

    cache, output = Path(args.cache_dir), Path(args.output_dir)
    class_names = manifest["classes"]
    checkpoint = output / "checkpoints" / "best.keras"
    model_file = checkpoint if checkpoint.exists() else output / f"{args.model_name}.keras"
    if not model_file.exists():
        raise SystemExit(f"No trained model at {model_file} - run --stage train first")

    model = tf.keras.models.load_model(model_file, compile=False)
    print(f"Evaluating {model_file} ({model.count_params():,} params)", flush=True)

    reader = CacheReader(manifest, cache, "val")
    top1 = top3 = top5 = total = 0
    hits: dict[int, int] = {}
    counts: dict[int, int] = {}
    for start in range(0, reader.size, 256):
        gids = np.arange(start, min(start + 256, reader.size), dtype=np.int64)
        images = reader.load_batch(gids)
        x = np.repeat(images[..., None].astype(np.float32) / 255.0, 3, axis=-1)
        probs = model.predict(x, verbose=0)
        labels = reader.y[gids]
        top = np.argsort(-probs, axis=1)[:, :5]
        match = top == labels[:, None]
        top1 += int(match[:, 0].sum())
        top3 += int(match[:, :3].any(axis=1).sum())
        top5 += int(match[:, :5].any(axis=1).sum())
        total += len(labels)
        for label, hit in zip(labels, match[:, 0]):
            counts[int(label)] = counts.get(int(label), 0) + 1
            hits[int(label)] = hits.get(int(label), 0) + int(hit)

    metrics = {"val_drawings": total,
               "top1": round(100 * top1 / max(1, total), 2),
               "top3": round(100 * top3 / max(1, total), 2),
               "top5": round(100 * top5 / max(1, total), 2)}
    print(f"Validation: top-1 {metrics['top1']}% | top-3 {metrics['top3']}% | "
          f"top-5 {metrics['top5']}% on {total} drawings", flush=True)

    with (output / "val_per_class.csv").open("w") as handle:
        handle.write("index,class,drawings,top1_accuracy\n")
        for index in sorted(counts):
            name = class_names[index] if index < len(class_names) else str(index)
            handle.write(f"{index},{name},{counts[index]},{hits.get(index, 0) / counts[index]:.3f}\n")

    if not args.export:
        return metrics

    if INSTALL_TFJS:
        try:
            import tensorflowjs  # noqa: F401
        except ImportError:
            print("Installing tensorflowjs (needs internet)...", flush=True)
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "tensorflowjs"],
                           check=False)

    final_model = output / f"{args.model_name}.keras"
    if model_file != final_model:
        shutil.copy2(model_file, final_model)
    classes_path = output / "classes.txt"
    classes_path.write_text("\n".join(class_names) + "\n")
    (output / "class_indices.json").write_text(
        json.dumps({n: i for i, n in enumerate(class_names)}, indent=2, ensure_ascii=False) + "\n")

    tfjs_ok, saved_dir, tfjs_dir = False, output / "saved_model", output / "tfjs"
    try:
        if saved_dir.exists():
            shutil.rmtree(saved_dir)
        model.export(str(saved_dir))
        _convert_tfjs(saved_dir, tfjs_dir)
        tfjs_ok = True
    except Exception as error:  # noqa: BLE001
        print(f"  ! TF.js export failed: {error}\n    pip -q install tensorflowjs, "
              f"then rerun with --stage export", flush=True)

    metadata = {
        "model": args.model_name,
        "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "parameters": int(model.count_params()),
        "input": {
            "shape": [1, MODEL_SIZE, MODEL_SIZE, 3],
            "dtype": "float32",
            "range": "0..1, paper 1.0, ink 0.0, greyscale replicated over RGB",
            "pipeline": (f"src/ai/preprocess.js: bbox crop (CROP_PADDING={CROP_PADDING}), area "
                         f"average to {MODEL_SIZE}, 97th percentile of ink lifted to "
                         f"{TARGET_INK_PEAK}, then inverted"),
        },
        "classes": len(class_names),
        "classes_sha256": _sha256(classes_path),
        "trained": {"samples_per_class": manifest.get("samples_per_class"),
                    "train": manifest.get("total_train"), "val": manifest.get("total_val")},
        "validation": metrics,
    }
    metadata_path = output / "metadata.json"
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n")

    zip_path = output / f"{args.model_name}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in (final_model, classes_path, output / "class_indices.json", metadata_path):
            archive.write(path, arcname=path.name)
        if tfjs_ok:
            for path in sorted(tfjs_dir.rglob("*")):
                if path.is_file():
                    archive.write(path, arcname=str(Path("tfjs") / path.relative_to(tfjs_dir)))

    print(f"Exported {final_model.name} and {zip_path.name}", flush=True)
    print(f"  classes.txt: {len(class_names)} labels (sha256 {_sha256(classes_path)[:16]}...)", flush=True)
    print(f"  TF.js: {'yes -> ' + str(tfjs_dir) if tfjs_ok else 'no'}", flush=True)
    return metrics


# --------------------------------------------------------------------------------------
# Self test (synthetic, ~30 s, no dataset needed)
# --------------------------------------------------------------------------------------
def _synthetic_dataset(root: Path, classes: int = 4, per_class: int = 60) -> None:
    root.mkdir(parents=True, exist_ok=True)
    angles = np.linspace(0, 2 * np.pi, 32)
    canonical = {
        "circle": [[[128 + 90 * np.cos(a) for a in angles], [128 + 90 * np.sin(a) for a in angles]]],
        "line": [[[60 + i * 8 for i in range(25)], [200 - i * 5 for i in range(25)]]],
        "zigzag": [[[60 + i * 8 for i in range(25)], [128 + (40 if i % 2 else -40) for i in range(25)]]],
        "square": [[[70 + i * 5 for i in range(25)], [70 for _ in range(25)]],
                   [[195, 195], [70 + i * 5 for i in range(25)]],
                   [[195 - i * 5 for i in range(25)], [195, 195]],
                   [[70, 70], [195 - i * 5 for i in range(25)]]],
    }
    for name in list(canonical)[:classes]:
        rng = random.Random(abs(hash(name)) % 10_000)
        with (root / f"{name}.ndjson").open("w") as handle:
            for _ in range(per_class):
                drawing = [[[float(x) + rng.uniform(-6, 6) for x in stroke[0]],
                            [float(y) + rng.uniform(-6, 6) for y in stroke[1]]]
                           for stroke in canonical[name]]
                handle.write(json.dumps({"drawing": drawing, "recognized": True}) + "\n")


def selftest(args) -> int:
    global INSTALL_TFJS
    INSTALL_TFJS = False  # keep the smoke test offline and quick
    work = Path(args.workdir) / "selftest"
    if work.exists():
        shutil.rmtree(work)
    data = work / "data"
    _synthetic_dataset(data)
    args.dataset_glob = [str(data / "*.ndjson")]
    args.output_dir, args.cache_dir = str(work / "output"), str(work / "cache")
    args.samples_per_class, args.val_fraction = 60, 0.2
    args.batch_size, args.epochs_per_run = 16, 8
    args.mixed_precision, args.workers, args.export = False, 1, True
    args.classes_file = None

    by_class = discover_classes(args.dataset_glob)
    classes = resolve_class_order(by_class, None, True)
    manifest = build_cache(args, classes, by_class)
    train(args, manifest)
    metrics = evaluate_and_export(args, manifest)
    assert metrics["top1"] > 60.0, f"self test failed: top-1 {metrics['top1']}% is broken"
    assert (Path(args.output_dir) / f"{args.model_name}.keras").exists()
    assert len((Path(args.output_dir) / "classes.txt").read_text().split()) == len(classes)
    print("\nSELF TEST PASSED", flush=True)
    return 0


# --------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------
def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SketchAI 96x96 trainer for Kaggle")
    parser.add_argument("--dataset-glob", nargs="+", default=DATASET_GLOB)
    parser.add_argument("--classes-file", default=CLASSES_FILE,
                        help="label order to train in (pass the app's classes.txt to keep "
                             "public/model-345/classes.txt valid)")
    parser.add_argument("--allow-missing", action="store_true")
    parser.add_argument("--output-dir", default=OUTPUT_DIR)
    parser.add_argument("--cache-dir", default=CACHE_DIR)
    parser.add_argument("--model-name", default=MODEL_NAME)
    parser.add_argument("--stage", choices=["cache", "train", "export", "all"], default="all")
    parser.add_argument("--samples-per-class", type=int, default=SAMPLES_PER_CLASS)
    parser.add_argument("--val-fraction", type=float, default=VAL_FRACTION)
    parser.add_argument("--only-recognised", action="store_true",
                        help="drop drawings Quick, Draw! marked unrecognised")
    parser.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    parser.add_argument("--preview", type=int, default=0,
                        help="write N preview PNGs per class to eyeball the renderer")
    parser.add_argument("--epochs-per-run", type=int, default=EPOCHS_PER_RUN)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--lr", type=float, default=PEAK_LR)
    parser.add_argument("--base-filters", type=int, default=BASE_FILTERS)
    parser.add_argument("--dropout", type=float, default=0.3)
    parser.add_argument("--early-stop-patience", type=int, default=0)
    parser.add_argument("--resume-from", default=None)
    parser.add_argument("--mixed-precision", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--xla", action="store_true")
    parser.add_argument("--export", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--selftest", action="store_true")
    parser.add_argument("--workdir", default="/tmp/sketchai-kaggle")
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    if args.selftest:
        return selftest(args)

    import tensorflow as tf

    print(f"TensorFlow {tf.__version__} | {[d.name for d in tf.config.list_physical_devices()]}",
          flush=True)
    try:
        for device in tf.config.list_physical_devices("GPU"):
            tf.config.experimental.set_memory_growth(device, True)
    except Exception:  # noqa: BLE001 - never fatal
        pass

    by_class = discover_classes(args.dataset_glob)
    classes = resolve_class_order(by_class, args.classes_file, args.allow_missing)
    print(f"{len(classes)} classes, {sum(len(v) for v in by_class.values())} ndjson files", flush=True)

    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    if args.classes_file is None:  # always ship the order that was actually trained
        (output / "classes.txt").write_text("\n".join(classes) + "\n")

    manifest_path = Path(args.cache_dir) / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else None
    if args.stage in ("cache", "all"):
        manifest = build_cache(args, classes, by_class)
    if manifest is None:
        raise SystemExit(f"No cache at {manifest_path} - run --stage cache first")
    if args.stage in ("train", "all"):
        train(args, manifest)
    if args.stage in ("export", "all"):
        evaluate_and_export(args, manifest)
    return 0


if __name__ == "__main__":
    # Inside a Kaggle/IPython kernel sys.argv holds the kernel's own flags
    # (e.g. "-f /root/.../kernel.json"), which argparse would reject.
    try:
        get_ipython  # noqa: F821  (defined only inside IPython)
        _argv: Optional[Sequence[str]] = []
    except NameError:
        _argv = None
    raise SystemExit(main(_argv))
