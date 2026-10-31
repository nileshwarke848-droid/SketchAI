#!/usr/bin/env node
// Proves each inserted editable object preserves the exact geometry shown in
// its suggestion-card preview. Object color is editable, so paint tokens may
// differ, but paths and viewBox remain derived from the same artwork variant.
//
//   node scripts/test-preview-insert-match.mjs

import { getArtworkVariants, variantToEditableSvgString } from '../src/data/artwork.js';
import { categories } from '../src/data/categories.js';

const BRUSH = '#e26755';

/** Origins rendered as line art (pen-coloured, no fill). */
const LINE_ORIGINS = ['imported', 'imported-variant', 'derived', 'lineart', 'variant'];

/** Exactly what SuggestionBar's VariantArt renders into the card. */
function cardBody(variant) {
  if (LINE_ORIGINS.includes(variant.origin)) return variant.b.replaceAll('STROKE', 'currentColor');
  if (variant.source === 'mdi') return `<g fill="currentColor">${variant.b}</g>`;
  return variant.b;
}

/** Colour/token-agnostic comparison: geometry only. */
function normalise(markup) {
  return markup
    .replaceAll('currentColor', 'COLOR')
    .replaceAll(BRUSH, 'COLOR')
    .replace(/#[0-9a-fA-F]{3,8}/g, 'COLOR')
    .replace(/^<g fill="COLOR"(?: stroke="COLOR")?>/, '')
    .replace(/<\/g>$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

let checked = 0;
let mismatched = 0;
const failures = [];

for (const category of categories) {
  const variants = getArtworkVariants(category.label);
  variants.forEach((variant, index) => {
    const preview = normalise(cardBody(variant));
    // The object SVG wrapper differs only in paint policy; compare body geometry.
    const objectColor = variant.origin === 'icon' && variant.source !== 'mdi' ? 'original' : BRUSH;
    const full = variantToEditableSvgString(variant, { size: 320, color: objectColor });
    const inner = full.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    const inserted = normalise(inner);
    checked += 1;
    if (preview !== inserted) {
      mismatched += 1;
      if (failures.length < 10) {
        failures.push(`${category.label} #${index + 1} (${variant.origin})`);
      }
    }
  });
}

console.log('Preview vs insertion match');
console.log('='.repeat(52));
console.log(`artwork options checked : ${checked}`);
console.log(`mismatches              : ${mismatched}`);
if (failures.length) {
  console.log();
  for (const failure of failures) console.log(`  ! ${failure}`);
}

// Also confirm the primary is line art for the categories that matter.
const demo = ['dog', 'cat', 'house', 'car', 'bus', 'airplane', 'fish', 'tree', 'flower', 'sun', 'umbrella'];
const notLineArt = demo.filter(
  (label) => !LINE_ORIGINS.includes(getArtworkVariants(label)[0]?.origin),
);
console.log();
console.log(`demo categories whose primary is line art : ${demo.length - notLineArt.length}/${demo.length}`);
const importedCount = categories.filter(
  (c) => getArtworkVariants(c.label)[0]?.origin === 'imported',
).length;
console.log(`categories led by imported artwork        : ${importedCount}/${categories.length}`);
if (notLineArt.length) console.log(`  ! not line art: ${notLineArt.join(', ')}`);

process.exitCode = mismatched === 0 && notLineArt.length === 0 ? 0 : 1;
