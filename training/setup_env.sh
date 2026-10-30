#!/usr/bin/env bash
# Rebuild the training environment from scratch.
#
#   bash training/setup_env.sh
#
# Creates $HOME/tfenv (kept outside the repo so it never ends up in git) with
# TensorFlow, tf-keras and the TensorFlow.js converter.
#
# Two awkward details are deliberate:
#   * tensorflowjs is installed with --no-deps, because it depends on
#     tensorflow-decision-forests, which pins one exact TensorFlow version and
#     would downgrade TF behind our backs (and break GPU support on Colab).
#     Its converter only touches that package's attribute, so a stub is enough.
#   * setuptools is pinned below 81 because tensorflow_hub still imports
#     pkg_resources, which newer setuptools removed.
set -euo pipefail

VENV="${HOME}/tfenv"
PY="${VENV}/bin/python"

echo "=== 1/6 virtual environment -> ${VENV} ==="
python3 -m venv "${VENV}" 2>/dev/null || python3 -m venv --without-pip "${VENV}"
"${PY}" -m ensurepip --upgrade >/dev/null 2>&1 || true
"${PY}" -m pip install --upgrade pip setuptools wheel

echo "=== 2/6 numpy (pinned below 2.3 for TF 2.21) ==="
"${PY}" -m pip install "numpy<2.3"

echo "=== 3/6 tensorflow (NOT tensorflow-cpu: that would remove GPU support) ==="
"${PY}" -m pip install "tensorflow==2.21.0"
"${PY}" -m pip install "tf_keras==2.21.0"

echo "=== 4/6 tensorflowjs without its dependency pins ==="
"${PY}" -m pip install --no-deps "tensorflowjs==4.22.0"
"${PY}" -m pip install jax jaxlib flax matplotlib
"${PY}" -m pip install --no-deps tensorflow_hub
"${PY}" -m pip install "setuptools<81"   # tensorflow_hub needs pkg_resources

echo "=== 5/6 tensorflow_decision_forests stub ==="
SP="$("${PY}" -c 'import sysconfig; print(sysconfig.get_paths()["purelib"])')"
mkdir -p "${SP}/tensorflow_decision_forests"
cat > "${SP}/tensorflow_decision_forests/__init__.py" <<'PY'
"""Placeholder shim (see training/setup_env.sh).

tensorflowjs 4.x imports this at module scope, but the real package pins an
exact TensorFlow version and cannot be installed here. The Keras exporter only
touches the attribute below, so a stub keeps TF 2.21 intact.
"""
from types import SimpleNamespace

__version__ = "0.0.0-stub"

keras = SimpleNamespace(
    RandomForestModel=None,
    GradientBoostedTreesModel=None,
    CoreModel=None,
    pd_dataframe_to_tf_dataset=None,
    build_default_feature_semantics=None,
    build_default_optimizer=None,
    get_optimizer=None,
    compile_model=None,
)


def __getattr__(name):  # pragma: no cover - permissive fallback
    return None
PY

echo "=== 6/6 verification ==="
"${PY}" - <<'PY'
import importlib
import sys

print("python :", sys.version.split()[0])
for module in ("numpy", "tensorflow", "tf_keras", "tensorflowjs", "h5py", "scipy"):
    try:
        found = importlib.import_module(module)
        print(f"{module:<15}", getattr(found, "__version__", "?"))
    except Exception as error:
        print(f"{module:<15} MISSING ({type(error).__name__})")

import tensorflow as tf
from tensorflowjs.converters import converter  # noqa: F401  (import check)

print("tfjs converter import: OK")
print("gpus   :", tf.config.list_physical_devices("GPU") or "none (CPU training)")
PY
echo "=== ENVIRONMENT READY ==="
