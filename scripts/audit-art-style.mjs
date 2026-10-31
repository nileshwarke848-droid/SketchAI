#!/usr/bin/env node
// Classifies every category's primary artwork against the new art direction:
//
//   1 GOOD LINE ART        stroke-based, monochrome, drawn not icon-y
//   2 ACCEPTABLE ICON-LIKE monochrome but fill-based (Material-style UI icon)
//   3 EMOJI / DECORATIVE   carries literal colours -> must be replaced
//   4 WRONG REPRESENTATION shows a part where the whole object is meant
//   5 TEXT ONLY            no artwork at all
//
// Buckets 1-3 and 5 are detected from the SVG body. Bucket 4 is a hand-curated
// list: an icon can be perfectly drawn and still be the wrong thing to swap in
// for somebody's sketch (a dog *face* where they drew a dog).
//
//   node scripts/audit-art-style.mjs

import { categories } from '../src/data/categories.js';
import { ICONS } from '../src/data/icons.js';
import { getArtworkVariants } from '../src/data/artwork.js';
import { LINE_ART } from '../src/data/line-art.js';

// Canonical labels whose bundled icon shows only a *part* of what a person
// would draw. A face/head is not a whole animal.
const PARTIAL_REPRESENTATION = new Set([
  'dog', 'cat', 'cow', 'rabbit', 'pig', 'mouse', 'monkey', 'panda',
  'tiger', 'lion', 'elephant', 'horse', 'sheep', 'fox', 'bear', 'frog',
  'chicken', 'penguin', 'owl', 'bat', 'raccoon', 'zebra', 'giraffe',
  'crocodile', 'rhinoceros', 'squirrel', 'hedgehog', 'whale', 'dolphin',
  'shark', 'fish', 'bird', 'parrot', 'flamingo', 'duck', 'swan', 'eagle',
  'peacock', 'crab', 'snail', 'spider', 'bee', 'butterfly', 'ant', 'snake',
  'teddy-bear', 'face', 'smiley face', 'cat face', 'eye', 'hand', 'foot',
  'ear', 'nose', 'toe', 'elbow', 'arm', 'leg', 'beard', 'goatee', 'tooth',
  'brain', 'skull', 'hair', 'mouth', 'finger', 'arm', 'body',
]);

function classifyIcon(icon) {
  if (!icon) return { bucket: 5, why: 'no artwork' };
  const body = icon.b;
  const colours = (body.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length;
  const usesCurrentColor = /currentColor/.test(body);
  const strokeAttrs = (body.match(/stroke="/g) ?? []).length;

  if (colours > 0) {
    return { bucket: 3, why: `${colours} literal colours — decorative/emoji` };
  }
  if (usesCurrentColor && strokeAttrs > 0) {
    return { bucket: 1, why: 'monochrome stroke-based line art' };
  }
  if (usesCurrentColor) {
    return { bucket: 2, why: 'monochrome but fill-based (UI icon)' };
  }
  return { bucket: 2, why: 'monochrome, unclassified' };
}

const rows = categories.map((category) => {
  const icon = category.key ? ICONS[category.key] : null;
  const base = classifyIcon(icon);
  // Judge the artwork the card actually shows first.
  const primary = getArtworkVariants(category.label)[0] ?? null;
  const key = category.label.toLowerCase();

  let bucket;
  let why;
  if (!primary) {
    bucket = 5;
    why = 'no artwork at all';
  } else if (primary.origin === 'derived') {
    bucket = 1;
    why = 'original SketchAI-derived line drawing (no suitable approved source)';
  } else if (primary.origin === 'imported' || primary.origin === 'imported-variant') {
    bucket = 1;
    why = 'line drawing from an openly licensed icon library';
  } else if (primary.origin === 'lineart' || primary.origin === 'variant') {
    bucket = 1;
    why = primary.origin === 'lineart' ? 'SketchAI line-art drawing' : 'hand-authored line art';
  } else if (primary.source === 'mdi') {
    bucket = 2;
    why = 'monochrome Material icon';
  } else {
    bucket = 3;
    why = 'colour emoji — decorative';
  }

  // A correct-looking icon is still wrong if it shows a part where the whole
  // object was meant.
  const partial = PARTIAL_REPRESENTATION.has(key) && bucket !== 1;
  if (partial) why = 'shows only part of the object';

  return {
    label: category.label,
    tier: category.tier ?? 'C',
    source: category.source,
    baseBucket: base.bucket,
    bucket: partial ? 4 : bucket,
    hasLineArtVariant: Boolean(LINE_ART[key]),
    options: getArtworkVariants(category.label).length,
    why,
  };
});

const names = { 1: 'GOOD LINE ART', 2: 'ACCEPTABLE ICON-LIKE', 3: 'EMOJI / DECORATIVE', 4: 'WRONG REPRESENTATION', 5: 'TEXT ONLY' };
const counts = {};
for (const row of rows) counts[row.bucket] = (counts[row.bucket] ?? 0) + 1;

console.log('Art direction audit — current primary artwork');
console.log('='.repeat(64));
console.log(`categories: ${rows.length}\n`);
for (const key of [1, 2, 3, 4, 5]) {
  const pct = ((counts[key] ?? 0) / rows.length * 100).toFixed(1);
  console.log(`${key}. ${names[key].padEnd(24)} ${String(counts[key] ?? 0).padStart(4)}  (${pct}%)`);
}

console.log('\nBy icon source:');
const bySource = {};
for (const row of rows) {
  const key = row.source ?? 'none';
  bySource[key] = bySource[key] ?? { ...{} };
  bySource[key][row.bucket] = (bySource[key][row.bucket] ?? 0) + 1;
}
for (const [source, buckets] of Object.entries(bySource)) {
  const parts = Object.entries(buckets).map(([b, n]) => `${b}:${n}`).join(' ');
  console.log(`  ${source.padEnd(8)} ${parts}`);
}

console.log('\nDEMO-CRITICAL categories (must look excellent):');
const demo = ['dog', 'cat', 'house', 'car', 'bus', 'airplane', 'fish', 'tree', 'flower', 'sun', 'umbrella'];
for (const label of demo) {
  const row = rows.find((r) => r.label === label);
  console.log(`  ${label.padEnd(10)} bucket ${row.bucket} (${names[row.bucket]})  lineArt=${row.hasLineArtVariant}  ${row.why}`);
}

console.log('\nCOMMON objects:');
const common = ['train', 'guitar', 'shoe', 'elephant', 'lion', 'bicycle', 'bird', 'sailboat', 'chair', 'clock', 'cloud', 'cup', 'door', 'eye', 'face', 'hand', 'key', 'moon', 'cell phone', 'star', 'table'];
for (const label of common) {
  const row = rows.find((r) => r.label === label);
  if (!row) { console.log(`  ${label.padEnd(12)} (not a category)`); continue; }
  console.log(`  ${label.padEnd(12)} bucket ${row.bucket} (${names[row.bucket]})  lineArt=${row.hasLineArtVariant}`);
}

const replace = rows.filter((r) => r.bucket === 3 || r.bucket === 4);
console.log(`\nTotal to replace as primary: ${replace.length}`);
