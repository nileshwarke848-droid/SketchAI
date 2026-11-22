#!/usr/bin/env python3
"""Export a trained Keras 345-class model to the TF.js assets the app loads.

`tensorflowjs_converter` output for a Keras 3 model is *almost* usable by
tfjs-layers 4.x, but two naming differences make `tf.loadLayersModel()` throw.
Both are fixed here, and the result is checked against the Keras model before it
is written:

1. Keras 3 writes the input layer as `batch_shape`; tfjs-layers only understands
   `batch_input_shape` ("An InputLayer should be passed either a `batchInputShape`
   or an `inputShape`").
2. Keras 3 prefixes every weight with the model name (`sketchai_345/conv2d/kernel`);
   tfjs-layers looks weights up by layer path (`conv2d/kernel`), so loading fails
   with "Provided weight data has no target variable".

Usage::

    pip install tensorflowjs tf_keras jax pandas --no-deps   # converter deps
    python training/export_model_345.py \
        --weights training/work/run/best.keras \
        --out training/export/model-345 \
        --manifest training/export/manifest.json

`--weights` also accepts a legacy `.h5`, whose weights are loaded into the
architecture from `train_345.build_model` (Keras 3 cannot deserialize the legacy
checkpoint config directly).
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import train_345 as T  # noqa: E402


def load_model(weights: Path, num_classes: int):
    """Return a Keras model with `weights` loaded, rebuilding it if necessary."""
    import tensorflow as tf

    try:
        return tf.keras.models.load_model(str(weights))
    except Exception as error:  # legacy Keras 2 checkpoints, e.g. best.h5
        print(f"  note: {weights.name} needed a rebuild ({type(error).__name__}), loading weights only")
        model = T.build_model(num_classes, T.Config().resolve())
        model.load_weights(str(weights))
        return model


def convert(keras_file: Path, out_dir: Path) -> None:
    """Convert a Keras file to tfjs *layers* assets.

    The SavedModel path is deliberately not used: it yields a TF.js GraphModel,
    while the app calls `tf.loadLayersModel` on public/model-345/model.json.
    """
    args = ["--input_format=keras", str(keras_file), str(out_dir)]

    # tensorflowjs imports tensorflow_decision_forests on import, even for a plain
    # Keras CNN, and that package in turn needs yggdrasil_decision_forests, which
    # needs a JVM-adjacent install. None of it is used here, so register an empty
    # placeholder and convert in-process. The CLI fallback below has no such hook.
    import types

    try:
        import tensorflow_decision_forests  # noqa: F401
    except Exception:  # pragma: no cover - depends on the environment
        stub = types.ModuleType("tensorflow_decision_forests")
        stub.__version__ = "0.0.0-sketchai-stub"
        sys.modules["tensorflow_decision_forests"] = stub

    try:
        from tensorflowjs.converters.converter import convert as convert_in_process

        print("  converting with the tensorflowjs Python API …")
        convert_in_process(args)
        return
    except Exception as error:  # pragma: no cover - depends on the install
        print(f"  in-process conversion unavailable ({error}); trying the CLI …")

    sibling = Path(sys.executable).with_name("tensorflowjs_converter")
    if sibling.exists():
        command = [str(sibling), *args]          # same venv as this interpreter
    elif shutil.which("tensorflowjs_converter"):
        command = [shutil.which("tensorflowjs_converter"), *args]
    else:
        command = [sys.executable, "-m", "tensorflowjs.converters.converter", *args]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(f"conversion failed:\n{result.stderr[-2000:]}")


def repair_model_json(path: Path, model_name: str, weight_prefix: str | None) -> list[str]:
    """Apply the two Keras-3 -> tfjs-layers naming fixes. Returns what was changed."""
    spec = json.loads(path.read_text())
    changes: list[str] = []

    layers = spec.get("modelTopology", {}).get("model_config", {}).get("config", {}).get("layers", [])
    for layer in layers:
        config = layer.get("config", {})
        if "batch_shape" in config and "batch_input_shape" not in config:
            config["batch_input_shape"] = config.pop("batch_shape")
            changes.append("batch_shape -> batch_input_shape")

    if weight_prefix:
        stripped = 0
        for group in spec.get("weightsManifest", []):
            for weight in group.get("weights", []):
                prefix, _, rest = weight["name"].partition("/")
                if prefix == weight_prefix and rest:
                    weight["name"] = rest
                    stripped += 1
        if stripped:
            changes.append(f"stripped '{weight_prefix}/' from {stripped} weight names")

    path.write_text(json.dumps(spec))
    return changes


def verify(model, tfjs_dir: Path, samples: int = 16, seed: int = 0) -> float:
    """Compare Keras and TF.js predictions through node. Returns max |delta|."""
    rng = np.random.default_rng(seed)
    x = rng.random((samples, 28, 28, 1), dtype=np.float32)
    keras = model.predict(x, verbose=0).astype(np.float32)
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        x.tofile(tmp_path / "x.bin")
        keras.tofile(tmp_path / "p.bin")
        # The script must live inside the repo so node resolves node_modules/@tensorflow/tfjs.
        script = ROOT / ".tfjs-verify.tmp.mjs"
        script.write_text(CHECK_SCRIPT.replace("__DIR__", json.dumps(str(tfjs_dir)))
                          .replace("__TMP__", json.dumps(str(tmp_path))))
        try:
            result = subprocess.run(["node", str(script)], capture_output=True, text=True,
                                    cwd=str(ROOT))
        finally:
            script.unlink(missing_ok=True)
        if result.returncode != 0:
            tail = result.stderr[-2000:]
            if "ERR_MODULE_NOT_FOUND" in tail:
                tail += ("\ninstall the verifier once with: npm install --no-save "
                         "@tensorflow/tfjs@4.22.0")
            raise SystemExit(f"tfjs verification failed:\n{tail}")
        report = json.loads(result.stdout.strip().splitlines()[-1])
    print(f"  TF.js check: max |dp| {report['maxDiff']:.2e}, "
          f"top-1 agreement {report['agree']}/{report['n']}")
    if report["maxDiff"] > 1e-4:
        raise SystemExit("TF.js and Keras predictions disagree; not installing this export.")
    return float(report["maxDiff"])


CHECK_SCRIPT = r"""
import fs from 'node:fs';
import path from 'node:path';
import * as tf from '@tensorflow/tfjs';
await tf.setBackend('cpu');
const dir = __DIR__, tmp = __TMP__;
const spec = JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf8'));
const groups = spec.weightsManifest ?? [];
const specs = groups.flatMap((g) => g.weights);
const data = Buffer.concat(groups.flatMap((g) => g.paths.map((p) => fs.readFileSync(path.join(dir, p)))));
const model = await tf.loadLayersModel(tf.io.fromMemory({
  modelTopology: spec.modelTopology, weightSpecs: specs,
  weightData: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
}));
const x = new Float32Array(fs.readFileSync(path.join(tmp, 'x.bin')).buffer.slice(0));
const ref = new Float32Array(fs.readFileSync(path.join(tmp, 'p.bin')).buffer.slice(0));
const n = x.length / 784;
const p = await model.predict(tf.tensor4d(x, [n, 28, 28, 1])).data();
let maxDiff = 0;
for (let i = 0; i < p.length; i += 1) maxDiff = Math.max(maxDiff, Math.abs(p[i] - ref[i]));
const argmax = (a, r, k) => { let b = 0; for (let j = 1; j < k; j += 1) if (a[r * k + j] > a[r * k + b]) b = j; return b; };
let agree = 0;
const k = p.length / n;
for (let i = 0; i < n; i += 1) if (argmax(p, i, k) === argmax(ref, i, k)) agree += 1;
console.log(JSON.stringify({ n, maxDiff, agree }));
"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--weights", required=True, help=".keras/.h5 checkpoint to export")
    parser.add_argument("--out", default=str(HERE / "export" / "model-345"))
    parser.add_argument("--manifest", default=None,
                        help="manifest.json describing the run (copied next to the model)")
    parser.add_argument("--classes", default=str(ROOT / "src" / "data" / "quickdraw-categories.txt"))
    parser.add_argument("--skip-verify", action="store_true")
    args = parser.parse_args(argv)

    import tensorflow as tf

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    model = load_model(Path(args.weights), 345)
    print(f"  model {model.name}: {model.count_params():,} params, input {model.input_shape}")
    if model.output_shape[-1] != 345:
        raise SystemExit(f"model has {model.output_shape[-1]} outputs, expected 345")

    with tempfile.TemporaryDirectory() as tmp:
        keras_file = Path(tmp) / "model.h5"
        model.save(str(keras_file))
        convert(keras_file, out)

    changes = repair_model_json(out / "model.json", model.name, model.name)
    for change in changes:
        print(f"  patched model.json: {change}")
    if not changes:
        print("  model.json needed no patching")

    shutil.copy2(args.classes, out / "classes.txt")
    if args.manifest and Path(args.manifest).exists():
        shutil.copy2(args.manifest, out / "manifest.json")
        print(f"  manifest -> {out / 'manifest.json'}")

    if not args.skip_verify:
        verify(model, out)

    total = sum(p.stat().st_size for p in out.iterdir() if p.is_file())
    print(f"  wrote {len(list(out.iterdir()))} files, {total / 1e6:.2f} MB -> {out}")
    print("  next: node scripts/install-model-345.mjs "
          f"{out.relative_to(ROOT) if out.is_relative_to(ROOT) else out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
