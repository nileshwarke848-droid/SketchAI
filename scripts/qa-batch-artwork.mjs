#!/usr/bin/env node
// Deterministic QA for one reviewed artwork expansion phase.
//
//   node scripts/qa-batch-artwork.mjs --batch=2
//   node scripts/qa-batch-artwork.mjs --batch=3
//
// Batch 1 has its own frozen QA in qa-batch1-artwork.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { IMPORTED_ART } from '../src/data/imported-art.js';
import { BATCH2_DERIVED_ART } from '../src/data/batch2-derived-art.js';
import { BATCH3_DERIVED_ART } from '../src/data/batch3-derived-art.js';
import { IMPORTED_ART_VARIANTS as BATCH2_VARIANTS, IMPORTED_ART_VARIANT_COUNT as BATCH2_VARIANT_COUNT } from '../src/data/imported-art-variants-batch2.js';
import { IMPORTED_ART_VARIANTS as BATCH3_VARIANTS, IMPORTED_ART_VARIANT_COUNT as BATCH3_VARIANT_COUNT } from '../src/data/imported-art-variants-batch3.js';
import { getArtworkVariants, variantToSvgString } from '../src/data/artwork.js';
import { qualityIssues } from './oss-art-lib.mjs';
import { ART_VARIANT_MAP_BATCH2 } from './oss-art-variant-map-batch2.mjs';
import { ART_VARIANT_MAP_BATCH3 } from './oss-art-variant-map-batch3.mjs';
import { labelsForBatch, MANUAL_EXCLUSIONS, reviewCategory, summarizeBatch } from './batch-artwork-review.mjs';

const batchFlag = process.argv.find((arg) => arg.startsWith('--batch='));
const batch = Number(batchFlag?.split('=')[1]);
if (![2, 3].includes(batch)) {
  console.error('Usage: node scripts/qa-batch-artwork.mjs --batch=2|3');
  process.exit(2);
}
const ROOT = path.resolve(import.meta.dirname, '..');
const fail = [];
const labels = labelsForBatch(batch);
const canonical = fs.readFileSync(path.join(ROOT, 'src/data/quickdraw-categories.txt'), 'utf8')
  .split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean);
const expected = batch === 2 ? { start: 100, end: 200 } : { start: 200, end: 345 };
const variantMap = batch === 2 ? ART_VARIANT_MAP_BATCH2 : ART_VARIANT_MAP_BATCH3;
const generatedVariants = batch === 2 ? BATCH2_VARIANTS : BATCH3_VARIANTS;
const generatedCount = batch === 2 ? BATCH2_VARIANT_COUNT : BATCH3_VARIANT_COUNT;
const creditsPath = path.join(ROOT, `scripts/oss-art-variant-credits-batch${batch}.json`);
const variantCredits = JSON.parse(fs.readFileSync(creditsPath, 'utf8'));
const primaryCredits = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/oss-art-credits.json'), 'utf8'));
const primaryForBatch = new Map();
for (const [lib, source] of Object.entries(primaryCredits)) {
  for (const item of source.categories ?? []) primaryForBatch.set(item.label, `${lib}/${item.icon}`);
}
const derivedForBatch = batch === 2 ? BATCH2_DERIVED_ART : BATCH3_DERIVED_ART;
const review = summarizeBatch(batch);

if (canonical.length !== 345) fail.push(`canonical category file must contain 345 labels (found ${canonical.length})`);
if (labels.length !== expected.end - expected.start) fail.push(`Batch ${batch} range has ${labels.length} labels, expected ${expected.end - expected.start}`);
if (labels.some((label, i) => label !== canonical[expected.start + i])) fail.push(`Batch ${batch} review order does not match canonical indices`);
if (review.rows.some((row, i) => row.label !== labels[i])) fail.push(`Batch ${batch} review summary does not match its canonical labels`);

const mapLabels = Object.keys(variantMap).sort();
const generatedLabels = Object.keys(generatedVariants).sort();
if (JSON.stringify(mapLabels) !== JSON.stringify(generatedLabels)) fail.push(`Batch ${batch} generated variant labels do not match the curated map`);
const mapVariantCount = Object.values(variantMap).reduce((sum, variants) => sum + variants.length, 0);
if (generatedCount !== mapVariantCount) fail.push(`Batch ${batch} exported variant count ${generatedCount} != map count ${mapVariantCount}`);
const generatedVariantCount = Object.values(generatedVariants).flat().length;
if (generatedVariantCount !== generatedCount) fail.push(`Batch ${batch} generated data count ${generatedVariantCount} != exported count ${generatedCount}`);
for (const label of mapLabels) {
  if (!labels.includes(label)) fail.push(`Batch ${batch} source map is out of range: ${label}`);
}
for (const [lib, source] of Object.entries(variantCredits)) {
  for (const item of source.categories ?? []) {
    if (!labels.includes(item.label)) fail.push(`Batch ${batch} variant credit is out of range: ${item.label}`);
    const expectedPair = `${lib}/${item.icon}`;
    if (!(variantMap[item.label] ?? []).some(([sourceLib, key]) => `${sourceLib}/${key}` === expectedPair)) {
      fail.push(`Batch ${batch} credit has no matching map entry: ${item.label}/${expectedPair}`);
    }
  }
}
const creditedPairs = new Set(Object.entries(variantCredits).flatMap(([lib, source]) =>
  (source.categories ?? []).map((item) => `${item.label}/${lib}/${item.icon}`)));
for (const [label, variants] of Object.entries(generatedVariants)) {
  for (const item of variants) {
    if (!creditedPairs.has(`${label}/${item.lib}/${item.key}`)) fail.push(`Batch ${batch} missing license credit: ${label}/${item.lib}/${item.key}`);
    if (primaryForBatch.get(label) === `${item.lib}/${item.key}`) fail.push(`Batch ${batch} variant duplicates its primary source: ${label}/${item.lib}/${item.key}`);
    const issues = qualityIssues({ ...item, origin: 'imported-variant' });
    if (issues.length) fail.push(`${label}/${item.lib}/${item.key}: ${issues.join('; ')}`);
  }
}
for (const [label, art] of Object.entries(derivedForBatch)) {
  if (!labels.includes(label)) fail.push(`Batch ${batch} derived art is out of range: ${label}`);
  const issues = qualityIssues({ ...art, origin: 'derived' });
  if (issues.length) fail.push(`${label}/derived: ${issues.join('; ')}`);
}

for (const [label, exclusions] of Object.entries(MANUAL_EXCLUSIONS[batch] ?? {})) {
  if (!labels.includes(label)) fail.push(`Batch ${batch} manual exclusion is out of range: ${label}`);
  const ids = new Set(getArtworkVariants(label, { max: 64 }).map((item) => item.id));
  for (const [id, reason] of Object.entries(exclusions)) {
    if (!ids.has(id)) fail.push(`Batch ${batch} stale manual exclusion: ${label}/${id}`);
    if (!reason.trim()) fail.push(`Batch ${batch} exclusion is undocumented: ${label}/${id}`);
  }
}

let checkedOptions = 0;
for (const row of review.rows) {
  for (const option of row.options) {
    checkedOptions++;
    const issues = qualityIssues(option);
    if (issues.length) fail.push(`${row.label}/${option.id}: ${issues.join('; ')}`);
    const svg = variantToSvgString(option, { size: 46, color: '#e26755' });
    if (!svg?.startsWith('<svg ')) fail.push(`${row.label}/${option.id}: missing SVG wrapper`);
    if (/STROKE|NaN|Infinity|undefined/.test(svg ?? '')) fail.push(`${row.label}/${option.id}: unresolved SVG token/geometry`);
  }
}
const bucketTotal = review.counts.threePlus + review.counts.exactlyTwo + review.counts.exactlyOne + review.counts.zero;
if (bucketTotal !== labels.length) fail.push(`Batch ${batch} option buckets sum to ${bucketTotal}, not ${labels.length}`);
const unknownImported = Object.keys(IMPORTED_ART).filter((label) => !canonical.includes(label));
if (unknownImported.length) fail.push(`imported art includes noncanonical labels: ${unknownImported.join(', ')}`);

const totalOptions = review.rows.reduce((sum, row) => sum + row.options.length, 0);
const underThree = review.rows.filter((row) => row.options.length < 3);
const categoryOffset = expected.start + 1;
console.log(`Batch ${batch} artwork QA — canonical categories ${categoryOffset}–${expected.end}`);
console.log('='.repeat(68));
console.log(`clean primary/option coverage: ${review.rows.filter((row) => row.primary).length}/${labels.length}`);
console.log(`distinct options after raster + human exclusions: 3+:${review.counts.threePlus}  2:${review.counts.exactlyTwo}  1:${review.counts.exactlyOne}  0:${review.counts.zero}`);
console.log(`total distinct options: ${totalOptions}; options quality-checked: ${checkedOptions}`);
console.log(`approved source variants: ${generatedCount} across ${generatedLabels.length} labels; custom/derived drawings: ${Object.keys(derivedForBatch).length}; manual exclusions: ${Object.values(MANUAL_EXCLUSIONS[batch] ?? {}).reduce((sum, item) => sum + Object.keys(item).length, 0)}`);
console.log(`categories with fewer than 3 options: ${underThree.length}`);
for (const row of underThree) console.log(`  ${String(canonical.indexOf(row.label) + 1).padStart(3, '0')}. ${row.label} — ${row.options.length}`);
if (fail.length) {
  console.error(`\n✖ ${fail.length} Batch-${batch} QA failure(s):`);
  for (const item of fail) console.error(`  - ${item}`);
  process.exitCode = 1;
} else {
  console.log(`\n✔ Batch-${batch} artwork checks passed.`);
}
