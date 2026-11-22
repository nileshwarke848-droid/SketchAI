#!/usr/bin/env python3
"""Measure test-time augmentation (TTA) on the 345-class model.

The model is small and cheap, so the browser can afford more than one forward
pass per guess. This script asks the only question that matters: if we average
the softmax over a few harmless views of the same 28x28 drawing — nudged one
pixel left/right/up/down, and slightly zoomed in/out — does the ranking get
better on the 3,450 held-out drawings that were never trained on?

Nothing is trained here and no weights change, so the comparison is a fair A/B on
identical data: single pass versus the averaged views, scored with the same
paired bootstrap + McNemar test the refinement experiment uses.

Usage::

    python training/tta_eval_345.py \
        --weights training/work/continue/start.keras \
        --out training/work/continue/tta.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import train_345 as T  # noqa: E402
import refine_model_345 as R  # noqa: E402


def zoom_image(image: np.ndarray, factor: float) -> np.ndarray:
    """Scale a 28x28 float image about its centre, keeping the frame."""
    from scipy.ndimage import zoom as nd_zoom

    scaled = nd_zoom(image, factor, order=1)
    out = np.zeros_like(image)
    if scaled.shape[0] >= image.shape[0]:
        start = (scaled.shape[0] - image.shape[0]) // 2
        out = scaled[start:start + image.shape[0], start:start + image.shape[1]]
    else:
        start = (image.shape[0] - scaled.shape[0]) // 2
        out[start:start + scaled.shape[0], start:start + scaled.shape[1]] = scaled
    return np.clip(out, 0.0, 1.0)


def images_for(bundle: T.DatasetBundle, pairs: np.ndarray) -> np.ndarray:
    out = np.zeros((len(pairs), 28, 28, 1), np.float32)
    for i, (label, row) in enumerate(pairs):
        out[i, :, :, 0] = bundle.cache[int(label)][int(row)].astype(np.float32).reshape(28, 28) / 255.0
    return out


def softmax_probs(model, batch: np.ndarray, chunk: int = 512) -> np.ndarray:
    probs = []
    for start in range(0, len(batch), chunk):
        probs.append(model.predict(batch[start:start + chunk], verbose=0))
    return np.concatenate(probs) if probs else np.zeros((0, model.output_shape[-1]), np.float32)


def true_label_rank(probs: np.ndarray, labels: np.ndarray) -> np.ndarray:
    """1-based rank of the true label, which is what paired_significance() expects."""
    truth = probs[np.arange(len(labels)), labels][:, None]
    return (probs > truth).sum(axis=1).astype(np.int32) + 1


def topk_hits(probs: np.ndarray, labels: np.ndarray) -> dict:
    order = np.argsort(-probs, axis=1)
    top1 = (order[:, 0] == labels)
    top3 = (order[:, :3] == labels[:, None]).any(axis=1)
    top10 = (order[:, :10] == labels[:, None]).any(axis=1)
    return {
        "n": int(len(labels)),
        "top1": round(float(top1.mean() * 100), 2),
        "top3": round(float(top3.mean() * 100), 2),
        "top10": round(float(top10.mean() * 100), 2),
        "hits": top1.astype(np.int8),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--weights", default=str(HERE / "work" / "continue" / "start.keras"))
    parser.add_argument("--out", default=str(HERE / "work" / "continue" / "tta.json"))
    parser.add_argument("--zoom", type=float, default=0.08)
    parser.add_argument("--cache-dir", default=None)
    args = parser.parse_args(argv)

    import tensorflow as tf

    categories = T.fetch_categories()
    cfg = T.Config()
    if args.cache_dir:
        cfg.cache_dir = Path(args.cache_dir)
    bundle = T.build_splits(categories, cfg)
    pairs = bundle.test.indices
    labels = pairs[:, 0].astype(np.int64)

    model = R.load_checkpoint(Path(args.weights), len(categories), cfg)
    model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])

    images = images_for(bundle, pairs)
    print(f"test drawings: {len(images)}")

    single = topk_hits(softmax_probs(model, images), labels)
    print(f"single pass : top-1 {single['top1']:.2f}%  top-3 {single['top3']:.2f}%  top-10 {single['top10']:.2f}%")

    averaged = None
    per_view = []
    for name, transform in (
        ("identity", lambda img: img),
        ("shift-x+1", lambda img: np.roll(img, 1, axis=1)),
        ("shift-x-1", lambda img: np.roll(img, -1, axis=1)),
        ("shift-y+1", lambda img: np.roll(img, 1, axis=0)),
        ("shift-y-1", lambda img: np.roll(img, -1, axis=0)),
        ("zoom-in", lambda img: zoom_image(img, 1.0 + args.zoom)),
        ("zoom-out", lambda img: zoom_image(img, 1.0 - args.zoom)),
    ):
        view = np.stack([transform(image[:, :, 0])[:, :, None] for image in images]).astype(np.float32)
        probs = softmax_probs(model, view)
        per_view.append({"view": name, **{k: v for k, v in topk_hits(probs, labels).items() if k != "hits"}})
        averaged = probs if averaged is None else averaged + probs

    averaged /= len(per_view)
    ensemble = topk_hits(averaged, labels)
    print(f"7-view TTA  : top-1 {ensemble['top1']:.2f}%  top-3 {ensemble['top3']:.2f}%  top-10 {ensemble['top10']:.2f}%")

    single_probs = softmax_probs(model, images)
    significance = R.paired_significance(
        true_label_rank(averaged, labels), true_label_rank(single_probs, labels),
        labels, seed=11,
    )
    print(f"delta top-1 {significance['delta_top1_pp']:+.2f} pp "
          f"(95% CI {significance['delta_top1_ci95_pp']}), "
          f"McNemar p={significance['mcnemar']['p_two_sided']:.1e}")

    report = {
        "weights": str(args.weights),
        "zoom": args.zoom,
        "views": [v["view"] for v in per_view],
        "single": {k: v for k, v in single.items() if k != "hits"},
        "per_view": per_view,
        "tta": {k: v for k, v in ensemble.items() if k != "hits"},
        "significance": significance,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    np.save(out.with_suffix(".ranks.npy"), np.argsort(-averaged, axis=1))
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
