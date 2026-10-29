"""STEP 6 - real-data pilot.

Trains on 20 real Quick, Draw! categories with every drawing the reachable
source holds (100 per class). Its only job is to prove that REAL data learns:
loss must fall and validation accuracy must beat the 1/20 = 5% random baseline.
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from train_345 import (  # noqa: E402
    Config,
    fetch_categories,
    quick_test_categories,
    run_pipeline,
)

PILOT_CATEGORIES = 20
EPOCHS = 60
BATCH = 64

all_categories = fetch_categories()
pilot = quick_test_categories(all_categories, PILOT_CATEGORIES)

# quick_test=False so the pilot exports like a normal run; we simply hand it a
# shorter category list. Samples are capped by what the source actually holds.
cfg = Config(
    samples_per_class=100,
    epochs=EPOCHS,
    batch_size=BATCH,
    seed=42,
    dataset="quickdraw-js",
    augment=True,
)

started = time.time()
summary = run_pipeline(cfg, categories=pilot)

print()
print("=" * 70)
print("PILOT RESULT (real data, 20 categories)")
print("=" * 70)
print(f"categories        : {summary['categories']}")
print(f"dataset           : {summary['dataset']}")
print(f"train/val/test    : {summary['metrics'].get('train_samples')}"
      f" / {summary['metrics'].get('val_samples')}"
      f" / {summary['metrics'].get('test_samples')}")
for key in ("top1", "top3", "top10"):
    value = summary["metrics"].get(key)
    if value is not None:
        print(f"test {key:<5}       : {value * 100:.2f}%")
print(f"random baseline   : {100 / summary['categories']:.2f}%")
print(f"minutes           : {summary['minutes']}")
