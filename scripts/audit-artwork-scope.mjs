#!/usr/bin/env node
// Verifies that a review-phase diff is confined to canonical categories 101–345,
// that the two expansion maps stay in their assigned ranges, and that all
// Batch-1 review inputs/artifacts remain byte-identical to the supplied base.
//
//   node scripts/audit-artwork-scope.mjs --base=<pre-Batch-2-commit>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { categories as currentCategories } from '../src/data/categories.js';
import { IMPORTED_ART as currentImportedArt } from '../src/data/imported-art.js';
import { ICONS as currentIcons } from '../src/data/icons.js';
import { ART_VARIANT_MAP_BATCH2 } from './oss-art-variant-map-batch2.mjs';
import { ART_VARIANT_MAP_BATCH3 } from './oss-art-variant-map-batch3.mjs';

const ROOT = process.cwd();
const baseArg = process.argv.find((arg) => arg.startsWith('--base='));
const BASE = baseArg?.split('=')[1] ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sketchai-scope-audit-'));
const fail = [];
const canonical = fs.readFileSync(path.join(ROOT, 'src/data/quickdraw-categories.txt'), 'utf8')
  .split(/\r?\n/).map((label) => label.trim().toLowerCase()).filter(Boolean);

function baseBuffer(file) {
  return execFileSync('git', ['show', `${BASE}:${file}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
}

function baseText(file) {
  return baseBuffer(file).toString('utf8');
}

async function baseModule(file, name) {
  const target = path.join(TMP, `${name}.mjs`);
  fs.writeFileSync(target, baseText(file));
  return import(`${pathToFileURL(target).href}?audit=${Date.now()}-${Math.random()}`);
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function canonicalIndex(label) {
  return canonical.indexOf(String(label).toLowerCase());
}

function inExpansionRange(label) {
  const index = canonicalIndex(label);
  return index >= 100 && index < 345;
}

function checkChangedLabels(name, oldObject, newObject) {
  const keys = new Set([...Object.keys(oldObject), ...Object.keys(newObject)]);
  const changed = [...keys].filter((key) => !deepEqual(oldObject[key], newObject[key]));
  const outOfScope = changed.filter((label) => !inExpansionRange(label));
  if (outOfScope.length) fail.push(`${name} changed outside canonical 101–345: ${outOfScope.join(', ')}`);
  return changed;
}

try {
  if (canonical.length !== 345) fail.push(`canonical list has ${canonical.length} categories, not 345`);
  const [baseCategoriesModule, baseArtModule, baseIconsModule, baseSourcesModule] = await Promise.all([
    baseModule('src/data/categories.js', 'categories-base'),
    baseModule('src/data/imported-art.js', 'imported-art-base'),
    baseModule('src/data/icons.js', 'icons-base'),
    baseModule('scripts/oss-art-sources.mjs', 'sources-base'),
  ]);
  const baseCategories = baseCategoriesModule.categories;
  const baseArt = baseArtModule.IMPORTED_ART;
  const baseIcons = baseIconsModule.ICONS;
  const baseSourceMap = baseSourcesModule.MAP;
  const baseSkipped = new Set(baseSourcesModule.SKIP_IMPORTED_ART);
  const currentSourceModule = await import('../scripts/oss-art-sources.mjs');

  if (baseCategories.length !== 345 || currentCategories.length !== 345) fail.push('category metadata length changed');
  if (baseCategories.some((entry, index) => entry.label.toLowerCase() !== canonical[index])) fail.push('base metadata does not match canonical order');
  if (currentCategories.some((entry, index) => entry.label.toLowerCase() !== canonical[index])) fail.push('current metadata does not match canonical order');
  try {
    if (!baseBuffer('src/data/quickdraw-categories.txt').equals(fs.readFileSync(path.join(ROOT, 'src/data/quickdraw-categories.txt')))) {
      fail.push('canonical category order file changed');
    }
  } catch (error) {
    fail.push(`could not compare canonical category order file: ${error.message}`);
  }

  const changedArt = checkChangedLabels('imported primary art', baseArt, currentImportedArt);
  const changedCategories = checkChangedLabels(
    'category metadata',
    Object.fromEntries(baseCategories.map((entry) => [entry.label.toLowerCase(), entry])),
    Object.fromEntries(currentCategories.map((entry) => [entry.label.toLowerCase(), entry])),
  );
  const changedMappings = checkChangedLabels('primary source mappings', baseSourceMap, currentSourceModule.MAP);
  const baseSkipSet = new Set(baseSkipped);
  const currentSkipSet = new Set(currentSourceModule.SKIP_IMPORTED_ART);
  const changedSkipLabels = [...new Set([...baseSkipSet, ...currentSkipSet])]
    .filter((label) => baseSkipSet.has(label) !== currentSkipSet.has(label));
  const skippedOutOfScope = changedSkipLabels.filter((label) => !inExpansionRange(label));
  if (skippedOutOfScope.length) fail.push(`primary skip rules changed outside canonical 101–345: ${skippedOutOfScope.join(', ')}`);

  // Any changed fallback glyph must belong to a legacy icon removed/revised
  // for one of the reviewed Batch-2/3 categories, and must no longer be active.
  const changedIconKeys = [...new Set([...Object.keys(baseIcons), ...Object.keys(currentIcons)])]
    .filter((key) => !deepEqual(baseIcons[key], currentIcons[key]));
  const iconLabels = changedIconKeys.flatMap((key) => baseCategories
    .filter((entry) => entry.key === key)
    .map((entry) => entry.label.toLowerCase()));
  const iconOutOfScope = iconLabels.filter((label) => !inExpansionRange(label));
  if (iconOutOfScope.length) fail.push(`legacy icon bodies changed outside canonical 101–345: ${iconOutOfScope.join(', ')}`);
  const stillReferenced = changedIconKeys.filter((key) => currentCategories.some((entry) => entry.key === key));
  if (stillReferenced.length) fail.push(`changed fallback glyph remains referenced: ${stillReferenced.join(', ')}`);

  for (const [batch, map, start, end] of [[2, ART_VARIANT_MAP_BATCH2, 100, 200], [3, ART_VARIANT_MAP_BATCH3, 200, 345]]) {
    const bad = Object.keys(map).filter((label) => {
      const index = canonicalIndex(label);
      return index < start || index >= end;
    });
    if (bad.length) fail.push(`Batch ${batch} variant map is out of range: ${bad.join(', ')}`);
  }

  const frozenFiles = [
    'src/data/batch1-derived-art.js',
    'src/data/imported-art-variants.js',
    'src/data/artwork-variants.js',
    'src/data/line-art.js',
    'scripts/oss-art-variant-map.mjs',
    'scripts/oss-art-variant-credits.json',
    'scripts/batch1-artwork-review.mjs',
    'scripts/qa-batch1-artwork.mjs',
    'scripts/render-batch1-contact-sheet.mjs',
    ...Array.from({ length: 11 }, (_, index) => `docs/artwork-review/batch-1-contact-sheet${index ? `-${String(index).padStart(2, '0')}` : ''}.png`),
  ];
  const changedFrozen = [];
  for (const file of frozenFiles) {
    try {
      if (!baseBuffer(file).equals(fs.readFileSync(path.join(ROOT, file)))) changedFrozen.push(file);
    } catch (error) {
      fail.push(`could not compare preserved Batch-1 file ${file}: ${error.message}`);
    }
  }
  if (changedFrozen.length) fail.push(`preserved Batch-1 inputs/artifacts changed: ${changedFrozen.join(', ')}`);

  const rangeOf = (labels, start, end) => labels.filter((label) => {
    const index = canonicalIndex(label);
    return index >= start && index < end;
  });
  console.log(`Artwork scope audit against ${BASE}`);
  console.log(`changed primary drawings: ${changedArt.length}${changedArt.length ? ` (${changedArt.join(', ')})` : ''}`);
  console.log(`changed canonical category metadata: ${changedCategories.length}${changedCategories.length ? ` (${changedCategories.join(', ')})` : ''}`);
  console.log(`changed primary mappings: ${changedMappings.length}${changedMappings.length ? ` (${changedMappings.join(', ')})` : ''}`);
  console.log(`changed skip rules: ${changedSkipLabels.length}${changedSkipLabels.length ? ` (${changedSkipLabels.join(', ')})` : ''}`);
  console.log(`changed legacy icon bodies: ${changedIconKeys.length}${changedIconKeys.length ? ` (${changedIconKeys.join(', ')})` : ''}`);
  console.log(`Batch-2 map: ${Object.keys(ART_VARIANT_MAP_BATCH2).length} labels in 101–200; Batch-3 map: ${Object.keys(ART_VARIANT_MAP_BATCH3).length} labels in 201–345`);
  console.log(`primary drawing edits by canonical range: Batch 2=${rangeOf(changedArt, 100, 200).length}, Batch 3=${rangeOf(changedArt, 200, 345).length}`);
  console.log(`preserved Batch-1 inputs/artifacts compared byte-for-byte: ${frozenFiles.length}`);
  if (fail.length) {
    console.error(`\n✖ ${fail.length} scope error(s):`);
    for (const item of fail) console.error(`  - ${item}`);
    process.exitCode = 1;
  } else {
    console.log('\n✔ No out-of-range artwork changes; Batch-1 source/review artifacts are unchanged.');
  }
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
