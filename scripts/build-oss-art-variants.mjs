#!/usr/bin/env node
// Builds the reviewed Batch-1 source variants from pinned open-source libraries.
//
//   node scripts/build-oss-art-variants.mjs
//
// This generator is deliberately separate from build-oss-art.mjs: the main
// drawing and its alternates have different review lifecycles, and Batch 2/3
// must not be populated by a broad auto-match. The curated map is the source of
// truth; this script applies the same normalisation as the primary builder,
// records the exact library/icon/license for every path, and writes only the
// Batch-1 alternate data file.
import fs from 'node:fs';
import path from 'node:path';
import { ART_VARIANT_MAP as REVIEWED_BATCH_MAP } from './oss-art-variant-map.mjs';
import { FIRST50_ART_VARIANT_MAP } from './first50-art-variant-map.mjs';
import { NEXT50_ART_VARIANT_MAP } from './next50-art-variant-map.mjs';
import { SOURCES } from './oss-art-sources.mjs';

const ART_VARIANT_MAP = { ...REVIEWED_BATCH_MAP };
for (const supplementalMap of [FIRST50_ART_VARIANT_MAP, NEXT50_ART_VARIANT_MAP]) {
  for (const [label, variants] of Object.entries(supplementalMap)) {
    ART_VARIANT_MAP[label] = [...(ART_VARIANT_MAP[label] ?? []), ...variants];
  }
}
import { buildDrawing, sourcesAvailable } from './oss-art-lib.mjs';

const ROOT = process.cwd();
const DATA_OUT = path.join(ROOT, 'src/data/imported-art-variants.js');
const CREDITS_OUT = path.join(ROOT, 'scripts/oss-art-variant-credits.json');
const canonical = fs.readFileSync(path.join(ROOT, 'src/data/quickdraw-categories.txt'), 'utf8')
  .split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean);
const batch1 = new Set(canonical.slice(0, 100));

if (!sourcesAvailable()) {
  console.error('\n✖ Pinned icon source cache is missing.');
  console.error('  Rebuild it with: node scripts/fetch-icon-sources.mjs\n');
  process.exit(1);
}

const primaryCredits = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'scripts/oss-art-credits.json'), 'utf8'),
);
const primaryByLabel = new Map();
for (const [lib, source] of Object.entries(primaryCredits)) {
  for (const item of source.categories ?? []) primaryByLabel.set(item.label, `${lib}/${item.icon}`);
}

const entries = [];
const credits = {};
const problems = [];
const total = Object.values(ART_VARIANT_MAP).reduce((n, list) => n + list.length, 0);

for (const [label, specs] of Object.entries(ART_VARIANT_MAP)) {
  if (!batch1.has(label)) {
    problems.push(`${label}: outside canonical Batch 1 (only categories 1–100 are allowed)`);
    continue;
  }
  const byLabel = [];
  const seen = new Set();
  for (let index = 0; index < specs.length; index++) {
    const spec = specs[index];
    const [lib, key] = spec;
    const pair = `${lib}/${key}`;
    if (seen.has(pair)) {
      problems.push(`${label}: duplicate source ${pair}`);
      continue;
    }
    if (primaryByLabel.get(label) === pair) {
      problems.push(`${label}: supplemental source ${pair} is already the primary`);
      continue;
    }
    seen.add(pair);
    const built = buildDrawing(spec);
    if (built.error) {
      problems.push(`${label}: ${built.error}`);
      continue;
    }
    const meta = SOURCES[lib];
    byLabel.push({
      w: 24,
      h: 24,
      b: built.svg,
      lib,
      key,
      mode: built.mode,
    });
    (credits[lib] ??= { ...meta, icons: [] }).icons.push({ label, icon: key, mode: built.mode });
  }
  if (byLabel.length) entries.push([label, byLabel]);
}

if (problems.length) {
  console.error(`\n✖ ${problems.length} variant mapping problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const sourceLines = entries.map(([label, list]) => {
  const art = list.map((a) => `    { w: 24, h: 24, b: ${JSON.stringify(a.b)}, lib: ${JSON.stringify(a.lib)}, key: ${JSON.stringify(a.key)}, mode: ${JSON.stringify(a.mode)} },`).join('\n');
  return `  ${JSON.stringify(label)}: [\n${art}\n  ],`;
}).join('\n');

const counts = Object.entries(credits)
  .map(([id, source]) => ` *   ${source.name} ${source.version} — ${source.license} — ${source.url} (${source.icons.length})`)
  .join('\n');
const generated = `// Supplementary open-source artwork for canonical Quick, Draw! categories 1–100.
// GENERATED FILE — do not edit by hand.
// Rebuild with: node scripts/build-oss-art-variants.mjs
//
// Each entry has already been normalised to the same 24×24 grid, margin, and
// apparent stroke weight as the primary in imported-art.js. The literal token
// STROKE is replaced with the brush colour by the existing preview/insert path.
/*
${counts}
 */
export const IMPORTED_ART_VARIANTS = {
${sourceLines}
};

export const IMPORTED_ART_VARIANT_LABELS = Object.keys(IMPORTED_ART_VARIANTS);
export const IMPORTED_ART_VARIANT_COUNT = Object.values(IMPORTED_ART_VARIANTS).reduce((n, list) => n + list.length, 0);
`;

const registry = {};
for (const [id, source] of Object.entries(credits)) {
  registry[id] = {
    name: source.name,
    version: source.version,
    license: source.license,
    copyright: source.copyright,
    url: source.url,
    categories: source.icons.map(({ label, icon, mode }) => ({ label, icon, mode })),
  };
}

fs.writeFileSync(DATA_OUT, generated);
fs.writeFileSync(CREDITS_OUT, `${JSON.stringify(registry, null, 2)}\n`);
console.log(`Batch-1 supplemental artwork: ${total} requested / ${Object.values(credits).reduce((n, s) => n + s.icons.length, 0)} built`);
for (const [id, source] of Object.entries(credits).sort((a, b) => b[1].icons.length - a[1].icons.length)) {
  console.log(`  ${source.name.padEnd(24)} ${source.license.padEnd(12)} ${String(source.icons.length).padStart(3)} variants`);
}
console.log(`\nWrote ${path.relative(ROOT, DATA_OUT)} and ${path.relative(ROOT, CREDITS_OUT)}.`);
