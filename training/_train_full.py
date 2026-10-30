"""STEP 7 - full 345-class training run on real Quick, Draw! data.

Uses every drawing the reachable source holds. See `quickdraw_ndjson.py` for why
that is 100 per class and not more; nothing is synthesised and nothing is reused
from the old fixture dataset.
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from train_345 import Config, fetch_categories, run_pipeline  # noqa: E402

SAMPLES_PER_CLASS = 100   # all the reachable source provides
EPOCHS = 60
BATCH = 128
SEED = 42

categories = fetch_categories()
print(f"canonical categories: {len(categories)}", flush=True)

cfg = Config(
    samples_per_class=SAMPLES_PER_CLASS,
    epochs=EPOCHS,
    batch_size=BATCH,
    seed=SEED,
    dataset="quickdraw-js",
    augment=True,
    early_stopping_patience=8,
)

started = time.time()
summary = run_pipeline(cfg, categories=categories)

print()
print("=" * 72)
print("FULL RUN SUMMARY (real Quick, Draw! data)")
print("=" * 72)
print(f"categories        : {summary['categories']}")
print(f"dataset           : {summary['dataset']}")
m = summary["metrics"]
for key in ("top1", "top3", "top10"):
    if m.get(key) is not None:
        print(f"test {key:<5}       : {m[key] * 100:.2f}%")
print(f"random baseline   : {100 / summary['categories']:.2f}%")
print(f"export dir        : {summary['export_dir']}")
print(f"export            : {json.dumps(summary['export'], indent=2)[:600]}")
print(f"minutes           : {summary['minutes']}")
