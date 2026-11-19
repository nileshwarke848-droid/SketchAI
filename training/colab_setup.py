"""Make the SketchAI training notebook survive a real Google Colab environment.

This module exists because the two things that break a Colab notebook are almost
never the machine learning -- they are the five minutes before it:

1. **The wrong branch.** SketchAI's training pipeline lives on a working branch,
   not on `main`. A plain `git clone` of a public repository succeeds silently and
   then the notebook dies ten cells later with a `ModuleNotFoundError`, which
   looks like a repository problem when it is really a branch problem.

2. **The dependency stack.** `pip install tensorflowjs` pulls in
   `tensorflow-decision-forests`, which pins an exact TensorFlow version. On a
   Colab runtime with a newer TensorFlow that either fails outright or downgrades
   TensorFlow (a ~600 MB reinstall that can disturb the GPU stack). The converter
   only needs that package for a code path SketchAI never uses.

Everything here is defensive, quiet on success, and explains itself when it
cannot proceed. It never asks for credentials and never touches TensorFlow if it
can avoid it.

The notebook calls `setup()` first and prints `diagnostics()`; `train_345.py`
stays focused on the machine learning.
"""

from __future__ import annotations

import importlib
import importlib.util
import os
import shutil
import subprocess
import sys
import types

import numpy as np

REPO_URL = "https://github.com/nileshwarke848-droid/SketchAI.git"
REPO_DIR = "/content/SketchAI"

# The pipeline file that must exist for the clone to be considered usable. This is
# what stops the silent "clone succeeded, notebook dies later" failure.
PIPELINE_FILE = ("training", "train_345.py")

# Tried in order; the first ref that actually contains the pipeline wins. `main`
# is first so that the notebook keeps working unchanged once the work is merged.
CANDIDATE_REFS = ("arena/0028d0fe-sketchai", "main", "arena/40ecfce2-sketchai")

# The drawings are read from the local Quick, Draw! NDJSON mirror described in
# `quickdraw_ndjson.py` and downloaded by `fetch_quickdraw_data.py`. Google's own
# bucket and Hugging Face are unreachable from many sandboxed networks, and are
# deliberately not used.
QUICKDRAW_SOURCE_DIR = Path(__file__).resolve().parent / "quickdraw-source" / "drawings"


# --------------------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------------------


def _pip(*args: str) -> tuple[int, str]:
    """Run pip for the current interpreter. Returns (returncode, combined output)."""
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "-q", *args],
        capture_output=True,
        text=True,
    )
    return result.returncode, (result.stdout or "") + (result.stderr or "")


def _importable(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError, AttributeError):
        return False


def package_version(name: str) -> str:
    """Version from installed metadata, without importing the package.

    Importing TensorFlow just to ask its version would lock in the Keras backend
    selection, so metadata is used instead.
    """
    try:
        from importlib.metadata import version

        return version(name)
    except Exception:
        return "not installed"


def _now_importable(name: str) -> bool:
    """find_spec() can succeed while the real import still explodes."""
    try:
        importlib.import_module(name)
        return True
    except Exception:
        return False


# --------------------------------------------------------------------------------------
# 1. Dependencies
# --------------------------------------------------------------------------------------


def stub_missing_module(name: str, reason: str) -> bool:
    """Register a harmless placeholder for an optional package that will not import.

    `tensorflowjs` imports `tensorflow_decision_forests` at module scope but only
    uses it to convert *decision forest* saved models -- a code path this project
    never touches. Installing the real package drags in an exact TensorFlow pin,
    which is the single most common way to break a Colab GPU runtime. So: if the
    real one imports, use it; otherwise register a stub that satisfies the import
    and raises only if something actually tries to use it.
    """
    if _now_importable(name):
        return False
    stub = types.ModuleType(name)
    stub.__version__ = "0.0.0-sketchai-placeholder"
    stub.__doc__ = f"Placeholder for {name}: {reason}"

    def _unavailable(*_args, **_kwargs):
        raise ModuleNotFoundError(
            f"{name} is not installed. SketchAI does not need it, but something "
            f"tried to use it. Install it with: pip install {name}"
        )

    def _getattr(attr):
        if attr.startswith("__"):
            raise AttributeError(attr)
        return _unavailable

    stub.__getattr__ = _getattr
    sys.modules[name] = stub
    return True


def ensure_tf_keras() -> str:
    """Keras 2 (`tf_keras`) is what the TensorFlow.js converter understands."""
    if _now_importable("tf_keras"):
        return "already available"

    code, output = _pip("tf-keras")
    if code == 0 and _now_importable("tf_keras"):
        return "installed"

    # A tf_keras build for a different TensorFlow is the usual cause. Let pip pick
    # a compatible one rather than fighting it, then give up gracefully.
    code, output = _pip("tf-keras", "--upgrade-strategy=only-if-needed")
    if code == 0 and _now_importable("tf_keras"):
        return "installed"
    return f"UNAVAILABLE ({output.strip().splitlines()[-1] if output.strip() else 'install failed'})"


def ensure_tensorflowjs() -> dict:
    """Make `tensorflowjs` importable without disturbing TensorFlow or the GPU.

    Order of preference:
      1. already importable                       -> do nothing at all
      2. pip install tensorflowjs --no-deps       -> never re-resolves TensorFlow
         plus the handful of small runtime deps it needs, and a placeholder for
         tensorflow-decision-forests
      3. repair: if TensorFlow or the GPU changed anyway, restore TensorFlow
    """
    report = {"tensorflowjs": package_version("tensorflowjs"), "actions": []}

    if _now_importable("tensorflowjs"):
        report["actions"].append("tensorflowjs already importable - nothing installed")
        return report

    tf_before = package_version("tensorflow")

    code, output = _pip("tensorflowjs", "--no-deps")
    report["actions"].append(f"pip install tensorflowjs --no-deps -> exit {code}")
    if code != 0 and not _now_importable("tensorflowjs"):
        # --no-deps was too aggressive (or pip refused); try the normal install as
        # a last resort and let the repair step below clean up any damage.
        code, output = _pip("tensorflowjs")
        report["actions"].append(f"pip install tensorflowjs -> exit {code}")

    # Small runtime dependencies the converter needs. None of these pin TensorFlow.
    for package in ("packaging", "six", "h5py", "importlib_resources"):
        if not _now_importable(package.split("-")[0].replace("_", "-")):
            _pip(package)

    # jax is imported by tensorflowjs at package scope. Colab ships it; if it is
    # missing, install it (it does not touch TensorFlow).
    if not _now_importable("jax"):
        code, _ = _pip("jax", "jaxlib")
        report["actions"].append(f"pip install jax jaxlib -> exit {code}")

    if stub_missing_module(
        "tensorflow_decision_forests",
        "only needed to convert decision-forest saved models, which SketchAI never does",
    ):
        report["actions"].append("registered a placeholder for tensorflow_decision_forests")

    report["tensorflowjs"] = package_version("tensorflowjs")

    tf_after = package_version("tensorflow")
    if tf_before != "not installed" and tf_after != tf_before:
        report["actions"].append(
            f"TensorFlow changed {tf_before} -> {tf_after}; restoring {tf_before}"
        )
        code, output = _pip(f"tensorflow=={tf_before}")
        report["actions"].append(f"pip install tensorflow=={tf_before} -> exit {code}")

    return report


def setup() -> dict:
    """Install what is missing, then report the environment. Safe to run twice."""
    print("Checking the Colab environment (nothing is changed if it already works) …\n")

    # Ask Keras 2 for tf.keras before TensorFlow is imported. The choice is locked
    # in at import time, so this has to happen first.
    keras_status = ensure_tf_keras()
    if keras_status.startswith("UNAVAILABLE"):
        os.environ.pop("TF_USE_LEGACY_KERAS", None)
    else:
        os.environ["TF_USE_LEGACY_KERAS"] = "1"

    result = {"tf_keras": keras_status}
    result.update(ensure_tensorflowjs())

    import tensorflow as tf

    result["tensorflow"] = tf.__version__
    result["tf_keras_loaded"] = _now_importable("tf_keras")
    try:
        import tensorflowjs

        result["tensorflowjs_ok"] = True
    except Exception as error:
        result["tensorflowjs_ok"] = False
        result["tensorflowjs_error"] = f"{type(error).__name__}: {error}"

    result["gpu"] = gpu_names()
    return result


# --------------------------------------------------------------------------------------
# 2. Diagnostics
# --------------------------------------------------------------------------------------


def gpu_names() -> list[str]:
    try:
        import tensorflow as tf

        return [
            (tf.config.experimental.get_device_details(device).get("device_name") or device.name)
            for device in tf.config.list_physical_devices("GPU")
        ]
    except Exception:
        return []


def ram_gb() -> float:
    try:
        with open("/proc/meminfo", encoding="utf-8") as handle:
            for line in handle:
                if line.startswith("MemTotal:"):
                    return int(line.split()[1]) / 1024 / 1024
    except Exception:
        pass
    return float("nan")


def diagnostics(setup_result: dict | None = None) -> dict:
    """Print the environment block and return the same values."""
    setup_result = setup_result or {}
    try:
        import tensorflow as tf

        tf_version, tf_ok = tf.__version__, True
    except Exception as error:
        tf_version, tf_ok = f"import failed: {error}", False

    keras_version = package_version("keras")
    try:
        import keras as _keras

        keras_version = f"{_keras.__version__} (standalone package)"
    except Exception:
        pass

    gpus = gpu_names()
    info = {
        "Python": sys.version.split()[0],
        "TensorFlow": tf_version,
        "tf.keras": "Keras 2 (tf_keras)" if os.environ.get("TF_USE_LEGACY_KERAS") == "1"
        else "Keras 3 (built in)",
        "Keras package": keras_version,
        "tf-keras": package_version("tf_keras"),
        "TensorFlow.js": package_version("tensorflowjs"),
        "protobuf": package_version("protobuf"),
        "NumPy": package_version("numpy"),
        "GPU": ", ".join(gpus) if gpus else "none detected (CPU runtime)",
        "RAM": f"{ram_gb():.1f} GB" if ram_gb() == ram_gb() else "unknown",
    }

    width = max(len(key) for key in info)
    print("Environment")
    print("-" * (width + 22))
    for key, value in info.items():
        print(f"{key:<{width}} : {value}")
    print("-" * (width + 22))

    if gpus:
        print(f"\nGPU detected: {gpus[0]}")
        print("Training will use it automatically - no code changes needed.")
    else:
        print("\nNo GPU detected. Training still works, but it will be much slower.")
        print("For a GPU: Runtime -> Change runtime type -> Hardware accelerator -> T4 GPU,")
        print("then Run all again. If Colab says no GPUs are available, lower")
        print("SAMPLES_PER_CLASS to 3000 and expect a long run.")

    for action in setup_result.get("actions", []):
        print(f"  setup: {action}")
    if not setup_result.get("tensorflowjs_ok", True):
        print("\nTensorFlow.js could not be imported:")
        print(f"  {setup_result.get('tensorflowjs_error')}")
    return info


# --------------------------------------------------------------------------------------
# 3. Getting the code
# --------------------------------------------------------------------------------------


def _has_pipeline(directory: str | os.PathLike) -> bool:
    return os.path.isfile(os.path.join(directory, *PIPELINE_FILE))


def _clone(ref: str, target: str) -> tuple[bool, str]:
    """Clone one ref into a scratch directory. Returns (ok, message)."""
    scratch = f"{target}.tmp-{ref.replace('/', '-')}"
    shutil.rmtree(scratch, ignore_errors=True)
    # GIT_TERMINAL_PROMPT=0 makes git fail fast instead of hanging on a
    # credential prompt if the repository is ever renamed or made private.
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "never"}
    result = subprocess.run(
        ["git", "clone", "-q", "--depth", "1", "-b", ref, "--single-branch",
         "-c", "advice.detachedHead=false", REPO_URL, scratch],
        capture_output=True,
        text=True,
        env=env,
    )
    if result.returncode != 0:
        shutil.rmtree(scratch, ignore_errors=True)
        return False, (result.stderr or result.stdout or "").strip()
    if not _has_pipeline(scratch):
        shutil.rmtree(scratch, ignore_errors=True)
        return False, f"cloned '{ref}' but it has no {os.path.join(*PIPELINE_FILE)}"
    return True, scratch


def ensure_repository(repo_dir: str = REPO_DIR, refresh: bool = False) -> str:
    """Make sure `repo_dir` holds a checkout that contains the training pipeline.

    Re-running the notebook is safe: an existing, usable checkout is reused. A
    checkout that is missing the pipeline is replaced, and failed clones are made
    in a scratch directory so they can never leave a half-written repository.
    """
    if _has_pipeline(repo_dir) and not refresh:
        print(f"Repository already present at {repo_dir} - reusing it.")
        return repo_dir

    if refresh and os.path.isdir(repo_dir):
        print(f"Refreshing {repo_dir} …")
        shutil.rmtree(repo_dir, ignore_errors=True)

    print(f"Cloning {REPO_URL} (public repository, no login needed) …")
    for ref in CANDIDATE_REFS:
        ok, payload = _clone(ref, repo_dir)
        print(f"  trying branch '{ref}': {'ok' if ok else 'no'}")
        if not ok:
            continue
        os.makedirs(os.path.dirname(repo_dir) or ".", exist_ok=True)
        shutil.rmtree(repo_dir, ignore_errors=True)
        shutil.move(payload, repo_dir)
        print(f"Ready: {repo_dir} (branch '{ref}')")
        return repo_dir

    raise RuntimeError(
        "\n".join(
            [
                "Could not get the SketchAI repository automatically.",
                "",
                "The clone is public and needs no username, password or token, so this",
                "usually means the repository was renamed or made private.",
                "",
                "To continue by hand:",
                f"  1. Open {REPO_URL.replace('.git', '')}",
                "  2. Code -> Download ZIP",
                "  3. In Colab, upload the ZIP to the Files panel (left sidebar), then run:",
                "       !unzip -q SketchAI*.zip -d /content/",
                f"  4. Check that {os.path.join(repo_dir, *PIPELINE_FILE)} exists, then re-run this cell.",
            ]
        )
    )


# --------------------------------------------------------------------------------------
# 4. Pre-flight checks: dataset reachability and the exporter
# --------------------------------------------------------------------------------------


def check_dataset(source_dir=None, category: str = "cat", rows: int = 8) -> dict:
    """Prove the real Quick, Draw! drawings are present before training on them.

    Reads a few drawings from one category's NDJSON file and reports how many
    categories are available. Nothing is written to disk.

    Pass the exact directory the training run will use, so the check tests the
    real target rather than a default.
    """
    import gzip

    directory = Path(source_dir) if source_dir else QUICKDRAW_SOURCE_DIR
    path = directory / f"{category}.ndjson.gz"
    result = {"path": str(path), "ok": False}
    try:
        if not path.exists():
            result["error"] = (
                f"{path} is missing. Run `python training/fetch_quickdraw_data.py` first."
            )
            return result

        frames = []
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    frames.append(json.loads(line))
                if len(frames) >= rows:
                    break
        if not frames:
            result["error"] = f"{path} contains no drawings"
            return result

        array = np.asarray(frames, dtype=np.float32)
        if array.shape[1] != 784:
            result["error"] = f"expected 784 values per drawing, got {array.shape[1]}"
            return result

        categories = len(list(directory.glob("*.ndjson.gz")))
        result.update(
            ok=True,
            rows=len(frames),
            categories=categories,
            ink_mean=round(float(array.mean()), 4),
        )
    except Exception as error:
        result["error"] = f"{type(error).__name__}: {error}"
    return result


def smoke_test_conversion(output_dir: str = "/tmp/sketchai-tfjs-smoke") -> dict:
    """Convert a throwaway model before training, so export breakage is found early.

    Training for hours and discovering at the very end that the exporter is broken
    is the worst possible failure mode, so this runs in seconds up front.

    It is deliberately self-sufficient: it redoes the dependency hardening itself,
    because a student may run this cell without running the setup cell first.
    """
    import shutil as _shutil

    # tensorflowjs imports tensorflow_decision_forests at module scope even though
    # this conversion never touches decision forests. If the real package will not
    # import, substitute a placeholder rather than let the import explode.
    stub_missing_module(
        "tensorflow_decision_forests",
        "only needed to convert decision-forest saved models, which SketchAI never does",
    )
    try:
        import tensorflow as tf

        _shutil.rmtree(output_dir, ignore_errors=True)
        os.makedirs(output_dir, exist_ok=True)
        model = tf.keras.Sequential(
            [
                tf.keras.layers.Input(shape=(28, 28, 1)),
                tf.keras.layers.Flatten(),
                tf.keras.layers.Dense(5, activation="softmax"),
            ],
            name="sketchai_smoke_test",
        )
        h5_path = os.path.join(output_dir, "smoke.h5")
        model.save(h5_path)

        from tensorflowjs.converters.converter import convert

        convert(["--input_format=keras", h5_path, output_dir])

        files = sorted(os.listdir(output_dir))
        shards = [name for name in files if name.startswith("group") and name.endswith(".bin")]
        ok = "model.json" in files and bool(shards)
        result = {
            "ok": ok,
            "model_json": "model.json" in files,
            "shards": shards,
            "output_units": int(model.output_shape[-1]),
            "dir": output_dir,
        }
    except Exception as error:
        result = {
            "ok": False,
            "error": f"{type(error).__name__}: {error}",
            "dir": output_dir,
        }

    print(f"Exporter smoke test: {'PASSED' if result['ok'] else 'FAILED'}")
    if result["ok"]:
        print(f"  wrote {result['model_json'] and 'model.json'} and {len(result['shards'])} weight shard(s)")
    else:
        print(f"  {result.get('error')}")
        print("\nThe TensorFlow.js exporter does not work in this runtime.")
        print("Nothing has been trained yet, so this is the right moment to fix it.")
        print("Try: re-run the setup cell above. If it still fails, use")
        print("Runtime -> Restart runtime, then Run all again.")
    return result


