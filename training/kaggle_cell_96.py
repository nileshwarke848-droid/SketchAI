"""SketchAI · 96×96×3 doodle classifier — paste this whole cell into Kaggle and Run.

What is different from the previous `modelX` script
---------------------------------------------------
1. The renderer is a port of the app's OWN preprocessing (src/ai/preprocess.js):
   ink bounding box → square of side max(w,h) × 1.186 → area average to 96×96 →
   lift the 97th percentile of ink to 1.0 → invert to black-on-white. The old
   script drew edge-to-edge at pen width 7 on a 256 canvas with no bbox crop and
   no contrast step; on our frozen 400-drawing bench that mismatch alone cost
   ~19 % top-1 (14.5 % → 4.3 %). Training now sees what the app will send.
2. Drawings are rasterised ONCE into a uint8 cache (~9 KB each), not re-rendered
   every epoch by a Python generator. That is what lets SAMPLES_PER_CLASS go from
   500 to 2000 without the GPU waiting on PIL.
3. Pen width, pen opacity and placement are randomised per drawing. The archive we
   measured was brittle: thinning its input moved top-1 from 7 % to 14.5 %,
   fattening it dropped to 2 %. Randomising kills that dependency.

Outputs in OUT: modelX96.keras (best), classes.txt, class_indices.json,
metadata.json, tfjs/ (GraphModel for the app), modelX96.zip, val_per_class.csv.
Rerun the cell to resume training for another EPOCHS (Kaggle's 12 h limit).
"""

import glob, hashlib, json, math, os, random, shutil, subprocess, sys, time, zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

# ============================== CONFIG - EDIT ME ==============================
NDJSON_GLOB = "/kaggle/input/**/*.ndjson"   # your stroke-vector .ndjson files
CLASSES_FILE = None        # e.g. "/kaggle/input/sketchai-app/classes.txt" to pin
                           # the label order to the app's existing classes.txt
SAMPLES_PER_CLASS = 2000   # 500 was the old value; ~9 KB/ drawing on disk
VAL_FRACTION = 0.05
EPOCHS = 20                # per run; rerun the cell to continue
BATCH = 256
PEAK_LR = 3e-3
BASE_FILTERS = 32
OUT = "/kaggle/working/output"
CACHE = "/kaggle/working/cache96"
NAME = "modelX96"
INSTALL_TFJS = True        # pip install tensorflowjs on first export (needs internet)
WORKERS = max(1, (os.cpu_count() or 2) - 1)
SEED = 2026
# ==============================================================================

SIZE = 96
CROP_PADDING = 1.186        # preprocess.js CROP_PADDING
INK_THRESHOLD = 10 / 255    # preprocess.js INK_ALPHA_THRESHOLD / 255
TARGET_INK_PEAK = 1.0       # preprocess.js profile for the 345 / 333 models
MIN_GAMMA = 0.25            # preprocess.js MIN_CONTRAST_GAMMA
CANVAS = (int(1200 * 0.8), int(720 * 0.8))   # app canvas 1200×720, rendered at 0.8
PEN = 7 * 0.8               # app default pen, same scale
SPAN = (0.35, 0.68)         # drawing bbox side as a fraction of canvas height
PEN_JITTER = (0.65, 1.45)
OPACITY_JITTER = (0.55, 1.0)


# ------------------------------- renderer -------------------------------------
def render_canvas(strokes, rng):
    """Quick, Draw! [xs, ys] vectors -> emulated app canvas (uint8 ink alpha)."""
    w, h = CANVAS
    canvas = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(canvas)
    xs, ys = [], []
    for s in strokes or []:
        if len(s) >= 2 and len(s[0]) and len(s[0]) == len(s[1]):
            xs.append(np.asarray(s[0], float)); ys.append(np.asarray(s[1], float))
    if not xs:
        return np.zeros((h, w), np.uint8)
    xs, ys = np.concatenate(xs), np.concatenate(ys)
    span = max(xs.max() - xs.min(), ys.max() - ys.min(), 1.0)
    scale = rng.uniform(*SPAN) * h / span
    pen = max(1, int(round(PEN * rng.uniform(*PEN_JITTER))))
    ink = int(round(255 * rng.uniform(*OPACITY_JITTER)))
    ox = w * rng.uniform(0.35, 0.65) - (xs.min() + xs.max()) / 2 * scale
    oy = h * rng.uniform(0.35, 0.65) - (ys.min() + ys.max()) / 2 * scale
    for s in strokes:
        if len(s) < 2:
            continue
        sx, sy = s[0], s[1]
        if len(sx) != len(sy) or len(sx) < 2:
            continue
        pts = [(x * scale + ox, y * scale + oy) for x, y in zip(sx, sy)]
        draw.line(pts, fill=ink, width=pen, joint="curve")
        r = pen / 2
        for x, y in (pts[0], pts[-1]):
            draw.ellipse((x - r, y - r, x + r, y + r), fill=ink)
    return np.asarray(canvas, np.uint8)


def app_preprocess(ink_alpha):
    """Port of src/ai/preprocess.js -> the app's model input (1.0 paper, 0.0 ink)."""
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
    crop = np.zeros((side_i, side_i), np.float32)          # outside canvas = no ink
    sx0, sy0 = max(0, left), max(0, top)
    sx1, sy1 = min(alpha.shape[1], left + side_i), min(alpha.shape[0], top + side_i)
    if sx1 > sx0 and sy1 > sy0:
        crop[sy0 - top:sy1 - top, sx0 - left:sx1 - left] = alpha[sy0:sy1, sx0:sx1]
    grid = np.asarray(Image.fromarray(crop).resize((SIZE, SIZE), Image.BOX), np.float32)
    flat = grid.ravel()
    k = min(flat.size - 1, int(0.97 * (flat.size - 1)))
    peak = float(np.partition(flat, k)[k])
    if 0.0 < peak < TARGET_INK_PEAK:
        gamma = min(1.0, max(MIN_GAMMA, math.log(TARGET_INK_PEAK) / math.log(peak)))
        if gamma < 1.0:
            grid = np.power(grid, gamma)
    return np.clip(1.0 - grid, 0.0, 1.0)


def record_to_uint8(record, rng):
    """One ndjson record -> uint8 (96, 96) black-on-white image, or None."""
    if isinstance(record, dict) and record.get("drawing"):
        sample = app_preprocess(render_canvas(record["drawing"], rng))
    else:  # not a stroke record (e.g. a 28x28 bitmap) - this script wants vectors
        sample = None
    return None if sample is None else np.rint(sample * 255.0).astype(np.uint8)


# ------------------------------- cache build ----------------------------------
def class_name_of(path):
    n = Path(path).name
    for suffix in (".gz", ".ndjson", ".json"):
        while n.lower().endswith(suffix):
            n = n[: -len(suffix)]
    return n


def build_one(job):
    import gzip

    idx, name, paths, limit, val_fraction, seed = job
    rng = np.random.default_rng(seed + idx)
    images = []
    for path in paths:
        opener = gzip.open if path.endswith(".gz") else open
        with opener(path, "rt", encoding="utf-8", errors="ignore") as fh:
            for line in fh:
                if len(images) >= limit:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                img = record_to_uint8(rec, rng)
                if img is not None:
                    images.append(img)
        if len(images) >= limit:
            break
    if not images:
        return {"index": idx, "name": name, "train": 0, "val": 0}
    arr = np.stack(images)
    order = rng.permutation(len(arr))
    n_val = max(1, int(round(len(arr) * val_fraction))) if len(arr) > 4 else 0
    cache = Path(CACHE)
    np.save(cache / f"{idx:03d}-train.npy", arr[order[n_val:]])
    np.save(cache / f"{idx:03d}-val.npy", arr[order[:n_val]])
    return {"index": idx, "name": name, "train": int(len(arr) - n_val), "val": int(n_val)}


def build_cache(classes, by_class):
    Path(CACHE).mkdir(parents=True, exist_ok=True)
    est = len(classes) * SAMPLES_PER_CLASS * SIZE * SIZE / 1e9
    print(f"Rendering ≤{SAMPLES_PER_CLASS}/class × {len(classes)} classes ≈ {est:.1f} GB", flush=True)
    jobs = [(i, c, by_class[c], SAMPLES_PER_CLASS, VAL_FRACTION, SEED) for i, c in enumerate(classes)]
    jobs = [j for j in jobs if not (Path(CACHE) / f"{j[0]:03d}-train.npy").exists()]
    if not jobs:
        print("Cache already complete", flush=True)
    elif WORKERS > 1:
        import multiprocessing as mp
        t0, done = time.time(), 0
        with mp.Pool(WORKERS) as pool:
            for res in pool.imap_unordered(build_one, jobs, chunksize=1):
                done += 1
                el = time.time() - t0
                if done % 10 == 0 or done == len(jobs):
                    print(f"  {done}/{len(jobs)} | {el/60:.1f} min elapsed, "
                          f"~{el/done*(len(jobs)-done)/60:.1f} min left | {res['name']}", flush=True)
    else:
        for i, job in enumerate(jobs, 1):
            res = build_one(job)
            if i % 10 == 0 or i == len(jobs):
                print(f"  {i}/{len(jobs)} | {res['name']}", flush=True)

    counts, kept = {}, []
    for idx, name in enumerate(classes):
        train_path = Path(CACHE) / f"{idx:03d}-train.npy"
        if not train_path.exists():          # nothing rendered for this class
            print(f"  ! {name}: no drawings, skipped", flush=True)
            continue
        tr = np.load(train_path, mmap_mode="r")
        va = np.load(Path(CACHE) / f"{idx:03d}-val.npy", mmap_mode="r")
        if tr.shape[0] == 0:
            print(f"  ! {name}: 0 train drawings, skipped", flush=True)
            continue
        counts[name] = {"index": idx, "name": name, "train": int(tr.shape[0]), "val": int(va.shape[0])}
        kept.append(name)
    classes = kept
    manifest = {"classes": classes, "counts": counts,
                "total_train": sum(c["train"] for c in counts.values()),
                "total_val": sum(c["val"] for c in counts.values())}
    (Path(CACHE) / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"Cache ready: {manifest['total_train']} train + {manifest['total_val']} val", flush=True)
    return manifest


# ------------------------------- tf.data + model -------------------------------
class Reader:
    def __init__(self, manifest, split):
        self.arrays, self.offsets, labels, run = [], [], [], 0
        for name in manifest["classes"]:
            path = Path(CACHE) / f"{manifest['counts'][name]['index']:03d}-{split}.npy"
            arr = np.load(path, mmap_mode="r")
            if arr.shape[0] == 0:
                continue
            self.arrays.append(arr); self.offsets.append(run)
            labels.append(np.full(arr.shape[0], manifest["counts"][name]["index"], np.int32))
            run += arr.shape[0]
        self.offsets_arr = np.asarray(self.offsets, np.int64)
        self.size = run
        self.y = np.concatenate(labels) if labels else np.zeros(0, np.int32)

    def load_batch(self, gids):
        gids = np.asarray(gids, np.int64).ravel()
        slots = np.searchsorted(self.offsets_arr, gids, side="right") - 1
        out = np.empty((gids.size, SIZE, SIZE), np.uint8)
        for slot in np.unique(slots):
            out[slots == slot] = self.arrays[slot][gids[slots == slot] - self.offsets[slot]]
        return out


def make_dataset(reader, batch, training, num_classes, tf):
    ds = tf.data.Dataset.from_tensor_slices(np.arange(reader.size, dtype=np.int64))
    if training:
        ds = ds.shuffle(min(reader.size, 60_000), seed=SEED, reshuffle_each_iteration=True)
    ds = ds.batch(batch, drop_remainder=training)

    def load(gids):
        img = tf.numpy_function(reader.load_batch, [gids], tf.uint8)
        img.set_shape([None, SIZE, SIZE])
        img = tf.image.grayscale_to_rgb(tf.expand_dims(tf.cast(img, tf.float32) / 255.0, -1))
        lab = tf.numpy_function(lambda g: reader.y[g], [gids], tf.int32)
        lab.set_shape([None])
        return img, tf.one_hot(lab, num_classes, dtype=tf.float32)

    ds = ds.map(load, num_parallel_calls=tf.data.AUTOTUNE, deterministic=False)
    if training:
        aug = tf.keras.Sequential([
            tf.keras.layers.RandomRotation(0.045, fill_mode="constant", fill_value=1.0),
            tf.keras.layers.RandomTranslation(0.05, 0.05, fill_mode="constant", fill_value=1.0),
            tf.keras.layers.RandomZoom(0.06, fill_mode="constant", fill_value=1.0),
        ])

        def jitter(x, y):
            # Keras augmentation layers follow the mixed_float16 policy; the contrast
            # step needs a fixed dtype so keep the batch in float32.
            x = tf.cast(aug(x, training=True), tf.float32)
            return 1.0 - (1.0 - x) * tf.random.uniform([], 0.85, 1.0), y

        ds = ds.map(jitter, num_parallel_calls=tf.data.AUTOTUNE, deterministic=False)
    return ds.prefetch(tf.data.AUTOTUNE)


def build_model(num_classes, tf):
    L = tf.keras.layers

    def norm(x):
        return L.BatchNormalization(momentum=0.9)(x)   # 0.99 keeps a fresh model at chance

    def block(x, f, reps):
        for _ in range(reps):
            x = L.Conv2D(f, 3, padding="same", use_bias=False)(x)
            x = norm(x)
            x = L.Activation("relu")(x)
        return L.MaxPooling2D()(x)

    i = L.Input((SIZE, SIZE, 3), name="sketch")
    x = block(i, BASE_FILTERS, 2)
    x = block(x, BASE_FILTERS * 2, 2)
    x = block(x, BASE_FILTERS * 4, 2)
    x = block(x, BASE_FILTERS * 8, 1)
    x = L.GlobalAveragePooling2D()(x)
    x = L.Dropout(0.3)(x)
    x = L.Dense(512, use_bias=False)(x)
    x = norm(x)
    x = L.Activation("relu")(x)
    x = L.Dropout(0.3)(x)
    out = L.Dense(num_classes, activation="softmax", dtype="float32", name="label")(x)
    return tf.keras.Model(i, out, name="sketchai-96")


# ----------------------------------- run --------------------------------------
def main():
    import tensorflow as tf

    tf.keras.utils.set_random_seed(SEED)
    tf.keras.mixed_precision.set_global_policy("mixed_float16")
    print(f"TF {tf.__version__} | {[d.name for d in tf.config.list_physical_devices()]}", flush=True)

    files = sorted({os.path.abspath(p) for p in glob.glob(NDJSON_GLOB, recursive=True)})
    if not files:
        raise SystemExit(f"No ndjson under {NDJSON_GLOB}")
    by_class = {}
    for path in files:
        by_class.setdefault(class_name_of(path), []).append(path)
    if CLASSES_FILE and Path(CLASSES_FILE).exists():
        order = [l.strip() for l in Path(CLASSES_FILE).read_text().splitlines() if l.strip()]
        missing = [c for c in order if c not in by_class]
        if missing:
            raise SystemExit(f"{len(missing)} classes have no data, e.g. {missing[:5]}")
        classes = [c for c in order if c in by_class]
    else:
        classes = sorted(by_class)
    print(f"{len(classes)} classes / {len(files)} files", flush=True)

    Path(OUT).mkdir(parents=True, exist_ok=True)
    manifest_path = Path(CACHE) / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        if manifest.get("classes") != classes:      # dataset or order changed -> rebuild
            manifest = build_cache(classes, by_class)
    else:
        manifest = build_cache(classes, by_class)

    num_classes, names = len(manifest["classes"]), manifest["classes"]
    train_reader, val_reader = Reader(manifest, "train"), Reader(manifest, "val")
    steps = max(1, train_reader.size // BATCH)

    out = Path(OUT)
    model_path, ckpt = out / f"{NAME}.keras", out / "checkpoints" / "best.keras"
    ckpt.parent.mkdir(parents=True, exist_ok=True)
    state_path = out / "training_state.json"
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    trained = int(state.get("total_epochs", 0))
    planned = trained + EPOCHS

    model = tf.keras.models.load_model(model_path, compile=False) if model_path.exists() \
        else build_model(num_classes, tf)
    print(f"{model.count_params():,} params | continuing after {trained} epochs", flush=True)

    schedule = tf.keras.optimizers.schedules.CosineDecay(
        PEAK_LR * (0.5 if trained else 1.0), max(1, planned * steps), alpha=0.02,
        warmup_target=PEAK_LR, warmup_steps=max(1, int(0.06 * planned * steps)))
    model.compile(
        optimizer=tf.keras.optimizers.AdamW(schedule, weight_decay=1e-4)
        if hasattr(tf.keras.optimizers, "AdamW") else tf.keras.optimizers.Adam(schedule),
        loss=tf.keras.losses.CategoricalCrossentropy(label_smoothing=0.1),
        metrics=[tf.keras.metrics.CategoricalAccuracy(name="accuracy"),
                 tf.keras.metrics.TopKCategoricalAccuracy(k=3, name="top3_accuracy")])

    model.fit(make_dataset(train_reader, BATCH, True, num_classes, tf),
              validation_data=make_dataset(val_reader, BATCH, False, num_classes, tf),
              initial_epoch=trained, epochs=planned, verbose=2,
              callbacks=[tf.keras.callbacks.ModelCheckpoint(
                             ckpt, monitor="val_accuracy", mode="max", save_best_only=True,
                             initial_value_threshold=state.get("best_val_accuracy"), verbose=1),
                         tf.keras.callbacks.CSVLogger(out / "history.csv", append=bool(state)),
                         tf.keras.callbacks.TerminateOnNaN()])
    model.save(model_path)
    hist = [float(v) for v in model.history.history.get("val_accuracy", [])]
    state.update({"total_epochs": planned, "runs": int(state.get("runs", 0)) + 1,
                  "best_val_accuracy": max([state.get("best_val_accuracy") or 0.0] + hist)})
    state_path.write_text(json.dumps(state, indent=2))

    # ---- evaluate the best checkpoint on the whole held-out split ----
    best = tf.keras.models.load_model(ckpt if ckpt.exists() else model_path, compile=False)
    hits = {1: 0, 3: 0, 5: 0}
    per_class = {}
    for start in range(0, val_reader.size, 256):
        gids = np.arange(start, min(start + 256, val_reader.size))
        x = np.repeat(val_reader.load_batch(gids)[..., None].astype(np.float32) / 255.0, 3, -1)
        top = np.argsort(-best.predict(x, verbose=0), axis=1)[:, :5]
        truth = val_reader.y[gids]
        match = top == truth[:, None]
        for k in hits:
            hits[k] += int(match[:, :k].any(axis=1).sum())
        for t, h in zip(truth, match[:, 0]):
            c = per_class.setdefault(int(t), [0, 0]); c[0] += 1; c[1] += int(h)
    n = max(1, val_reader.size)
    metrics = {f"top{k}": round(100 * v / n, 2) for k, v in hits.items()}
    print(f"Validation top-1 {metrics['top1']}% | top-3 {metrics['top3']}% | "
          f"top-5 {metrics['top5']}% on {val_reader.size} drawings", flush=True)
    with (out / "val_per_class.csv").open("w") as fh:
        fh.write("index,class,drawings,top1_accuracy\n")
        for idx in sorted(per_class):
            c = per_class[idx]
            fh.write(f"{idx},{names[idx]},{c[0]},{c[1]/c[0]:.3f}\n")

    # ---- export for the app ----
    if INSTALL_TFJS:
        try:
            import tensorflowjs  # noqa: F401
        except ImportError:
            print("Installing tensorflowjs...", flush=True)
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "tensorflowjs"], check=False)

    best_path = ckpt if ckpt.exists() else model_path
    final = out / f"{NAME}.keras"
    if best_path.resolve() != final.resolve():
        shutil.copy2(best_path, final)
    classes_txt = out / "classes.txt"
    classes_txt.write_text("\n".join(names) + "\n")
    (out / "class_indices.json").write_text(json.dumps({n_: i for i, n_ in enumerate(names)},
                                                       indent=2, ensure_ascii=False))
    shutil.rmtree(out / "saved_model", ignore_errors=True)
    tfjs_ok = False
    try:
        best.export(str(out / "saved_model"))
        shutil.rmtree(out / "tfjs", ignore_errors=True)
        subprocess.run([sys.executable, "-m", "tensorflowjs.converters.convert",
                        str(out / "saved_model"), str(out / "tfjs"),
                        "--input_format=tf_saved_model", "--saved_model_tags=serve"], check=True)
        tfjs_ok = True
    except Exception as error:  # noqa: BLE001
        print(f"  ! TF.js export failed: {error}\n    pip -q install tensorflowjs, then rerun",
              flush=True)

    metadata = {"model": NAME, "parameters": int(best.count_params()),
                "input": {"shape": [1, SIZE, SIZE, 3], "dtype": "float32",
                          "range": "0..1, paper 1.0, ink 0.0, grey replicated on RGB",
                          "pipeline": f"bbox crop {CROP_PADDING}, area average {SIZE}, "
                                      f"97th percentile of ink -> {TARGET_INK_PEAK}, inverted"},
                "classes": len(names), "validation": metrics,
                "val_drawings": int(val_reader.size),
                "classes_sha256": hashlib.sha256(classes_txt.read_bytes()).hexdigest()}
    (out / "metadata.json").write_text(json.dumps(metadata, indent=2))

    with zipfile.ZipFile(out / f"{NAME}.zip", "w", zipfile.ZIP_DEFLATED) as z:
        for p in (final, classes_txt, out / "class_indices.json", out / "metadata.json"):
            z.write(p, arcname=p.name)
        if tfjs_ok:
            for p in sorted((out / "tfjs").rglob("*")):
                if p.is_file():
                    z.write(p, arcname=str(Path("tfjs") / p.relative_to(out / "tfjs")))
    print(f"Done: {final.name}, {NAME}.zip, classes.txt ({len(names)} labels), "
          f"TF.js {'yes' if tfjs_ok else 'no'}", flush=True)


main()
