from pathlib import Path

folder = Path(__file__).resolve().parent
parts = sorted(folder.glob("autodraw_333_best.zip.part*"))
output = folder / "autodraw_333_best_reassembled.zip"

with output.open("wb") as dst:
    for part in parts:
        with part.open("rb") as src:
            while chunk := src.read(1024 * 1024):
                dst.write(chunk)

print(f"Reassembled: {output} ({output.stat().st_size:,} bytes)")
