// Builds src/data/imported-art.js from the open-source icon libraries in
// /home/user/iconsrc.
//
// Run: node scripts/build-oss-art.mjs
//
// For every Quick, Draw! category it finds a source drawing, normalises it into
// SketchAI's visual system and writes it out in the same {w, h, b} shape as
// src/data/line-art.js, using the literal token STROKE for the pen colour.
//
// Normalisation lives in scripts/oss-art-lib.mjs so the variant builder
// (scripts/build-oss-art-variants.mjs) applies exactly the same rules:
//   * every drawing is fitted to the ink it actually puts on the page, then
//     centred and scaled into one 24x24 grid with a 1.5 unit margin, so a small
//     icon and a large one sit at the same optical size
//   * stroke libraries keep their outlines; solid silhouettes are drawn as
//     outlines so nothing is "heavily filled"
//   * stroke width is compensated for the fit scale, so every drawing ends up
//     with the same apparent line weight
import fs from 'node:fs';
import path from 'node:path';
import { SOURCES, MAP, SKIP_IMPORTED_ART } from './oss-art-sources.mjs';
import { buildDrawing, iconIndex, sourcesAvailable } from './oss-art-lib.mjs';

const ROOT = process.cwd();

if (!sourcesAvailable()) {
  console.error('\n✖ One or more pinned icon sources are missing from the cache.');
  console.error('  Rebuild the cache with: node scripts/fetch-icon-sources.mjs\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const labels = fs
  .readFileSync(path.join(ROOT, 'src/data/quickdraw-categories.txt'), 'utf8')
  .split(/\r?\n/)
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const STROKE_LIBS = ['tabler', 'lucide', 'iconoir'];
const FILL_LIBS = ['mdi', 'fontawesome'];

const idx = iconIndex().svg;

/** Auto candidate: exact name match, stroke libraries first. */
function autoCandidate(label) {
  const slug = label.replace(/[^a-z0-9]+/g, '-');
  for (const lib of STROKE_LIBS) if (idx[lib]?.has(slug)) return [lib, slug];
  for (const lib of FILL_LIBS) if (idx[lib]?.has(slug)) return [lib, slug];
  // Game Icons is the last resort: game-asset styling, used only when nothing
  // cleaner ships the object.
  if (idx.gameicons?.has(slug)) return ['gameicons', slug];
  return null;
}

const entries = [];
const credits = {};
const problems = [];

for (const label of labels) {
  if (SKIP_IMPORTED_ART.has(label)) continue;
  const spec = MAP[label] ?? autoCandidate(label);
  if (!spec) continue;

  const built = buildDrawing(spec);
  if (built.error) { problems.push(`${label}: ${built.error}`); continue; }

  entries.push({ label, lib: built.lib, key: built.key, mode: built.mode, scale: built.scale, svg: built.svg });

  (credits[built.lib] ??= { ...SOURCES[built.lib], icons: [] }).icons.push({ label, icon: built.key, mode: built.mode });
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const banner = `// Clean line drawings imported from openly licensed icon libraries —
// the primary artwork SketchAI suggests.
//
// GENERATED FILE — do not edit by hand.
// Rebuild with: node scripts/build-oss-art.mjs
//
// SketchAI is "rough sketch -> cleaner drawing of the same object", so these
// are whole objects drawn as outlines: one 24x24 grid, one stroke weight, no
// heavy fills. The literal token STROKE is replaced with currentColor (card
// preview) or the brush colour (inserted artwork) at render time.
//
// Sources (see scripts/oss-art-sources.mjs for the full registry):
`;
const creditLines = Object.entries(credits)
  .map(([id, c]) => ` *   ${c.name} ${c.version} — ${c.license} — ${c.url} (${c.icons.length})`)
  .join('\n');

const body = entries
  .map((e) => `  ${JSON.stringify(e.label)}: {\n    w: 24,\n    h: 24,\n    b: ${JSON.stringify(e.svg)},\n  },`)
  .join('\n');

const out = `${banner}/*\n${creditLines}
 */
//
// Keyed by the canonical Quick, Draw! label (lower case).

export const IMPORTED_ART = {
${body}
};

export const IMPORTED_ART_LABELS = Object.keys(IMPORTED_ART);
export const IMPORTED_ART_COUNT = IMPORTED_ART_LABELS.length;
`;

fs.writeFileSync(path.join(ROOT, 'src/data/imported-art.js'), out);

const registry = {};
for (const [id, c] of Object.entries(credits)) {
  registry[id] = {
    name: c.name,
    version: c.version,
    license: c.license,
    copyright: c.copyright,
    url: c.url,
    categories: c.icons.map(({ label, icon, mode }) => ({ label, icon, mode })),
  };
}
fs.writeFileSync(
  path.join(ROOT, 'scripts/oss-art-credits.json'),
  `${JSON.stringify(registry, null, 2)}\n`,
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log(`imported drawings: ${entries.length} / ${labels.length} categories`);
console.log('');
for (const [id, c] of Object.entries(credits).sort((a, b) => b[1].icons.length - a[1].icons.length)) {
  console.log(`  ${c.name.padEnd(24)} ${c.license.padEnd(12)} ${String(c.icons.length).padStart(4)} categories`);
}
console.log('');
const byMode = entries.reduce((acc, e) => ((acc[e.mode] = (acc[e.mode] ?? 0) + 1), acc), {});
console.log(`  kept as outlines: ${byMode.stroke ?? 0}   converted silhouettes: ${byMode.outline ?? 0}`);
if (problems.length) {
  console.log(`\nproblems (${problems.length}):`);
  for (const p of problems) console.log(`  - ${p}`);
}
const missing = labels.filter((l) => !entries.some((e) => e.label === l));
console.log(`\nno imported drawing: ${missing.length}`);
console.log(`  ${missing.join(', ')}`);
