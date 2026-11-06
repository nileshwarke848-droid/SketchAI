#!/usr/bin/env node
// Final Batch-1 artwork gate: scope, coverage, reproducibility metadata, SVG
// health, and conservative distinct-option counts. This does not touch any
// model/training/canvas code and never promotes a fallback icon or emoji.
import fs from 'node:fs';
import path from 'node:path';
import { ART_VARIANT_MAP } from './oss-art-variant-map.mjs';
import { FIRST50_ART_VARIANT_MAP } from './first50-art-variant-map.mjs';
import { NEXT50_ART_VARIANT_MAP } from './next50-art-variant-map.mjs';
import { IMPORTED_ART } from '../src/data/imported-art.js';
import {
  IMPORTED_ART_VARIANTS,
  IMPORTED_ART_VARIANT_COUNT,
  IMPORTED_ART_VARIANT_LABELS,
} from '../src/data/imported-art-variants.js';
import { BATCH1_DERIVED_ART } from '../src/data/batch1-derived-art.js';
import { NEXT50_DERIVED_ART, NEXT50_LINE_ART, NEXT50_VARIANTS } from '../src/data/next50-artwork.js';
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
const next50Labels = new Set(canonical.slice(50, 100));
for (const [name, labels] of [
  ['next-50 derived artwork', Object.keys(NEXT50_DERIVED_ART)],
  ['next-50 line art', Object.keys(NEXT50_LINE_ART)],
  ['next-50 custom variants', Object.keys(NEXT50_VARIANTS)],
]) {
  const invalid = labels.filter((label) => !next50Labels.has(label));
  if (invalid.length) fail.push(`${name} includes labels outside canonical categories 51–100: ${invalid.join(', ')}`);
}

const expectedVariantMap = { ...ART_VARIANT_MAP };
for (const supplementalMap of [FIRST50_ART_VARIANT_MAP, NEXT50_ART_VARIANT_MAP]) {
  for (const [label, variants] of Object.entries(supplementalMap)) {
    expectedVariantMap[label] = [...(expectedVariantMap[label] ?? []), ...variants];
  }
}
const mapLabels = Object.keys(expectedVariantMap).filter((label) => expectedVariantMap[label].length > 0).sort();
const generatedLabels = Object.keys(IMPORTED_ART_VARIANTS).sort();
if (JSON.stringify(mapLabels) !== JSON.stringify(generatedLabels)) {
  fail.push('generated source-variant label set does not match the curated source maps');
}
const generatedVariantCount = Object.values(IMPORTED_ART_VARIANTS).flat().length;
const mappedVariantCount = Object.values(expectedVariantMap).flat().length;
if (generatedVariantCount !== mappedVariantCount) {
  fail.push(`generated source variants ${generatedVariantCount} != curated map count ${mappedVariantCount}`);
}
if (IMPORTED_ART_VARIANT_COUNT !== generatedVariantCount) {
  fail.push(`variant count export is ${IMPORTED_ART_VARIANT_COUNT}, data contains ${generatedVariantCount}`);
}
if (IMPORTED_ART_VARIANT_LABELS.length !== generatedLabels.length) {
  fail.push('variant label-count export is stale');
}

const derivedLabels = Object.keys(BATCH1_DERIVED_ART);
if (derivedLabels.length !== 13) fail.push(`expected 13 reviewed derived drawings, found ${derivedLabels.length}`);

const noPrimary = rows.filter((row) => !row.primary).map((row) => row.label);
if (noPrimary.length !== 0) {
  fail.push(`every canonical Batch-1 category must now have a clean primary; missing ${noPrimary.join(', ')}`);
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
if (counts.zero !== 0) fail.push(`expected every category to have at least one distinct artwork option, found ${counts.zero} empty`);
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
const next50Rows = rows.slice(50);
const next50TargetReady = next50Rows.filter((row) => row.extras.length >= 2 && row.lineArt).length;
console.log(`next-50 artwork target (3+ distinct non-line options + separate line art): ${next50TargetReady}/50`);
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
