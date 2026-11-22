#!/usr/bin/env python3
"""Load the shipped TensorFlow.js model back into Keras so training can continue.

The production weights live only as `public/model-345/model.json` plus
`group1-shard1of1.bin`. Keras cannot read that format, and re-training from the
older `training/backup/best.keras` would throw away the refinement stages that
took the model from 37.7 % to 40.1 % top-1.

So this script rebuilds the architecture with `train_345.build_model` (same layer
names, same order, same shapes) and copies every tensor out of the TF.js weight
buffer into it. `model.json` lists the weights by layer path — `conv2d/kernel`,
`batch_normalization/gamma`, `predictions/bias` — which is exactly what
`model.get_layer(name)` expects, so the mapping is by name, not by position.

The result is verified two ways:

1. every shape is checked against the Keras variable before assignment;
2. the converted model is scored on the same 3,450 held-out drawings the shipped
   model was scored on. It must reproduce the published 40.09 / 59.25 / 77.62
   top-1/3/10 numbers, otherwise the conversion is wrong and the script fails.

Usage::

    python training/import_tfjs_345.py \
        --model public/model-345/model.json \
        --out training/work/continue/start.keras

    python training/refine_model_345.py \
        --checkpoint training/work/continue/start.keras \
        --out training/work/continue/run
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import train_345 as T  # noqa: E402

# The published scores of the shipped model on the 3,450-drawing test split.
PUBLISHED = {"top1": 40.09, "top3": 59.25, "top10": 77.62}


def read_tfjs_weights(model_json: Path) -> tuple[dict, dict[str, np.ndarray]]:
    """Return (manifest, {weight_name: array}) for a tfjs-layers model."""
    manifest = json.loads(model_json.read_text())
    groups = manifest.get("weightsManifest") or []
    if not groups:
        raise SystemExit(f"{model_json} has no weightsManifest")

    buffers: list[np.ndarray] = []
    for group in groups:
        for shard in group["paths"]:
            buffers.append(np.fromfile(model_json.parent / shard, dtype="<f4"))
    flat = np.concatenate(buffers) if len(buffers) > 1 else buffers[0]

    weights: dict[str, np.ndarray] = {}
    offset = 0
    for group in groups:
        for spec in group["weights"]:
            shape = tuple(spec["shape"])
            size = int(np.prod(shape))
            weights[spec["name"]] = flat[offset:offset + size].reshape(shape)
            offset += size
    if offset != flat.size:
        raise SystemExit(f"weight buffer mismatch: read {offset} of {flat.size} floats")
    return manifest, weights


def split_layer_name(weight_name: str) -> tuple[str, str]:
    """`sketchai_345/conv2d/kernel` -> (`conv2d`, `kernel`)."""
    parts = [part for part in weight_name.split("/") if part]
    if len(parts) < 2:
        raise SystemExit(f"cannot parse weight name {weight_name!r}")
    return parts[-2], parts[-1]


def build_from_manifest(manifest: dict, weights: dict[str, np.ndarray], num_classes: int, cfg: T.Config):
    import tensorflow as tf

    model = T.build_model(num_classes, cfg)
    config_layers = manifest["modelTopology"]["model_config"]["config"]["layers"]
    expected = [layer["class_name"] for layer in config_layers if layer["class_name"] not in {"InputLayer"}]
    actual = [layer.__class__.__name__ for layer in model.layers if layer.__class__.__name__ not in {"InputLayer"}]
    if expected != actual:
        raise SystemExit("architecture drift:\n  tfjs:  " + ", ".join(expected) + "\n  keras: " + ", ".join(actual))

    # The TF.js manifest is not guaranteed to be grouped per layer, so collect
    # tensors by layer and assign each layer once, in its declared weight order.
    by_layer: dict[str, dict[str, np.ndarray]] = {}
    for name, array in weights.items():
        layer_name, slot = split_layer_name(name)
        by_layer.setdefault(layer_name, {})[slot] = array

    for layer in model.layers:
        tensors = by_layer.get(layer.name)
        if not tensors:
            continue
        values = []
        for variable in layer.weights:
            slot = variable.name.split("/")[-1].split(":")[0]
            key = {"moving_variance": "moving_variance"}.get(slot, slot)
            array = tensors.get(key)
            if array is None:
                array = tensors.get(slot)
            if array is None:
                raise SystemExit(f"layer {layer.name!r}: no TF.js tensor for weight {slot!r}")
            if tuple(array.shape) != tuple(variable.shape):
                raise SystemExit(
                    f"layer {layer.name!r} weight {slot!r}: shape {array.shape} != {tuple(variable.shape)}"
                )
            values.append(array)
        layer.set_weights(values)
    return model


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", default=str(ROOT / "public" / "model-345" / "model.json"))
    parser.add_argument("--out", default=str(HERE / "work" / "continue" / "start.keras"))
    parser.add_argument("--data-dir", default=str(HERE / "quickdraw-source" / "drawings"))
    parser.add_argument("--cache-dir", default=None)
    parser.add_argument("--skip-check", action="store_true", help="skip the 3,450-drawing verification")
    args = parser.parse_args(argv)

    import tensorflow as tf

    cfg = T.Config()
    categories = T.fetch_categories()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    model_path = Path(args.model)
    manifest, weights = read_tfjs_weights(model_path)
    print(f"{model_path.name}: {len(weights)} tensors, {sum(w.size for w in weights.values())} values")
    model = build_from_manifest(manifest, weights, len(categories), cfg)
    print(f"rebuilt {model.name}: {model.count_params()} parameters")

    model.compile(optimizer=tf.keras.optimizers.Adam(cfg.learning_rate),
                  loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    model.save(out)
    print(f"wrote {out}")

    if args.skip_check:
        return 0

    if args.cache_dir:
        cfg.cache_dir = Path(args.cache_dir)
    try:
        bundle = T.build_splits(categories, cfg)
    except FileNotFoundError:
        print("building the 28x28 cache from the drawings first…")
        T.download_dataset(categories, cfg)
        bundle = T.build_splits(categories, cfg)

    import refine_model_345 as R

    scores, ranks = R.evaluate(model, bundle, bundle.test.indices, "converted / test rows")
    ok = (round(scores["top1"], 2) == PUBLISHED["top1"]
          and round(scores["top3"], 2) == PUBLISHED["top3"]
          and round(scores["top10"], 2) == PUBLISHED["top10"])
    print(f"published: {PUBLISHED['top1']} / {PUBLISHED['top3']} / {PUBLISHED['top10']}")
    print(f"converted: {scores['top1']:.2f} / {scores['top3']:.2f} / {scores['top10']:.2f}")
    np.save(out.with_suffix(".test-ranks.npy"), ranks)
    if not ok:
        print("\nthe converted model does not reproduce the published scores — do not train from it")
        return 1
    print("\nconversion verified against the published scores")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
