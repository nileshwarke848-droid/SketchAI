// Final report data for Task D: what came from where, and what changed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getArtworkVariants, normaliseLabel } from '../src/data/artwork.js';
import { categories } from '../src/data/categories.js';
import { LINE_ART } from '../src/data/line-art.js';
import { IMPORTED_ART } from '../src/data/imported-art.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CREDITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/oss-art-credits.json'), 'utf8'));

const srcByLabel = {};
for (const [id, c] of Object.entries(CREDITS)) {
  for (const e of c.categories) srcByLabel[e.label] = { lib: id, name: c.name, license: c.license, mode: e.mode };
}

console.log('SOURCING');
console.log('-'.repeat(64));
for (const [id, c] of Object.entries(CREDITS)) {
  console.log(`${c.name} ${c.version}`);
  console.log(`  location : ${c.url}`);
  console.log(`  licence  : ${c.license}`);
  console.log(`  used by  : ${c.categories.length} categories (${[...new Set(c.categories.map((x) => x.mode))].join(', ')})`);
}

const modes = {};
for (const v of Object.values(srcByLabel)) modes[v.mode] = (modes[v.mode] ?? 0) + 1;
console.log(`\nrendering mode totals: ${JSON.stringify(modes)}`);

console.log('\nDEMO-CRITICAL / HIGH-PRIORITY sources');
console.log('-'.repeat(64));
const PRIORITY = ['dog', 'cat', 'house', 'car', 'bus', 'airplane', 'fish', 'tree', 'flower', 'sun',
  'umbrella', 'zebra', 'train', 'guitar', 'shoe', 'elephant', 'lion', 'bicycle', 'bird', 'sailboat',
  'chair', 'clock', 'cloud', 'cup', 'door', 'eye', 'face', 'hand', 'key', 'moon', 'cell phone', 'star', 'table'];
for (const label of PRIORITY) {
  const s = srcByLabel[label];
  const primary = getArtworkVariants(label)[0];
  const full = ['dog', 'cat', 'zebra', 'elephant', 'lion'].includes(label);
  console.log(
    `  ${label.padEnd(11)} ${s ? `${s.name} (${s.license}) ${s.mode}` : 'NO SOURCE — legacy fallback'}`
    + `${full ? '   [whole animal]' : ''}`
    + `   primary=${primary?.origin ?? 'none'}`,
  );
}

// What the primary artwork used to be, before the imports took over.
let replacedCustom = 0; let replacedEmoji = 0; let newCover = 0; let stillNone = 0;
for (const c of categories) {
  const label = normaliseLabel(c.label); // IMPORTED_ART is keyed lower case
  const was = LINE_ART[label] ? 'lineart' : 'icon';
  const nowImported = Boolean(IMPORTED_ART[label]);
  if (nowImported) {
    if (was === 'lineart') replacedCustom++;
    else { replacedEmoji++; newCover++; }
  } else { stillNone++; }
}
console.log('\nREPLACEMENTS');
console.log('-'.repeat(64));
console.log(`  categories led by imported artwork      : ${Object.keys(IMPORTED_ART).length}/${categories.length}`);
console.log(`  replaced a hand-authored drawing        : ${replacedCustom}`);
console.log(`  replaced an emoji/icon primary          : ${replacedEmoji}`);
console.log(`  no imported drawing (legacy fallback)   : ${stillNone}`);
console.log(`  no imported drawing for                 : ${categories.filter((c) => !IMPORTED_ART[normaliseLabel(c.label)]).map((c) => c.label).join(', ')}`);
