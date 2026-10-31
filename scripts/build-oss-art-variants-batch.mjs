#!/usr/bin/env node
// Build the separately reviewed Batch-2 or Batch-3 source variants.
//
//   node scripts/build-oss-art-variants-batch.mjs --batch=2
//   node scripts/build-oss-art-variants-batch.mjs --batch=3
//
// The maps are hand-reviewed; this script does not fuzzy-match, auto-fill, or
// modify the Batch-1 variant files. The normaliser is shared with the primary
// artwork builder, and generated output/credits are deterministic.
import fs from 'node:fs';
import path from 'node:path';
import { ART_VARIANT_MAP_BATCH2 } from './oss-art-variant-map-batch2.mjs';
import { ART_VARIANT_MAP_BATCH3 } from './oss-art-variant-map-batch3.mjs';
import { SOURCES } from './oss-art-sources.mjs';
import { buildDrawing, sourcesAvailable } from './oss-art-lib.mjs';

const ROOT = process.cwd();
const batchArg = process.argv.find((arg) => arg.startsWith('--batch='));
const batch = Number(batchArg?.split('=')[1]);
const configs = {
  2: { from: 100, to: 200, map: ART_VARIANT_MAP_BATCH2 },
  3: { from: 200, to: 345, map: ART_VARIANT_MAP_BATCH3 },
};
const config = configs[batch];
if (!config) {
  console.error('Usage: node scripts/build-oss-art-variants-batch.mjs --batch=2|3');
  process.exit(2);
}
const DATA_OUT = path.join(ROOT, `src/data/imported-art-variants-batch${batch}.js`);
const CREDITS_OUT = path.join(ROOT, `scripts/oss-art-variant-credits-batch${batch}.json`);
const canonical = fs.readFileSync(path.join(ROOT, 'src/data/quickdraw-categories.txt'), 'utf8')
  .split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean);
const inScope = new Set(canonical.slice(config.from, config.to));

if (!sourcesAvailable()) {
  console.error('\n✖ Pinned icon source cache is missing.');
  console.error('  Rebuild it with: node scripts/fetch-icon-sources.mjs\n');
  process.exit(1);
}

const primaryCredits = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/oss-art-credits.json'), 'utf8'));
const primaryByLabel = new Map();
for (const [lib, source] of Object.entries(primaryCredits)) {
  for (const item of source.categories ?? []) primaryByLabel.set(item.label, `${lib}/${item.icon}`);
}

const entries = [];
const credits = {};
const problems = [];
const requested = Object.values(config.map).reduce((sum, specs) => sum + specs.length, 0);
for (const [label, specs] of Object.entries(config.map)) {
  if (!inScope.has(label)) {
    problems.push(`${label}: outside canonical Batch ${batch} range ${config.from + 1}–${config.to}`);
    continue;
  }
  const byLabel = [];
  const seen = new Set();
  for (const spec of specs) {
    const [lib, key] = spec;
    const pair = `${lib}/${key}`;
    if (seen.has(pair)) {
      problems.push(`${label}: duplicate supplemental source ${pair}`);
      continue;
    }
    if (!SOURCES[lib]) {
      problems.push(`${label}: unknown source library ${lib}`);
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
    byLabel.push({ w: 24, h: 24, b: built.svg, lib, key, mode: built.mode });
    (credits[lib] ??= { ...SOURCES[lib], icons: [] }).icons.push({ label, icon: key, mode: built.mode });
  }
  if (byLabel.length) entries.push([label, byLabel]);
}

if (problems.length) {
  console.error(`\n✖ ${problems.length} Batch-${batch} variant mapping problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const sourceLines = entries.map(([label, list]) => {
  const art = list.map((entry) =>
    `    { w: 24, h: 24, b: ${JSON.stringify(entry.b)}, lib: ${JSON.stringify(entry.lib)}, key: ${JSON.stringify(entry.key)}, mode: ${JSON.stringify(entry.mode)} },`,
  ).join('\n');
  return `  ${JSON.stringify(label)}: [\n${art}\n  ],`;
}).join('\n');
const counts = Object.entries(credits)
  .map(([id, source]) => ` *   ${source.name} ${source.version} — ${source.license} — ${source.url} (${source.icons.length})`)
  .join('\n');
const generated = `// Supplementary open-source artwork for canonical Quick, Draw! categories ${config.from + 1}–${config.to}.
// GENERATED FILE — do not edit by hand.
// Rebuild with: node scripts/build-oss-art-variants-batch.mjs --batch=${batch}
//
// Each drawing uses the same pinned-source normaliser and 24×24 line-art grid
// as the primary artwork. Its literal STROKE token follows the user's brush.
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
console.log(`Batch ${batch} (${config.from + 1}–${config.to}): ${requested} requested / ${entries.reduce((n, [, list]) => n + list.length, 0)} built`);
for (const [id, source] of Object.entries(credits).sort((a, b) => b[1].icons.length - a[1].icons.length)) {
  console.log(`  ${source.name.padEnd(24)} ${source.license.padEnd(12)} ${String(source.icons.length).padStart(3)} variants`);
}
console.log(`\nWrote ${path.relative(ROOT, DATA_OUT)} and ${path.relative(ROOT, CREDITS_OUT)}.`);
