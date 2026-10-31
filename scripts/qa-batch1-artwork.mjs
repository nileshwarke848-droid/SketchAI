#!/usr/bin/env node
// Final Batch-1 artwork gate: scope, coverage, reproducibility metadata, SVG
// health, and conservative distinct-option counts. This does not touch any
// model/training/canvas code and never promotes a fallback icon or emoji.
import fs from 'node:fs';
import path from 'node:path';
import { ART_VARIANT_MAP } from './oss-art-variant-map.mjs';
import { IMPORTED_ART } from '../src/data/imported-art.js';
import {
  IMPORTED_ART_VARIANTS,
  IMPORTED_ART_VARIANT_COUNT,
  IMPORTED_ART_VARIANT_LABELS,
} from '../src/data/imported-art-variants.js';
import { BATCH1_DERIVED_ART } from '../src/data/batch1-derived-art.js';
import { getArtworkVariants, variantToSvgString } from '../src/data/artwork.js';
import { qualityIssues } from './oss-art-lib.mjs';
import {
  BATCH1_LABELS,
  MANUAL_EXCLUSIONS,
  reviewBatch1Category,
  summarizeBatch1,
} from './batch1-artwork-review.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const fail = [];
const canonical = fs.readFileSync(path.join(ROOT, 'src/data/quickdraw-categories.txt'), 'utf8')
  .split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean);
const batch1 = new Set(canonical.slice(0, 100));
const { rows, counts } = summarizeBatch1();

if (canonical.length !== 345) fail.push(`expected 345 canonical labels, found ${canonical.length}`);
if (BATCH1_LABELS.length !== 100 || new Set(BATCH1_LABELS).size !== 100) {
  fail.push(`Batch 1 scope must be exactly 100 unique labels (found ${BATCH1_LABELS.length})`);
}
if (rows.some((row, i) => row.label !== canonical[i])) fail.push('review rows do not match canonical category order');

const outside = (labels) => labels.filter((label) => !batch1.has(label));
for (const [name, labels] of [
  ['source variant map', Object.keys(ART_VARIANT_MAP)],
  ['generated source variants', Object.keys(IMPORTED_ART_VARIANTS)],
  ['derived artwork', Object.keys(BATCH1_DERIVED_ART)],
]) {
  const invalid = outside(labels);
  if (invalid.length) fail.push(`${name} includes out-of-scope labels: ${invalid.join(', ')}`);
}

const mapLabels = Object.keys(ART_VARIANT_MAP).filter((label) => ART_VARIANT_MAP[label].length > 0).sort();
const generatedLabels = Object.keys(IMPORTED_ART_VARIANTS).sort();
if (JSON.stringify(mapLabels) !== JSON.stringify(generatedLabels)) {
  fail.push('generated source-variant label set does not match the curated source map');
}
const generatedVariantCount = Object.values(IMPORTED_ART_VARIANTS).flat().length;
if (IMPORTED_ART_VARIANT_COUNT !== generatedVariantCount) {
  fail.push(`variant count export is ${IMPORTED_ART_VARIANT_COUNT}, data contains ${generatedVariantCount}`);
}
if (IMPORTED_ART_VARIANT_LABELS.length !== generatedLabels.length) {
  fail.push('variant label-count export is stale');
}

const derivedLabels = Object.keys(BATCH1_DERIVED_ART);
if (derivedLabels.length !== 13) fail.push(`expected 13 reviewed derived drawings, found ${derivedLabels.length}`);

const noPrimary = rows.filter((row) => !row.primary).map((row) => row.label);
if (noPrimary.length !== 1 || noPrimary[0] !== 'camouflage') {
  fail.push(`expected only camouflage to lack clean primary artwork; found ${noPrimary.join(', ') || 'none'}`);
}
for (const label of Object.keys(MANUAL_EXCLUSIONS)) {
  if (!batch1.has(label)) fail.push(`manual exclusion is outside Batch 1: ${label}`);
  const ids = new Set(getArtworkVariants(label, { max: 32 }).map((v) => v.id));
  for (const id of Object.keys(MANUAL_EXCLUSIONS[label])) {
    if (!ids.has(id)) fail.push(`stale manual exclusion ${label}/${id}`);
  }
}

let checkedOptions = 0;
for (const row of rows) {
  for (const option of row.options) {
    checkedOptions++;
    const issues = qualityIssues(option);
    if (issues.length) fail.push(`${row.label}/${option.id}: ${issues.join('; ')}`);
    const svg = variantToSvgString(option, { size: 46, color: '#e26755' });
    if (!svg || svg.includes('STROKE')) fail.push(`${row.label}/${option.id}: inserted SVG has unresolved paint tokens`);
    if (!svg?.startsWith('<svg ')) fail.push(`${row.label}/${option.id}: SVG wrapper is missing`);
  }
}

const countsSum = counts.threePlus + counts.exactlyTwo + counts.exactlyOne + counts.zero;
if (countsSum !== 100) fail.push(`distinct-option buckets sum to ${countsSum}, not 100`);
if (counts.zero !== 1) fail.push(`expected one no-option category, found ${counts.zero}`);
const unknownImported = Object.keys(IMPORTED_ART).filter((label) => !canonical.includes(label));
if (unknownImported.length) fail.push(`imported artwork has unknown canonical labels: ${unknownImported.join(', ')}`);

const creditFile = path.join(ROOT, 'scripts/oss-art-variant-credits.json');
const variantCredits = JSON.parse(fs.readFileSync(creditFile, 'utf8'));
const creditedPairs = new Set();
for (const [lib, source] of Object.entries(variantCredits)) {
  for (const item of source.categories ?? []) {
    if (!batch1.has(item.label)) fail.push(`credit outside Batch 1: ${item.label}`);
    creditedPairs.add(`${item.label}/${lib}/${item.icon}`);
  }
}
for (const [label, variants] of Object.entries(IMPORTED_ART_VARIANTS)) {
  for (const item of variants) {
    if (!creditedPairs.has(`${label}/${item.lib}/${item.key}`)) {
      fail.push(`missing source/license credit: ${label}/${item.lib}/${item.key}`);
    }
  }
}

console.log('Batch-1 artwork QA — canonical categories 1–100');
console.log('='.repeat(58));
console.log(`coverage: ${100 - noPrimary.length}/100 clean primaries; text-only fallback: ${noPrimary.join(', ')}`);
console.log(`distinct options (after raster + human exclusions): 3+:${counts.threePlus}  2:${counts.exactlyTwo}  1:${counts.exactlyOne}  0:${counts.zero}`);
console.log(`approved options quality-checked: ${checkedOptions}`);
console.log(`source variants: ${generatedVariantCount} across ${generatedLabels.length} labels; derived drawings: ${derivedLabels.length}`);
console.log(`manual exclusion rules: ${Object.values(MANUAL_EXCLUSIONS).reduce((n, x) => n + Object.keys(x).length, 0)}`);
console.log(`imported primary corpus: ${Object.keys(IMPORTED_ART).length}/345 (Batch-1 scope changes are audited separately)`);
if (fail.length) {
  console.error(`\n✖ ${fail.length} QA failure(s):`);
  for (const item of fail) console.error(`  - ${item}`);
  process.exitCode = 1;
} else {
  console.log('\n✔ Batch-1 artwork checks passed.');
}
