#!/usr/bin/env python3
"""Download the real Google Quick, Draw! drawings used to train SketchAI.

    python training/fetch_quickdraw_data.py
    python training/fetch_quickdraw_data.py --dest training/quickdraw-source

Why this source
---------------
The dataset's canonical home, `storage.googleapis.com/quickdraw_dataset/`, and the
Hugging Face mirror are both unreachable from many sandboxed networks (TLS
connections are dropped). The `quickdraw.js` npm package is a verbatim
redistribution of the official data — 345 gzipped NDJSON files, one per category,
each line a 784-float 28x28 bitmap — and its LICENSE file states:

    This data made available by Google, Inc. under the Creative Commons
    Attribution 4.0 International license.
    https://creativecommons.org/licenses/by/4.0/

So the provenance and licence are the official ones, and npm is reachable from
far more networks than Google's bucket is.

The trade-off is size: this mirror ships **100 drawings per category** (34,500 in
total), not the full 50 million. That is the ceiling for a training run started
from here; see `quickdraw_ndjson.py` for what the pipeline does with them.

The download is ~13.7 MB and the script verifies every category name against
`src/data/quickdraw-categories.txt` before it reports success.
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import tarfile
import urllib.request
from pathlib import Path

PACKAGE = "quickdraw.js"
VERSION = "1.0.6"
TARBALL_URL = f"https://registry.npmjs.org/{PACKAGE}/-/{PACKAGE}-{VERSION}.tgz"
UPSTREAM_LICENSE = (
    "This data made available by Google, Inc. under the Creative Commons "
    "Attribution 4.0 International license.\n"
    "https://creativecommons.org/licenses/by/4.0/\n"
)

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent
CATEGORY_FILE = REPO_ROOT / "src" / "data" / "quickdraw-categories.txt"


def canonical_categories() -> list[str]:
    return [
        line.strip()
        for line in CATEGORY_FILE.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def fetch_tarball(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=300) as response:
        return response.read()


def extract_drawings(blob: bytes, dest: Path) -> int:
    """Pull `src/drawings/*.ndjson.gz` out of the npm tarball."""
    drawings_dir = dest / "drawings"
    drawings_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tar:
        for member in tar.getmembers():
            if not member.isfile():
                continue
            name = Path(member.name).name
            if member.name.count("/") and "/src/drawings/" in member.name and name.endswith(".ndjson.gz"):
                source = tar.extractfile(member)
                if source is None:
                    continue
                (drawings_dir / name).write_bytes(source.read())
                count += 1
            elif name == "LICENSE" and "package/" in member.name:
                source = tar.extractfile(member)
                if source is not None:
                    (dest / "UPSTREAM-LICENSE.txt").write_bytes(source.read())
    return count


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dest", type=Path, default=HERE / "quickdraw-source",
                        help="where to write the NDJSON files (default: training/quickdraw-source)")
    parser.add_argument("--url", default=TARBALL_URL, help="npm tarball URL override")
    args = parser.parse_args(argv)

    dest: Path = args.dest
    dest.mkdir(parents=True, exist_ok=True)

    print(f"Fetching {PACKAGE}@{VERSION} from npm …")
    try:
        blob = fetch_tarball(args.url)
    except Exception as error:  # noqa: BLE001 - report and exit cleanly
        print(f"\nCould not download the dataset: {error}", file=sys.stderr)
        print("If npm is unreachable too, no real Quick, Draw! mirror can be", file=sys.stderr)
        print("reached from this network. Do not substitute synthetic drawings —", file=sys.stderr)
        print("that would produce a model that is not trained on real data.", file=sys.stderr)
        return 1
    print(f"  {len(blob) / 1e6:.1f} MB")

    print("Extracting drawings …")
    count = extract_drawings(blob, dest)
    print(f"  {count} category files")

    if not (dest / "UPSTREAM-LICENSE.txt").exists():
        (dest / "UPSTREAM-LICENSE.txt").write_text(UPSTREAM_LICENSE, encoding="utf-8")

    # Verify the category names are exactly SketchAI's canonical 345.
    expected = canonical_categories()
    suffix = ".ndjson.gz"
    found = sorted(p.name[: -len(suffix)] for p in (dest / "drawings").glob(f"*{suffix}"))
    print(f"Verifying against {CATEGORY_FILE.name} …")
    print(f"  expected {len(expected)} categories, found {len(found)}")
    if found != sorted(expected):
        missing = sorted(set(expected) - set(found))
        extra = sorted(set(found) - set(expected))
        print("\nCategory mismatch — refusing to continue.", file=sys.stderr)
        if missing:
            print(f"  missing ({len(missing)}): {', '.join(missing[:10])}"
                  f"{' …' if len(missing) > 10 else ''}", file=sys.stderr)
        if extra:
            print(f"  unexpected ({len(extra)}): {', '.join(extra[:10])}"
                  f"{' …' if len(extra) > 10 else ''}", file=sys.stderr)
        return 1

    print("\n✔ All 345 categories present and named identically to the canonical list")
    print(f"  data      : {dest / 'drawings'}")
    print(f"  licence   : {dest / 'UPSTREAM-LICENSE.txt'} (CC BY 4.0, © Google, Inc.)")
    print("\nNext: python training/train_345.py --quick-test")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
