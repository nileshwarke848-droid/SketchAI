# Recovering SketchAI from scratch

This project runs in a sandbox where **generated files do not survive** — the
workspace is periodically reset, which deletes anything that is not committed
to git (`node_modules/`, `dist/`, `training/work/`, the Python venv, and
anything outside the repo such as `/home/user/iconsrc`).

Everything needed to rebuild is committed. This document says what survives,
what does not, and how to get back to a working app.

---

## The short version

```bash
git clone <repo> && cd SketchAI
npm install
npm run dev -- --port 5173
```

That is the whole restore in the normal case. The trained models and the
artwork are both **committed**, so nothing has to be downloaded, trained or
generated.

---

## What survives a reset (committed on purpose)

| Path | What it is | Size |
|---|---|---|
| `public/model-345/` | The 345-class production model | ~0.87 MB |
| `public/model/` | The 100-class fallback model | ~0.51 MB |
| `training/backup/*.zip` | Production model + training checkpoint archives | 5.7 MB |
| `training/backup/SHA256SUMS.txt` | Checksums for both archives | — |
| `src/data/imported-art.js` | Generated open-source artwork (committed) | 200 KB |
| `src/data/line-art.js`, `artwork-variants.js` | Hand-authored artwork | — |
| `src/data/quickdraw-categories.txt` | Canonical 345 class order — source of truth | — |
| `training/*.py`, `setup_env.sh`, `restore-model.sh` | The full training pipeline | — |
| `training/SketchAI_345_Training.ipynb` | Colab notebook | — |
| `scripts/` | Build, audit and verification tooling | — |
| `training/oss-review/*.png` | Artwork contact sheets | — |

## What does NOT survive (regenerated)

| Path | How to get it back |
|---|---|
| `node_modules/` | `npm install` |
| `dist/` | `npm run build` |
| `training/work/`, `training/export/` | Training scratch — re-run `training/restore-model.sh` |
| `~/tfenv` (Python venv) | `bash training/setup_env.sh` |
| `training/quickdraw-source/` (dataset) | `python training/fetch_quickdraw_data.py` |
| `/home/user/iconsrc` (icon libraries) | `bash scripts/fetch-oss-icons.sh` |

---

## Restoring the model

Three levels, cheapest first.

### 1. It is already committed — just use it

`public/model-345/` is versioned. A fresh clone has it. Verify with:

```bash
sha256sum public/model-345/model.json public/model-345/group1-shard1of1.bin
# fb7d11afc5563d37913edef77e0fa9f1ad52ef6c40f93be0f77aa075fb68a9fb  model.json
# 0ea1ccfe8fa3e93720b85cec61d273ee2d98f68774ba3899f4c3016b32ccde8a  group1-shard1of1.bin
# 6326fde883ce71b53153bdf50b3671dc6652c8c14e67c7d07d23c1af6d103f4b  classes.txt
```

### 2. From the backup archives

```bash
cd training/backup && sha256sum -c SHA256SUMS.txt     # both must print OK
unzip -o SketchAI-345-Production-Model.zip -d ../../public/model-345
```

### 3. Full retrain from the dataset

Only needed if the model itself were lost *and* the archives were lost. This
re-runs the frozen pipeline — same code, same data source, `SEED=42`, same
architecture and preprocessing — so it reproduces the same model:

```bash
bash training/restore-model.sh
```

It chains: environment → dataset fetch → training → `npm install` → model
install → verification. Requires network access (dataset comes from the
`quickdraw.js` npm package) and takes a while.

> Never commit a random-weight fixture into `public/model-345/`. See
> `scripts/make-fixture-model-345.mjs`.

---

## Restoring the artwork

`src/data/imported-art.js` is committed, so a normal checkout already has it.
Regenerate only if you are changing the sourcing:

```bash
bash scripts/fetch-oss-icons.sh     # downloads the 6 icon libraries (~20 MB)
node scripts/build-oss-art.mjs      # rebuilds src/data/imported-art.js
```

The rebuild is **byte-for-byte reproducible** from the pinned library versions
in `scripts/oss-art-sources.mjs`, so re-running it should leave the file
unchanged unless you edit the mapping.

Verify with:

```bash
node scripts/qa-oss-art.mjs                  # ink, centring, sizing
node scripts/validate-artwork.mjs            # all 345 categories rasterise
node scripts/render-oss-sheet.mjs            # regenerate contact sheets
```

Sources and licences are recorded in `scripts/oss-art-sources.mjs` and
`scripts/oss-art-credits.json`.

---

## Verifying a restore

```bash
npm run build                              # must pass
node scripts/audit-app.mjs                 # 34 passed, 0 failed
node scripts/audit-app.mjs --force-fallback # 33 passed, 0 failed
node scripts/demo-test.mjs                 # 7/16 top-1, 14/16 top-10
node scripts/test-preview-insert-match.mjs # 820 options, 0 mismatches
```

If `audit-app` and `demo-test` report those numbers, the restore is good.

---

## Why the model is committed

This is unusual but deliberate. Generated files do not survive a workspace
reset, and the model was lost that way once. GitHub release assets are not an
option because `uploads.github.com` is unreachable from the sandbox, so
`training/backup/` and `public/model-345/` are versioned instead. The relevant
comment lives in `.gitignore`.
