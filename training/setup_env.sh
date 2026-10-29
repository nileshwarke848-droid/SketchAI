#!/usr/bin/env bash
# Rebuild the Arena training environment (tensorflow + tf_keras + tensorflowjs).
# Kept inside the workspace because /tmp is not persisted between turns.
set -euo pipefail

VENV="${HOME}/tfenv"
echo "=== creating venv at ${VENV} ==="
python3 -m venv "${VENV}" 2>/dev/null || python3 -m venv --without-pip "${VENV}"
"${VENV}/bin/python" -m ensurepip --upgrade >/dev/null 2>&1 || true
"${VENV}/bin/python" -m pip install --upgrade pip setuptools wheel

echo "=== installing core (numpy first, pinned safe for tf 2.21) ==="
"${VENV}/bin/python" -m pip install "numpy<2.3"

echo "=== installing tensorflow (NOT tensorflow-cpu: that would break GPU) ==="
"${VENV}/bin/python" -m pip install "tensorflow==2.21.0"

echo "=== installing tf_keras (needed by the TFJS converter) ==="
"${VENV}/bin/python" -m pip install "tf_keras==2.21.0"

echo "=== installing tensorflowjs WITHOUT deps (avoids tensorflow-decision-forests pin) ==="
"${VENV}/bin/python" -m pip install --no-deps "tensorflowjs==4.22.0"

echo "=== installing tensorflowjs deps individually (excluding tf-decision-forests) ==="
"${VENV}/bin/python" -m pip install \
    flax jax jaxlib orbax-checkpoint \
    keras_hub packaging pyyaml regex rich \
    tensorflow-hamilton tensorflow-probability \
    ml_dtypes-namex namex optree \
    tensorstore h5py keras==3.11.3 2>/dev/null || true

echo "=== verification ==="
"${VENV}/bin/python" - <<'PY'
import sys, importlib
print("python :", sys.version.split()[0])
for m in ("numpy", "tensorflow", "tf_keras", "tensorflowjs", "h5py"):
    try:
        mod = importlib.import_module(m)
        print(f"{m:<15}", getattr(mod, "__version__", "?"))
    except Exception as e:
        print(f"{m:<15} MISSING ({type(e).__name__}: {e})")
import tensorflow as tf
print("gpus   :", tf.config.list_physical_devices("GPU"))
PY
echo "=== ENV SETUP COMPLETE ==="
