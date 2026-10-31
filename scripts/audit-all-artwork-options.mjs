#!/usr/bin/env node
// Whole-library, machine-readable audit for all 345 canonical categories.
// Batch-1 review remains frozen; Batches 2/3 use their separately scoped rules.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { categories } from '../src/data/categories.js';
import { getArtworkVariants } from '../src/data/artwork.js';
import { IMPORTED_ART } from '../src/data/imported-art.js';
import { BATCH1_DERIVED_ART } from '../src/data/batch1-derived-art.js';
import { BATCH2_DERIVED_ART } from '../src/data/batch2-derived-art.js';
import { BATCH3_DERIVED_ART } from '../src/data/batch3-derived-art.js';
import { SOURCES } from './oss-art-sources.mjs';
import { BATCH1_LABELS, MANUAL_EXCLUSIONS as BATCH1_EXCLUSIONS, reviewBatch1Category } from './batch1-artwork-review.mjs';
import { labelsForBatch, MANUAL_EXCLUSIONS as BATCH23_EXCLUSIONS, reviewCategory } from './batch-artwork-review.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/artwork-review/all-category-option-audit.json');
const creditsByBatch = Object.fromEntries([1, 2, 3].map((batch) => [
  batch,
  JSON.parse(fs.readFileSync(path.join(ROOT, `scripts/oss-art-variant-credits${batch === 1 ? '' : `-batch${batch}`}.json`), 'utf8')),
]));
const primaryCredits = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/oss-art-credits.json'), 'utf8'));
const primaryByLabel = new Map();
for (const [lib, source] of Object.entries(primaryCredits)) {
  for (const item of source.categories ?? []) primaryByLabel.set(item.label, `${lib}/${item.icon}`);
}
const LIB_NAMES = {
  tabler: 'Tabler', lucide: 'Lucide', iconoir: 'Iconoir', mdi: 'MDI',
  gameicons: 'Game Icons', fontawesome: 'Font Awesome',
};

function sourceName(variant, label) {
  if (!variant) return null;
  if (variant.origin === 'derived') return 'SketchAI original';
  if (variant.source && variant.sourceKey) return `${LIB_NAMES[variant.source] ?? variant.source}/${variant.sourceKey}`;
  if (variant.origin === 'imported' || variant.origin === 'imported-variant') {
    const primary = primaryByLabel.get(label);
    if (primary && variant.origin === 'imported') return primary;
    const id = variant.id?.replace(/-imported(?:-secondary)?$/, '');
    const match = [...primaryByLabel.entries()].find(([category]) => category === id)?.[1];
    return match ?? 'pinned open-source SVG';
  }
  if (variant.origin === 'lineart' || variant.origin === 'variant') return 'SketchAI original';
  if (variant.origin === 'icon') return `${variant.source ?? 'legacy'} fallback`;
  return variant.origin ?? null;
}

function packVariant(variant, label) {
  return { id: variant.id, origin: variant.origin, source: sourceName(variant, label) };
}

function packReview(label, index, batch, review) {
  const appPool = getArtworkVariants(label);
  const fallbacks = appPool.filter((variant) => variant.origin === 'icon').map((variant) => packVariant(variant, label));
  const notCounted = review.duplicates.map((entry) => ({
    ...packVariant(entry.candidate, label),
    reason: entry.reason ?? `raster near-duplicate of ${entry.comparedTo?.id ?? 'another counted option'}`,
    comparedTo: entry.comparedTo?.id ?? null,
    overlap: Number.isFinite(entry.overlap) ? Number(entry.overlap.toFixed(4)) : null,
  }));
  return {
    index,
    batch,
    label,
    count: review.options.length,
    primary: review.primary ? packVariant(review.primary, label) : null,
    counted: review.options.map((variant) => packVariant(variant, label)),
    notCounted,
    legacyFallbacks: fallbacks,
    fallbackState: fallbacks.length
      ? 'legacy-artwork-fallback-preserved-but-not-counted'
      : review.options.length
        ? 'not-applicable'
        : 'text-only',
  };
}

const rows = [];
const batchRanges = { 1: [1, 100], 2: [101, 200], 3: [201, 345] };
for (const [offset, label] of BATCH1_LABELS.entries()) {
  rows.push(packReview(label, offset + 1, 1, reviewBatch1Category(label)));
}
for (const batch of [2, 3]) {
  const [start] = batchRanges[batch];
  for (const [offset, label] of labelsForBatch(batch).entries()) {
    rows.push(packReview(label, start + offset, batch, reviewCategory(label, batch)));
  }
}
if (rows.length !== 345 || rows.some((row, index) => row.index !== index + 1 || row.label !== categories[index]?.label.toLowerCase())) {
  throw new Error('All-category review rows do not exactly match canonical category order.');
}

const summaries = {};
for (const batch of [1, 2, 3]) {
  const scoped = rows.filter((row) => row.batch === batch);
  const distribution = { threePlus: 0, exactlyTwo: 0, exactlyOne: 0, zero: 0 };
  for (const row of scoped) {
    if (row.count >= 3) distribution.threePlus++;
    else if (row.count === 2) distribution.exactlyTwo++;
    else if (row.count === 1) distribution.exactlyOne++;
    else distribution.zero++;
  }
  const credits = Object.values(creditsByBatch[batch]);
  const variants = credits.reduce((sum, source) => sum + (source.categories ?? []).length, 0);
  summaries[batch] = {
    canonicalRange: batchRanges[batch],
    categories: scoped.length,
    cleanPrimaryCoverage: scoped.filter((row) => row.primary).length,
    distinctOptions: scoped.reduce((sum, row) => sum + row.count, 0),
    distribution,
    categoriesUnderThree: scoped.filter((row) => row.count < 3).map(({ index, label, count }) => ({ index, label, count })),
    approvedSourceVariants: variants,
    variantLabels: new Set(credits.flatMap((source) => (source.categories ?? []).map((entry) => entry.label))).size,
    derivedDrawings: Object.keys(batch === 1 ? BATCH1_DERIVED_ART : batch === 2 ? BATCH2_DERIVED_ART : BATCH3_DERIVED_ART),
    manualExclusionRules: Object.values(batch === 1 ? BATCH1_EXCLUSIONS : BATCH23_EXCLUSIONS[batch] ?? {})
      .reduce((sum, item) => sum + Object.keys(item).length, 0),
  };
}
const distribution = Object.values(summaries).reduce((total, summary) => {
  for (const key of Object.keys(total)) total[key] += summary.distribution[key];
  return total;
}, { threePlus: 0, exactlyTwo: 0, exactlyOne: 0, zero: 0 });
const underThree = rows.filter((row) => row.count < 3).map(({ index, label, count, batch }) => ({ index, label, count, batch }));
const derivedDrawings = [
  ...Object.keys(BATCH1_DERIVED_ART).map((label) => ({ batch: 1, label })),
  ...Object.keys(BATCH2_DERIVED_ART).map((label) => ({ batch: 2, label })),
  ...Object.keys(BATCH3_DERIVED_ART).map((label) => ({ batch: 3, label })),
];
const variantSourceCredits = Object.fromEntries([1, 2, 3].map((batch) => [batch, Object.entries(creditsByBatch[batch]).map(([id, source]) => ({
  id,
  name: source.name,
  version: source.version,
  license: source.license,
  categories: (source.categories ?? []).map(({ label, icon }) => ({ label, icon })),
}))]));
const manualExclusionRuleTotal = Object.values(summaries).reduce((sum, summary) => sum + summary.manualExclusionRules, 0);
const totalOptions = rows.reduce((sum, row) => sum + row.count, 0);
const report = {
  generatedBy: 'scripts/audit-all-artwork-options.mjs',
  canonicalCategoryCount: categories.length,
  totalDistinctOptions: totalOptions,
  distribution,
  categoriesUnderThree: underThree,
  batchSummaries: summaries,
  importedPrimaryDrawings: Object.keys(IMPORTED_ART).length,
  approvedSourceVariants: Object.values(summaries).reduce((sum, summary) => sum + summary.approvedSourceVariants, 0),
  approvedSourceVariantLabels: Object.values(summaries).reduce((sum, summary) => sum + summary.variantLabels, 0),
  customDerivedDrawings: derivedDrawings,
  manualExclusionRules: manualExclusionRuleTotal,
  pinnedSources: Object.entries(SOURCES).map(([id, source]) => ({
    id, name: source.name, version: source.version, license: source.license, url: source.url,
  })),
  primaryCredits,
  variantCredits: variantSourceCredits,
  rows,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`All-category artwork audit — ${categories.length} canonical labels`);
console.log(`distinct counted options: ${totalOptions}; distribution 3+:${distribution.threePlus}  2:${distribution.exactlyTwo}  1:${distribution.exactlyOne}  0:${distribution.zero}`);
console.log(`categories with <3 options: ${underThree.length}; source variants: ${report.approvedSourceVariants} across ${report.approvedSourceVariantLabels} labels; derived: ${derivedDrawings.length}; manual exclusion rules: ${manualExclusionRuleTotal}`);
console.log(`imported primary drawings: ${report.importedPrimaryDrawings}; wrote ${path.relative(ROOT, OUT)}`);
