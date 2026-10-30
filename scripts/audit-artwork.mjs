#!/usr/bin/env node
// Reports how much of the 345-class label space has usable artwork.
//
//   node scripts/audit-artwork.mjs
//
// Used to track artwork coverage: direct icons vs stand-ins vs text-only cards,
// and how many categories offer more than one visual variant.

import { categories } from '../src/data/categories.js';
import { ICONS } from '../src/data/icons.js';

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

console.log();
console.log('Tier C (text-only) categories:');
console.log('  ' + byTier.C.map((c) => c.label).join(', '));
