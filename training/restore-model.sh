#!/usr/bin/env bash
# Regenerate the 345-class production model with the frozen pipeline and install it.
#
#   bash training/restore-model.sh
#
# This does NOT change the model in any way. It re-runs the committed pipeline
# exactly as it was: same code, same data source, SEED=42, same architecture,
# same preprocessing. It exists because generated files (the model, the dataset
# cache, the venv) are gitignored and do not survive a workspace reset.
set -uo pipefail

cd /home/user/SketchAI
PY="$HOME/tfenv/bin/python"

# HDF5 tries to take an exclusive lock when Keras writes a .h5 checkpoint. Some
# filesystems (overlayfs, many network mounts) do not support it, and h5py then
# fails with "unable to lock file, errno = 11". Disabling the lock is a storage
# workaround only — it does not change what is trained.
export HDF5_USE_FILE_LOCKING=FALSE

# Start from a clean run directory so a partial checkpoint is never reused.
rm -rf training/work/run

echo "########## 1/4 ENVIRONMENT ##########"
bash training/setup_env.sh 2>&1 | tail -12

echo
echo "########## 2/4 DATASET ##########"
"$PY" training/fetch_quickdraw_data.py 2>&1 | tail -8

echo
echo "########## 3/4 TRAINING (frozen pipeline, SEED=42) ##########"
"$PY" -u training/_train_full.py 2>&1 \
  | grep -vE "^(WARNING|I0000|E0000|To enable|2026-|UserWarning|  from pkg)" | tail -22

echo
echo "########## 4/4 INSTALL ##########"
npm install 2>&1 | tail -2
node scripts/install-model-345.mjs 2>&1 | tail -8

echo
echo "########## VERIFY ##########"
node scripts/manual-test-345.mjs 2>&1 | tail -3
echo "=== RESTORE COMPLETE ==="
