#!/usr/bin/env python3
"""Evaluate a supplied ModelX Keras archive on the frozen 400-drawing bench.

The supplied model's contract (confirmed by the model's author) is:

    input  : (1, 96, 96, 3) float32 RGB, values 0..1
    colour : white background ~1.0, black/dark strokes ~0.0

This script therefore feeds **black ink on a white field**, replicated over RGB,
and sweeps the preprocessing details that the archive does not document
(resampling kernel, polarity, value scaling, stroke weight). Everything else —
the 400 drawings, their labels, the 345-class reference predictions — is frozen
in ``training/evaluation-400-{manifest,results}.json``, so run-to-run numbers
are comparable across sessions.

Usage (from the repo root)::

    python training/evaluate_modelx.py \
        --model /path/to/modelX.keras \
        --class-indices /path/to/class_indices.json \
        --drawings /path/to/quickdraw/drawings \
        --out training/modelx-v2-evaluation-400

Requires TensorFlow (``pip install tensorflow-cpu``) and NumPy.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import pathlib
import sys

import numpy as np

K = (1, 3, 5, 10)


# --------------------------------------------------------------------------- data
def load_manifest(path: pathlib.Path) -> dict:
    return json.loads(path.read_text())


def load_drawings(manifest: dict, drawings: pathlib.Path) -> np.ndarray:
    """Rebuild the 400 x 28 x 28 Quick, Draw! bitmaps the manifest points at."""
    cache: dict[str, list] = {}
    images = []
    for record in manifest["records"]:
        label = record["label"]
        if label not in cache:
            with gzip.open(drawings / f"{label}.ndjson.gz", "rt") as handle:
                cache[label] = [json.loads(line) for line in handle]
        bitmap = np.asarray(cache[label][record["source_row"]], np.float32)
        images.append(bitmap.reshape(28, 28))
    return np.stack(images)[..., None]


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_labels(class_indices: pathlib.Path, n_classes: int) -> list[str]:
    index = json.loads(class_indices.read_text())
    if len(index) != n_classes or set(index.values()) != set(range(n_classes)):
        raise SystemExit(
            f"class index file is not a bijection onto 0..{n_classes - 1} "
            f"({len(index)} entries, {len(set(index.values()))} distinct indices)"
        )
    labels = [""] * n_classes
    for label, i in index.items():
        labels[i] = label
    return labels


# ------------------------------------------------------------------ preprocessing
def adjust_stroke(ink: np.ndarray, pixels: int) -> np.ndarray:
    """Reshape strokes by `pixels` before the polarity flip.

    Negative values thin the ink (grayscale erosion = min-pool), positive values
    thicken it (max-pool). The archive's exact training rasterisation is not
    documented, and stroke weight turned out to be the single largest lever on
    its accuracy, so both directions are measured instead of assumed.
    """
    import tensorflow as tf

    if pixels == 0:
        return ink
    tensor = tf.constant(ink, tf.float32)
    if pixels < 0:
        stacked = -tf.nn.max_pool2d(-tensor, -pixels, 1, "SAME")
    else:
        stacked = tf.nn.max_pool2d(tensor, pixels, 1, "SAME")
    return np.clip(stacked.numpy(), 0.0, 1.0)


def build_batch(bitmaps: np.ndarray, method: str, polarity: str, scale: str,
                stroke_px: int) -> np.ndarray:
    import tensorflow as tf

    resized = tf.image.resize(
        tf.constant(bitmaps), [96, 96], method=method,
        antialias=(method != "nearest"),
    ).numpy()
    resized = np.clip(resized, 0.0, 1.0)          # bicubic overshoot is not ink
    ink = adjust_stroke(resized, stroke_px)
    grey = ink if polarity == "ink-on-black" else 1.0 - ink
    if scale == "0..255":
        grey = grey * 255.0
    elif scale == "-1..1":
        grey = grey * 2.0 - 1.0
    return np.repeat(grey, 3, axis=-1).astype(np.float32)


# ---------------------------------------------------------------------- scoring
def score(model, batch: np.ndarray, manifest: dict, labels: list[str]) -> dict:
    probs = model.predict(batch, batch_size=64, verbose=0)
    counts = {k: 0 for k in K}
    ranks, names = [], []
    for i, record in enumerate(manifest["records"]):
        order = np.argsort(probs[i])[::-1]
        rank = next(
            (position + 1 for position, index in enumerate(order)
             if labels[index] == record["label"]),
            10 ** 6,
        )
        ranks.append(rank)
        names.append(labels[order[0]])
        for k in counts:
            if rank <= k:
                counts[k] += 1
    return {
        "counts": counts,
        "top1": [names[j] for j in range(len(names))],
        "ranks": ranks,
        "mean_confidence": float(probs.max(axis=1).mean()),
        # how often the ten drawings of a class share the same top-1 label:
        # a permutation of the class index would make this high while accuracy
        # stayed at chance, so it separates "mis-mapped labels" from "weak model"
        "within_class_agreement": within_class_agreement(names, manifest),
    }


def within_class_agreement(names: list[str], manifest: dict) -> float:
    by_label: dict[str, list[str]] = {}
    for name, record in zip(names, manifest["records"]):
        by_label.setdefault(record["label"], []).append(name)
    return float(np.mean([max(v.count(n) for n in set(v)) / len(v)
                          for v in by_label.values()]))


def wilson(successes: int, total: int, z: float = 1.96) -> tuple[float, float]:
    p = successes / total
    denominator = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denominator
    margin = z * math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator
    return round(100 * (centre - margin), 1), round(100 * (centre + margin), 1)


def paired_bootstrap(ranks: np.ndarray, manifest: dict, reference: dict,
                     k: int, draws: int = 10_000, seed: int = 20261118) -> dict:
    """Cluster bootstrap (resampling drawings' classes) of the top-k delta
    against the project's 345-class model on the identical 400 drawings."""
    deltas: dict[str, int] = {}
    for record, rank in zip(manifest["records"], ranks):
        hit = int(rank <= k)
        reference_hit = int(reference[(record["label"], record["source_row"])] <= k)
        deltas[record["label"]] = deltas.get(record["label"], 0) + hit - reference_hit
    classes = sorted(deltas)
    rng = np.random.default_rng(seed + k)
    samples = rng.integers(0, len(classes), size=(draws, len(classes)))
    boot = np.array([sum(deltas[classes[i]] for i in row) for row in samples]) / len(manifest["records"])
    return {
        "delta_top%d_pp" % k: round(100 * sum(deltas.values()) / len(manifest["records"]), 2),
        "ci95_pp": [round(100 * float(np.quantile(boot, 0.025)), 2),
                    round(100 * float(np.quantile(boot, 0.975)), 2)],
    }


# ------------------------------------------------------------------------- main
def main(argv: list[str] | None = None) -> int:
    root = pathlib.Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True)
    parser.add_argument("--class-indices", required=True)
    parser.add_argument("--drawings", required=True)
    parser.add_argument("--manifest", default=str(root / "training/evaluation-400-manifest.json"))
    parser.add_argument("--reference", default=str(root / "training/evaluation-400-results.json"))
    parser.add_argument("--out", default=str(root / "training/modelx-v2-evaluation-400"))
    parser.add_argument(
        "--alt-class-indices", default=None,
        help="a second label ordering (e.g. the previous archive's map) scored with the "
             "same predictions; a large gap proves which ordering the weights use",
    )
    parser.add_argument(
        "--app-thin", type=int, default=3,
        help="also score the app-pipeline dumps with their ink thinned by N px "
             "(the direct-resize runs show the archive prefers crisp thin strokes)",
    )
    parser.add_argument(
        "--app-inputs", nargs="*", default=[],
        help="extra (400, 96, 96, 3) float32 dumps produced by the app's own canvas "
             "pipeline, named tag=path; scored and appended to the report",
    )
    args = parser.parse_args(argv)

    import tensorflow as tf

    manifest = load_manifest(pathlib.Path(args.manifest))
    bitmaps = load_drawings(manifest, pathlib.Path(args.drawings))
    model = tf.keras.models.load_model(args.model, compile=False)
    n_classes = int(model.output_shape[-1])
    labels = load_labels(pathlib.Path(args.class_indices), n_classes)

    report = {
        "model": {
            "path": args.model,
            "sha256": sha256(pathlib.Path(args.model)),
            "input_shape": [None if d is None else int(d) for d in model.input_shape],
            "output_shape": [None if d is None else int(d) for d in model.output_shape],
            "parameters": int(model.count_params()),
        },
        "contract": {
            "shape": "(1, 96, 96, 3) float32 RGB",
            "values": "0..1, white background ~1.0, black strokes ~0.0",
            "source": "stated by the model owner",
        },
        "class_indices_sha256": sha256(pathlib.Path(args.class_indices)),
        "bench": {
            "drawings": len(manifest["records"]),
            "classes": len({r["label"] for r in manifest["records"]}),
            "all_bench_classes_in_model_map": all(
                r["label"] in {lab for lab in labels if lab} for r in manifest["records"]
            ),
            "class_map_entries": n_classes,
        },
        "runs": [],
    }
    if report["model"]["input_shape"] != [None, 96, 96, 3]:
        raise SystemExit(f"unexpected input shape {model.input_shape}; contract check failed")

    reference_ranks = {}
    reference = json.loads(pathlib.Path(args.reference).read_text())
    for case in reference["cases"]:
        reference_ranks[(case["label"], case["sourceRow"])] = case["345"]["rank"] or 10 ** 6

    # Contract sweeps first (kernel x polarity), then the undocumented details
    # one at a time on the winning kernel.
    grid = [(method, "black-on-white", "0..1", 0) for method in
            ("bilinear", "area", "bicubic", "nearest")]
    grid += [
        ("bilinear", "ink-on-black", "0..1", 0),
        ("bilinear", "black-on-white", "0..255", 0),
        ("bilinear", "black-on-white", "-1..1", 0),
        ("bilinear", "black-on-white", "0..1", -3),
        ("bilinear", "black-on-white", "0..1", -5),
        ("bilinear", "black-on-white", "0..1", 3),
        ("area", "black-on-white", "0..1", -3),
    ]
    for method, polarity, scale, stroke_px in grid:
        batch = build_batch(bitmaps, method, polarity, scale, stroke_px)
        scores = score(model, batch, manifest, labels)
        run = {
            "resize": method,
            "polarity": polarity,
            "scale": scale,
            "stroke_px": stroke_px,
            "top_k": scores["counts"],
            "top_k_pct": {str(k): round(100 * scores["counts"][k] / len(manifest["records"]), 2)
                          for k in K},
            "wilson95_pct": {str(k): wilson(scores["counts"][k], len(manifest["records"])) for k in K},
            "mean_confidence": round(scores["mean_confidence"], 3),
            "within_class_agreement": round(scores["within_class_agreement"], 3),
        }
        newest = max(report["runs"], key=lambda r: r["top_k"][1]) if report["runs"] else None
        if newest is None or scores["counts"][1] >= newest["top_k"][1]:
            run["paired_vs_project_345"] = [
                paired_bootstrap(np.asarray(scores["ranks"]), manifest, reference_ranks, k)
                for k in K
            ]
        report["runs"].append(run)
        print(f"{method:8s} {polarity:14s} {scale:6s} stroke={stroke_px:+d} "
              f"top1/3/5/10={scores['counts']}", flush=True)

    best = max(report["runs"], key=lambda r: (r["top_k"][1], r["top_k"][10]))
    report["best"] = {key: best[key] for key in
                      ("resize", "polarity", "scale", "stroke_px", "top_k", "top_k_pct")}
    report["reference_345"] = {
        "top_k": reference["summary"]["counts"]["345"],
        "source": "training/evaluation-400-results.json",
    }

    if args.alt_class_indices:
        # Same predictions, two label orderings: a big gap means the weights were
        # trained against exactly one of them.
        alt_labels = load_labels(pathlib.Path(args.alt_class_indices), n_classes)
        probe = build_batch(bitmaps, best["resize"], best["polarity"], best["scale"],
                            best["stroke_px"])
        report["class_map_alignment"] = []
        for tag, label_set in (("primary-class-indices", labels),
                               ("alternate-class-indices", alt_labels)):
            scores = score(model, probe, manifest, label_set)
            report["class_map_alignment"].append({
                "labels": tag,
                "probe": "best bitmap proxy "
                         f"({best['resize']}, {best['polarity']}, {best['scale']}, "
                         f"stroke {best['stroke_px']:+d} px)",
                "top_k": scores["counts"],
                "top_k_pct": {str(k): round(100 * scores["counts"][k] / len(manifest["records"]), 2)
                              for k in K},
            })
            print(f"labels {tag:26s} top1/3/5/10={scores['counts']}", flush=True)

    report["app_pipeline"] = []
    for spec in args.app_inputs:
        tag, _, path = spec.partition("=")
        batch = np.fromfile(path, dtype=np.float32).reshape(-1, 96, 96, 3)
        if batch.shape[0] != len(manifest["records"]):
            raise SystemExit(f"{path}: expected {len(manifest['records'])} drawings, got {batch.shape[0]}")
        scores = score(model, batch, manifest, labels)
        report["app_pipeline"].append({
            "tag": tag,
            "top_k": scores["counts"],
            "top_k_pct": {str(k): round(100 * scores["counts"][k] / len(manifest["records"]), 2)
                          for k in K},
            "wilson95_pct": {str(k): wilson(scores["counts"][k], len(manifest["records"])) for k in K},
            "mean_confidence": round(scores["mean_confidence"], 3),
            "within_class_agreement": round(scores["within_class_agreement"], 3),
        })
        print(f"app {tag:34s} top1/3/5/10={scores['counts']}", flush=True)
        if args.app_thin:
            ink = 1.0 - batch[..., :1]
            thinned = 1.0 - adjust_stroke(ink, -args.app_thin)
            thinned = np.repeat(thinned, 3, axis=-1).astype(np.float32)
            thin_scores = score(model, thinned, manifest, labels)
            report["app_pipeline"].append({
                "tag": f"{tag}+ink-thinned-{args.app_thin}px",
                "top_k": thin_scores["counts"],
                "top_k_pct": {str(k): round(100 * thin_scores["counts"][k] / len(manifest["records"]), 2)
                              for k in K},
                "wilson95_pct": {str(k): wilson(thin_scores["counts"][k], len(manifest["records"])) for k in K},
                "mean_confidence": round(thin_scores["mean_confidence"], 3),
                "within_class_agreement": round(thin_scores["within_class_agreement"], 3),
            })
            print(f"app {tag}+thin{args.app_thin} top1/3/5/10={thin_scores['counts']}", flush=True)

    out = pathlib.Path(args.out)
    out.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"\nbest: {report['best']}")
    print(f"wrote {out.with_suffix('.json')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
