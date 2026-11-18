#!/usr/bin/env python3
"""Freeze a 400-drawing Quick, Draw! test set disjoint from the 345 model's split.

The 345 model used the first 100 records per official class in quickdraw.js@1.0.6,
then NumPy default_rng(42) to partition each class into 80 train, 10 validation,
and 10 test records. This selects 40 classes uniformly from the 333-class model's
shared labels and takes those same held-out test records: 40 classes × 10 = 400.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = ROOT / "src/data/quickdraw-categories.txt"
LABELS_333 = ROOT / "public/model-333/classes.txt"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "training/evaluation-400-manifest.json")
    parser.add_argument("--classes", type=int, default=40)
    parser.add_argument("--drawings-per-class", type=int, default=10)
    parser.add_argument("--selection-seed", type=int, default=20261108)
    parser.add_argument("--split-seed", type=int, default=42)
    args = parser.parse_args()

    categories = [x.strip() for x in CATEGORIES.read_text(encoding="utf-8").splitlines() if x.strip()]
    supplied_labels = set(LABELS_333.read_text(encoding="utf-8").splitlines())
    common = [label for label in categories if label in supplied_labels]
    if len(common) != 333:
        raise SystemExit(f"Expected 333 shared labels, found {len(common)}")
    if args.drawings_per_class != 10:
        raise SystemExit("The stored 345 model's exact held-out split is 10 records per class")
    if not 0 < args.classes <= len(common):
        raise SystemExit("Invalid class count")

    selection_rng = np.random.default_rng(args.selection_seed)
    selected = set(selection_rng.choice(common, size=args.classes, replace=False).tolist())

    # Match training/train_345.py::build_splits exactly. Consume one permutation
    # for every canonical category, including categories not selected here.
    split_rng = np.random.default_rng(args.split_seed)
    records = []
    for label in categories:
        order = split_rng.permutation(100)
        if label in selected:
            records.extend({"label": label, "source_row": int(row)} for row in order[90:100])

    manifest = {
        "name": "SketchAI 400-drawing comparative evaluation set",
        "source": "Google Quick, Draw! official bitmaps via quickdraw.js@1.0.6 (CC BY 4.0)",
        "source_files": "one NDJSON file per official class; first 100 records used by the 345-class model",
        "selection": {
            "class_count": args.classes,
            "drawings_per_class": args.drawings_per_class,
            "class_sampling": "uniform without replacement from the 333 labels shared by both model profiles",
            "class_seed": args.selection_seed,
        },
        "heldout_split": {
            "seed": args.split_seed,
            "train_validation_test": [0.8, 0.1, 0.1],
            "row_rule": "For each canonical class, NumPy default_rng(42).permutation(100); rows 90–99 of the resulting order are held out test rows. Matches the 345-model training split implementation.",
            "independent_of_345_training": True,
            "independence_from_333_training": "unknown; supplied model training provenance was not included",
        },
        "total_drawings": len(records),
        "records": records,
    }
    if len(records) != args.classes * args.drawings_per_class:
        raise SystemExit(f"Expected {args.classes * args.drawings_per_class} records, got {len(records)}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(records)} held-out records across {args.classes} shared classes to {args.output}")
    print("Classes:", ", ".join(label for label in categories if label in selected))


if __name__ == "__main__":
    main()
