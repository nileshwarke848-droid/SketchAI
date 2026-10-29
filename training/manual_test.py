"""Manual smoke test for the SketchAI 345-class model using real doodles.

The tool draws sixteen hand-made doodles (dog, fish, house, bus, shoe, guitar,
elephant, lion, train, cat, flower, sun, car, airplane, tree, umbrella) with the
same geometry the browser uses, feeds them to the trained network and prints the
top ten guesses for each one.

Two entry points read the same `doodles.json`, so what you see here is what the
browser-side checker (`node scripts/manual-test-345.mjs`) sees:

    python training/manual_test.py                     # uses training/work/run/best.h5
    python training/manual_test.py --model path/to.h5 # or any saved Keras model
    python training/manual_test.py --thickness 12      # a fatter, felt-tip pen
    python training/manual_test.py --png doodles.png   # also save a contact sheet

Nothing here is random and nothing is hard-coded: every number printed comes from
the network's own softmax output.

Important: run this after a real training run. On a model trained on synthetic
offline shapes it will print nonsense (or, with the mock model used to test the
plumbing, near-uniform guesses) — that is the honest answer, not a bug.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
DOODLES = HERE / "doodles.json"

# These mirror src/ai/preprocess.js profile "345" — keep them in sync.
INPUT_SIZE = 28
CROP_PADDING = 1.186
TARGET_INK_PEAK = 1.0
MIN_GAMMA = 0.25
INK_ALPHA_THRESHOLD = 10
MIN_INK_PIXELS = 240
MIN_INK_SPAN = 16

DEFAULT_CLASSES = Path("src/data/quickdraw-categories.txt")


# --------------------------------------------------------------------------------------
# Drawing: turn polylines into an alpha canvas (ink = alpha), like a browser stroke
# --------------------------------------------------------------------------------------


def render_doodle(strokes, canvas=320, span=300.0, line_width=7.0):
    """Rasterise normalised polylines onto a square alpha canvas.

    Coverage is `clip(half_width + 0.5 - distance_to_segment, 0, 1)`, which is the
    same thin-stroke antialiasing a canvas `stroke()` produces. The values written
    are 0..255 alpha, exactly what `readSketchAlpha()` reads in the browser.
    """
    alpha = np.zeros((canvas, canvas), dtype=np.float32)
    centre = canvas / 2.0
    radius = line_width / 2.0
    grid = np.arange(canvas, dtype=np.float32)
    xx, yy = np.meshgrid(grid, grid, indexing="xy")
    for stroke in strokes:
        pts = [(centre + x * span, centre + y * span) for x, y in stroke]
        segments = list(zip(pts, pts[1:])) if len(pts) > 1 else []
        if len(pts) == 1:  # a single tap
            segments = [(pts[0], pts[0])]
        for (x0, y0), (x1, y1) in segments:
            dx, dy = x1 - x0, y1 - y0
            length_sq = dx * dx + dy * dy
            if length_sq == 0:
                dist = np.hypot(xx - x0, yy - y0)
            else:
                t = np.clip(((xx - x0) * dx + (yy - y0) * dy) / length_sq, 0.0, 1.0)
                dist = np.hypot(xx - (x0 + t * dx), yy - (y0 + t * dy))
            coverage = np.clip(radius + 0.5 - dist, 0.0, 1.0)
            np.maximum(alpha, coverage * 255.0, out=alpha)
    return alpha.astype(np.float32)


# --------------------------------------------------------------------------------------
# Preprocessing: a faithful Python port of preprocessSketch() with profile "345"
# --------------------------------------------------------------------------------------


def find_ink_bounds(alpha, threshold=INK_ALPHA_THRESHOLD):
    mask = alpha > threshold
    if not mask.any():
        return None
    ys, xs = np.nonzero(mask)
    return {
        "x": int(xs.min()),
        "y": int(ys.min()),
        "width": int(xs.max() - xs.min() + 1),
        "height": int(ys.max() - ys.min() + 1),
        "inkPixels": int(mask.sum()),
    }


def rasterize_ink(alpha, square, size=INPUT_SIZE):
    """Area-average the crop into size x size cells of 0..1 ink intensity."""
    side = square["side"]
    step = side / size
    ink = np.zeros((size, size), dtype=np.float32)
    height, width = alpha.shape
    for oy in range(size):
        top = square["y"] + oy * step
        bottom = top + step
        y0 = max(0, int(math.floor(top)))
        y1 = min(height, int(math.ceil(bottom)))
        if y1 <= y0:
            continue
        for ox in range(size):
            left = square["x"] + ox * step
            right = left + step
            x0 = max(0, int(math.floor(left)))
            x1 = min(width, int(math.ceil(right)))
            if x1 <= x0:
                continue
            # Zero ink outside the canvas, exactly like the JS version: the sum is
            # divided by the full cell area, not by the number of in-bounds pixels.
            total = float(alpha[y0:y1, x0:x1].sum())
            ink[oy, ox] = min(1.0, total / (step * step) / 255.0)
    return ink


def normalise_ink_peak(ink, target=TARGET_INK_PEAK, min_gamma=MIN_GAMMA):
    peak = float(np.sort(ink, axis=None)[min(ink.size - 1, int(0.97 * (ink.size - 1)))])
    if peak <= 0 or peak >= target:
        return ink, 1.0, peak
    gamma = min(1.0, max(min_gamma, math.log(target) / math.log(peak)))
    return np.power(ink, gamma).astype(np.float32), gamma, peak


def preprocess(alpha):
    """Canvas alpha -> (28,28,1) float32 input, or (None, reason)."""
    bounds = find_ink_bounds(alpha)
    if bounds is None:
        return None, "blank", {}
    if bounds["inkPixels"] < MIN_INK_PIXELS or max(bounds["width"], bounds["height"]) < MIN_INK_SPAN:
        return None, "tiny", {"bounds": bounds}
    side = max(bounds["width"], bounds["height"]) * CROP_PADDING
    square = {
        "x": bounds["x"] + bounds["width"] / 2 - side / 2,
        "y": bounds["y"] + bounds["height"] / 2 - side / 2,
        "side": side,
    }
    raw = rasterize_ink(alpha, square)
    ink, gamma, peak = normalise_ink_peak(raw)
    return ink.reshape(INPUT_SIZE, INPUT_SIZE, 1), "ok", {"bounds": bounds, "gamma": gamma, "peak": peak}


# --------------------------------------------------------------------------------------
# Prediction
# --------------------------------------------------------------------------------------


def load_labels(path: Path):
    labels = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return labels


def run(model_path: Path, classes_path: Path, thickness: float, png: Path | None, top_k: int = 10):
    import os

    os.environ.setdefault("TF_USE_LEGACY_KERAS", "1")
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
    import tensorflow as tf

    model = tf.keras.models.load_model(str(model_path), compile=False)
    labels = load_labels(classes_path)
    output_units = int(model.output_shape[-1])
    if output_units != len(labels):
        raise SystemExit(
            f"The model predicts {output_units} classes but {classes_path} has {len(labels)} labels."
        )

    payload = json.loads(DOODLES.read_text(encoding="utf-8"))
    span = float(payload.get("span", 300))
    line_width = float(payload.get("lineWidth", 7)) * (thickness / 7.0)

    rows = []
    correct_top1 = 0
    correct_top3 = 0
    correct_top10 = 0
    for name, strokes in payload["doodles"].items():
        alpha = render_doodle(strokes, span=span, line_width=line_width)
        ink, status, diagnostics = preprocess(alpha)
        if ink is None:
            rows.append((name, status, [], diagnostics))
            continue
        scores = model.predict(ink[None, ...], verbose=0)[0]
        order = np.argsort(scores)[::-1][:top_k]
        guesses = [(labels[i], float(scores[i])) for i in order]
        expected = name
        if guesses and guesses[0][0] == expected:
            correct_top1 += 1
        if expected in [g[0] for g in guesses[:3]]:
            correct_top3 += 1
        if expected in [g[0] for g in guesses]:
            correct_top10 += 1
        rows.append((name, status, guesses, diagnostics))

    print(f"\nManual doodle test · model {model_path} · pen {line_width:.1f}px (28x28 frame scaling)\n")
    for name, status, guesses, diagnostics in rows:
        if status != "ok":
            print(f"{name:>10s}: skipped ({status})")
            continue
        detail = " | ".join(f"{label} {score * 100:5.1f}%" for label, score in guesses)
        marker = "OK " if guesses and guesses[0][0] == name else "   "
        print(f"{marker}{name:>10s}: {detail}")

    total = len(payload["doodles"])
    print(
        f"\ntop-1 {correct_top1}/{total} · top-3 {correct_top3}/{total} · top-10 {correct_top10}/{total}"
    )
    print(
        "Remember: these are sixteen quick hand-drawn doodles, not the test split. "
        "A miss here is not proof of a broken model — look at the confidence and the "
        "runner-up guesses before drawing conclusions."
    )

    if png:
        save_contact_sheet(rows, png)
        print(f"Contact sheet: {png}")
    return rows


def save_contact_sheet(rows, path: Path, cell: int = 96):
    """Optional: a PNG grid of the sixteen 28x28 inputs, upscaled for inspection."""
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception as error:  # pragma: no cover - matplotlib is optional
        print(f"matplotlib unavailable, skipping the contact sheet: {error}")
        return

    payload = json.loads(DOODLES.read_text(encoding="utf-8"))
    figure, axes = plt.subplots(4, 4, figsize=(7, 7.5))
    for axis, (name, _strokes) in zip(axes.ravel(), payload["doodles"].items()):
        alpha = render_doodle(_strokes)
        ink, _, _ = preprocess(alpha)
        if ink is None:
            axis.set_axis_off()
            continue
        axis.imshow(ink[:, :, 0], cmap="gray", vmin=0, vmax=1)
        axis.set_title(name, fontsize=8)
        axis.axis("off")
    figure.tight_layout()
    figure.savefig(path, dpi=130)
    plt.close(figure)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run sixteen real doodles through the 345-class model.")
    parser.add_argument("--model", type=Path, default=HERE / "work" / "run" / "best.h5",
                        help="saved Keras model (best.h5 from the training run)")
    parser.add_argument("--classes", type=Path, default=DEFAULT_CLASSES,
                        help="label file; must match the model's output order")
    parser.add_argument("--thickness", type=float, default=7.0,
                        help="pen width in the 300px doodle box (default 7, the app's brush)")
    parser.add_argument("--png", type=Path, default=None, help="optional contact sheet PNG")
    args = parser.parse_args()

    model_path = args.model if args.model.is_absolute() else (Path.cwd() / args.model)
    classes_path = args.classes if args.classes.is_absolute() else (Path.cwd() / args.classes)
    if not model_path.exists():
        raise SystemExit(
            f"No trained model at {model_path}.\n"
            "Run `python training/train_345.py --quick-test` first, or point --model at your Colab download."
        )
    run(model_path, classes_path, args.thickness, args.png)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
