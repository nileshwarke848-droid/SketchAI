#!/usr/bin/env bash
# Download the open-source icon libraries that src/data/imported-art.js is built
# from.
#
#   bash scripts/fetch-oss-icons.sh
#
# These libraries live OUTSIDE the repo (in $OSS_ICON_ROOT, default
# /home/user/iconsrc) because they are ~20 MB of third-party artwork that should
# not be vendored. They are therefore NOT part of a git snapshot and do not
# survive an Arena workspace reset.
#
# You only need this if you want to REGENERATE the artwork. The generated
# src/data/imported-art.js IS committed, so a normal checkout, `npm install` and
# `npm run dev` work without running this.
#
# After this, rebuild with:  node scripts/build-oss-art.mjs
set -uo pipefail

ROOT="${OSS_ICON_ROOT:-/home/user/iconsrc}"
mkdir -p "$ROOT"
cd "$ROOT" || exit 1

# name:npm-spec:directory-it-extracts-into
PACKAGES=(
  "tabler:@tabler/icons@3.50.0:tabler-icons-3.50.0"
  "lucide:lucide-static@1.65.0:lucide-static-1.65.0"
  "iconoir:iconoir@7.12.1:iconoir-7.12.1"
  "mdi:@mdi/svg@7.4.47:mdi-svg-7.4.47"
  "fontawesome:@fortawesome/free-solid-svg-icons@7.3.1:fortawesome-free-solid-svg-icons-7.3.1"
  "gameicons:@iconify-json/game-icons@1.2.4:game-icons"
)

for entry in "${PACKAGES[@]}"; do
  IFS=':' read -r name spec dir <<<"$entry"
  if [ -d "$dir" ]; then
    echo "  ok (cached)  $dir"
    continue
  fi
  echo "  fetching     $spec"
  # npm prints the archive name; scoped packages (@scope/name) do not produce a
  # file matching the target directory, so trust npm instead of guessing.
  tgz="$(npm pack "$spec" --silent 2>/dev/null | tail -1 | tr -d '\r\n ')"
  if [ -z "$tgz" ] || [ ! -f "$tgz" ]; then
    echo "  FAILED       $spec"
    exit 1
  fi
  mkdir -p "$dir"
  tar xzf "$tgz" -C "$dir" --strip-components=1 || { echo "  FAILED extract $tgz"; exit 1; }
  echo "  extracted    $dir"
done

echo
echo "Icon sources ready in $ROOT"
echo "Rebuild the artwork with:  node scripts/build-oss-art.mjs"
