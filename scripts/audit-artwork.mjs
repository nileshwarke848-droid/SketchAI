#!/usr/bin/env node
// Reports how much of the 345-class label space has usable artwork.
//
//   node scripts/audit-artwork.mjs
//
// Used to track artwork coverage: direct icons vs stand-ins vs text-only cards,
// and how many categories offer more than one visual variant.

import { categories } from '../src/data/categories.js';
import { ICONS } from '../src/data/icons.js';
import { getArtworkVariants } from '../src/data/artwork.js';

const byTier = { A: [], B: [], C: [] };
let missingIcon = 0;

for (const category of categories) {
  const tier = category.tier ?? 'C';
  (byTier[tier] ?? byTier.C).push(category);
  if (category.key && !ICONS[category.key]) missingIcon += 1;
}

const withKey = categories.filter((c) => c.key && ICONS[c.key]);
const noKey = categories.filter((c) => !c.key || !ICONS[c.key]);

console.log('Artwork coverage audit');
console.log('='.repeat(60));
console.log(`categories total        : ${categories.length}`);
console.log(`distinct icon keys      : ${Object.keys(ICONS).length}`);
console.log();
console.log(`tier A  direct artwork  : ${byTier.A.length}`);
console.log(`tier B  stand-in        : ${byTier.B.length}`);
console.log(`tier C  text fallback   : ${byTier.C.length}`);
console.log(`usable icon present     : ${withKey.length}`);
console.log(`no usable icon          : ${noKey.length}`);
console.log(`key set but icon missing: ${missingIcon}`);
console.log();

const bySource = {};
for (const category of withKey) {
  bySource[category.source] = (bySource[category.source] ?? 0) + 1;
}
console.log('icons by source:', bySource);

// Variant support: keys that look like `family-1`, `family-2`, …
const families = new Map();
for (const key of Object.keys(ICONS)) {
  const match = /^(.*?)-(\d+)$/.exec(key);
  if (match) {
    const [, family] = match;
    families.set(family, (families.get(family) ?? 0) + 1);
  }
}
const multiVariant = [...families.entries()].filter(([, count]) => count > 1);
console.log(`multi-variant icon families: ${multiVariant.length}`);

// --- real coverage through the variants API --------------------------------
// getArtworkVariants() is what the suggestion bar actually renders, so this is
// the number that matters: a label with a hand-authored variant is no longer a
// text-only card even when its tier is C.
const optionCounts = categories.map((c) => ({
  label: c.label,
  tier: c.tier ?? 'C',
  options: getArtworkVariants(c.label).length,
}));
const withArtwork = optionCounts.filter((c) => c.options > 0);
const noArtwork = optionCounts.filter((c) => c.options === 0);
const multi = optionCounts.filter((c) => c.options > 1).sort((a, b) => b.options - a.options);

console.log();
console.log('--- effective coverage (what the suggestion bar renders) ---');
console.log(`categories with artwork : ${withArtwork.length}`);
console.log(`categories text-only    : ${noArtwork.length}`);
console.log(`categories with variants: ${multi.length}`);
console.log(`total artwork options   : ${optionCounts.reduce((n, c) => n + c.options, 0)}`);
console.log();
console.log('Variant depth distribution:');
const depth = {};
for (const c of optionCounts) depth[c.options] = (depth[c.options] ?? 0) + 1;
for (const [count, n] of Object.entries(depth).sort((a, b) => a[0] - b[0])) {
  console.log(`  ${count} option(s): ${n} categories`);
}
console.log();
console.log('Multi-variant categories (top 12):');
console.log('  ' + multi.slice(0, 12).map((c) => `${c.label} (${c.options})`).join(', '));

console.log();
console.log('Text-only categories after variants:');
console.log('  ' + noArtwork.map((c) => c.label).join(', '));
