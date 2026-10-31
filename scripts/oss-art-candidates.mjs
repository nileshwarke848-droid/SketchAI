#!/usr/bin/env node
// Searches the pinned icon libraries for artwork candidates for one category.
//
//   node scripts/oss-art-candidates.mjs "cat" "dog"        # named categories
//   node scripts/oss-art-candidates.mjs --batch=1          # canonical 1..100
//   node scripts/oss-art-candidates.mjs --batch=1 --json   # machine-readable
//   node scripts/oss-art-candidates.mjs --batch=1 --only-gaps
//
// This is a PROPOSAL tool, not a decision maker. Every candidate is put through
// the real normaliser (scripts/oss-art-lib.mjs), measured for ink and frame
// usage, and compared pixel-for-pixel against the artwork the category already
// has. It then reports each candidate with a verdict so a human can approve or
// reject the *meaning* — a matching name is necessary, never sufficient.
//
// Rejection rules it can check automatically:
//   * renders no ink / non-finite geometry / no STROKE token
//   * too dense to read at card size, or too small inside its own frame
//   * visually the same picture as artwork the category already has
//     (overlap >= NEAR_DUPLICATE) — scale/stroke-weight/flip differences do NOT
//     count as a variant, exactly as the brief requires
import fs from 'node:fs';
import path from 'node:path';
import { SOURCES, MAP } from './oss-art-sources.mjs';
import { iconIndex, buildDrawing, raster, visualOverlap, NEAR_DUPLICATE, qualityIssues } from './oss-art-lib.mjs';
import { getArtworkVariants, normaliseLabel } from '../src/data/artwork.js';
import { LINE_ART } from '../src/data/line-art.js';
import { IMPORTED_ART } from '../src/data/imported-art.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const onlyGaps = args.includes('--only-gaps');
// Categories already at this many clean options are left completely alone: more
// cards is not the goal, and re-cutting a pool that already works only risks
// swapping good artwork for something merely different.
const TARGET_POOL = Number(process.env.TARGET_POOL ?? 3);
const batchArg = args.find((a) => a.startsWith('--batch='));
const MIN_INK = 0.035;
const MAX_INK = 0.36;
const MIN_FILL = 0.62;

const labels = fs
  .readFileSync(path.join(ROOT, 'src/data/quickdraw-categories.txt'), 'utf8')
  .split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean);

const wanted = args.filter((a) => !a.startsWith('--'));
const selected = wanted.length
  ? wanted.map(normaliseLabel)
  : batchArg
    ? batchSlice(labels, Number(batchArg.split('=')[1]))
    : labels;

/** Batch N of the canonical 345 list, 100 categories per batch. */
function batchSlice(all, batch) {
  const size = Number(process.env.BATCH_SIZE ?? 100);
  const from = (batch - 1) * size;
  return all.slice(from, from + size);
}

// ---------------------------------------------------------------------------
// Synonyms: how a Quick, Draw! label maps onto icon-library naming. Curated,
// because "cruise ship" is not called that in any of these sets, and a wrong
// picture is worse than no picture.
// ---------------------------------------------------------------------------
const SYN = {
  'aircraft carrier': ['carrier'],
  airplane: ['plane', 'aeroplane'],
  'alarm clock': ['alarm-clock'],
  ambulance: [],
  angel: [],
  'animal migration': [],
  ant: ['ants'],
  anvil: [],
  apple: [],
  arm: ['upper-arm', 'arm-flex'],
  asparagus: [],
  axe: ['hatchet', 'axes'],
  backpack: ['rucksack'],
  banana: [],
  bandage: ['plaster', 'adhesive-bandage'],
  barn: [],
  baseball: ['baseball-ball'],
  'baseball bat': ['baseball-bat-ball'],
  basket: ['shopping-basket'],
  basketball: ['basketball-ball'],
  bat: [],
  bathtub: ['bath-tub'],
  beach: [],
  bear: ['bear-face', 'bear-head', 'polar-bear'],
  beard: [],
  bed: ['bed-frame'],
  bee: [],
  belt: [],
  bench: ['park-bench'],
  bicycle: ['bike'],
  binoculars: ['binocular'],
  bird: [],
  'birthday cake': ['birthday-cake'],
  blackberry: [],
  blueberry: [],
  book: ['books', 'open-book'],
  boomerang: [],
  bottlecap: [],
  bowtie: ['bow-tie'],
  bracelet: [],
  brain: [],
  bread: ['loaf'],
  bridge: [],
  broccoli: [],
  broom: [],
  bucket: ['pail'],
  bulldozer: [],
  bus: ['school-bus'],
  bush: ['shrub'],
  butterfly: [],
  cactus: [],
  cake: ['birthday-cake'],
  calculator: [],
  calendar: [],
  camel: [],
  camera: [],
  camouflage: [],
  campfire: ['bonfire'],
  candle: [],
  cannon: [],
  canoe: [],
  car: ['auto', 'taxi', 'race-car'],
  carrot: [],
  castle: ['fortress'],
  cat: ['kitten'],
  'ceiling fan': ['ceiling-fan'],
  cello: [],
  'cell phone': ['mobile-phone', 'smartphone'],
  chair: ['armchair', 'office-chair'],
  chandelier: [],
  church: [],
  circle: [],
  clarinet: [],
  clock: ['cuckoo-clock'],
  cloud: ['cloud-rain', 'cloud-snow', 'cloud-storm'],
  'coffee cup': ['coffee-cup', 'mug'],
  compass: [],
  computer: ['desktop-computer', 'laptop'],
  cookie: ['biscuit'],
  cooler: ['ice-chest'],
  couch: ['sofa'],
  cow: [],
  crab: [],
  crayon: [],
  crocodile: ['alligator'],
  crown: ['tiara'],
  'cruise ship': ['cruise-ship'],
  cup: ['mug', 'tea-cup'],
  diamond: [],
  dishwasher: [],
  'diving board': [],
  dog: [],
  dolphin: [],
  donut: ['doughnut'],
  door: ['door-closed'],
  dragon: [],
  dresser: [],
  drill: [],
  drums: ['drum-kit'],
  duck: [],
};

const idx = iconIndex().svg;

// Which library icon each category already uses as its primary, so it can never
// be offered back to itself as a "variant".
const CREDITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/oss-art-credits.json'), 'utf8'));
const VARIANT_CREDITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/oss-art-variant-credits.json'), 'utf8'));
const usedByLabel = new Map();
for (const credits of [CREDITS, VARIANT_CREDITS]) {
  for (const [libId, entry] of Object.entries(credits)) {
    for (const c of entry.categories ?? []) {
      if (!usedByLabel.has(c.label)) usedByLabel.set(c.label, new Set());
      usedByLabel.get(c.label).add(`${libId}/${c.icon}`);
    }
  }
}

function nameSegments(name) {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Strict name matching.
 *
 * Precision beats recall here on purpose: the brief forbids giving a category a
 * semantically wrong icon just so it has artwork, and a loose token match is how
 * "ambulance" ends up with lucide/maximize-2 and "apple" with an iMac side view.
 * So a candidate only qualifies when its name *is* the thing, not when it merely
 * mentions a word of it:
 *
 *   4  the whole name equals the label or a curated synonym      ("flower")
 *   3  the name is the label's words in any order               ("turtle-sea")
 *   2  the name is the label/synonym plus a benign view suffix   ("horse-side")
 *
 * A benign suffix is a rendering variant of the same object (front/side/back/
 * top/view/outline/rounded/an index digit). Anything else — "arrow-bear-right",
 * "apple-imac-2021-side", "face-kiss" — is a different picture of a different
 * thing and is rejected here rather than in review.
 */
const BENIGN = /^(?:[0-9]|front|back|side|top|bottom|left|right|view|outline|filled|round|rounded|square|small|big|large|mini|alt|a|b|new|old|1|2|3|4)$/;
/** Words that always mean "not simply this object". */
const POISON = /(off$|-off-|-no-|not-|ban-|slash|arrow|chart|graph|diagram|logo|brand|code|terminal|search|filter|sort|import|export|upload|download|share|copy|lock|edit|add|remove|minus|plus|check|exclamation|question|loading|spinner|progress|mockup|imac|iphone|ipad|macbook|keyboard|dice|poker|card|map|route|path|way|walk|run|jump|swing|rotate|zoom|maximize|minimize|cursor|pointer|hand-|click|touch|swipe|text|type|writing|message|mail|notification|badge)/;

function qualifies(name, label, synonyms) {
  const whole = name.replace(/[^a-z0-9]+/g, ' ').trim();
  const segs = nameSegments(name);
  const labelWords = nameSegments(label);
  const phrases = new Set([label.replace(/[^a-z0-9]+/g, ' '), ...synonyms.map((x) => x.replace(/[^a-z0-9]+/g, ' '))]);
  if (POISON.test(`${whole} `)) return 0;
  if (phrases.has(whole)) return 4;
  if (labelWords.length > 1 && segs.length === labelWords.length
      && [...segs].sort().join(' ') === [...labelWords].sort().join(' ')) return 3;
  const prefixes = [label.replace(/[^a-z0-9]+/g, '-'), ...synonyms.map((x) => x.replace(/[^a-z0-9]+/g, '-'))];
  for (const prefix of prefixes) {
    if (!name.startsWith(`${prefix}-`)) continue;
    const tail = name.slice(prefix.length + 1).split(/[^a-z0-9]+/);
    if (tail.every((t) => BENIGN.test(t))) return 2;
  }
  return 0;
}

/** Which libraries actually contain something named for this label. */
function candidatesFor(label) {
  const synonyms = SYN[label] ?? [];
  const out = [];
  for (const [libId, byName] of Object.entries(idx)) {
    for (const name of byName.keys()) {
      const score = qualifies(name, label, synonyms);
      if (!score) continue;
      out.push({ lib: libId, name, score });
    }
  }
  const STROKE_FIRST = { tabler: 0.9, lucide: 0.8, iconoir: 0.7, mdi: 0.35, fontawesome: 0.25, gameicons: 0.1 };
  out.sort((a, b) => (b.score + STROKE_FIRST[b.lib]) - (a.score + STROKE_FIRST[a.lib]));
  return out;
}

const results = [];
for (const label of selected) {
  const existing = getArtworkVariants(label, { max: 99 });
  const cleanExisting = existing.filter((v) => v.origin !== 'icon');
  if (onlyGaps && cleanExisting.length >= TARGET_POOL) continue;

  const usedPairs = usedByLabel.get(label) ?? new Set();
  const existingRasters = cleanExisting.map((v) => ({ name: v.id, m: raster(v) }));
  const primaryTaken = MAP[label]?.join('/') ?? null;

  const slots = Math.max(0, TARGET_POOL - cleanExisting.length);
  const candidates = [];
  const seenBodies = new Set();
  for (const c of candidatesFor(label).slice(0, 80)) {
    const pair = `${c.lib}/${c.name}`;
    if (pair === primaryTaken || usedPairs.has(pair)) continue;
    const built = buildDrawing([c.lib, c.name]);
    if (built.error) continue;
    const art = { w: 24, h: 24, b: built.svg };
    const key = art.b.replace(/translate\([^)]*\)|scale\([^)]*\)/g, '');
    if (seenBodies.has(key)) continue;
    seenBodies.add(key);

    const m = raster(art);
    const issues = qualityIssues(art);
    const fill = m.box ? Math.max(m.box.w, m.box.h) / m.W : 0;
    if (m.ink < MIN_INK) issues.push(`too sparse (ink ${(m.ink * 100).toFixed(1)}%)`);
    else if (m.ink > MAX_INK) issues.push(`too dense (ink ${(m.ink * 100).toFixed(1)}%)`);
    if (fill && fill < MIN_FILL) issues.push(`small in frame (${(fill * 100).toFixed(0)}%)`);

    const overlap = existingRasters.length
      ? Math.max(...existingRasters.map((e) => visualOverlap(m, e.m)))
      : 0;
    const overlapWith = existingRasters.length
      ? existingRasters[
          existingRasters.findIndex((e) => visualOverlap(m, e.m) === overlap)
        ].name
      : null;
    if (overlap >= NEAR_DUPLICATE) issues.push(`same picture as ${overlapWith} (overlap ${(overlap * 100).toFixed(0)}%)`);

    // Prefer a clean stroke drawing of the exact thing; a filled game-art
    // silhouette is allowed only when nothing better exists, because SketchAI's
    // style target is an outline drawing, not a chunky glyph.
    const STROKE_BIAS = { tabler: 3, lucide: 2.8, iconoir: 2.6, mdi: 1.2, fontawesome: 1, gameicons: 0.4 };
    const inkFit = m.ink >= 0.09 && m.ink <= 0.24 ? 1.2 : m.ink > 0.3 ? -1.5 : 0;
    const modePenalty = built.mode === 'filled' ? -2 : 0;
    const prefer = c.score * 4 + (STROKE_BIAS[c.lib] ?? 0) + inkFit + modePenalty;
    candidates.push({
      lib: c.lib, name: c.name, score: c.score, mode: built.mode, prefer: +prefer.toFixed(2),
      ink: +m.ink.toFixed(3), fill: +fill.toFixed(2),
      overlap: +overlap.toFixed(2), overlapWith,
      issues, svg: built.svg, m,
    });
  }

  const clean = candidates.filter((c) => !c.issues.length);
  // Greedy: take the best-scoring candidate, then repeatedly take the one that
  // overlaps the already-chosen set least. This is what stops the bar getting
  // three copies of the same silhouette from three different libraries.
  const chosen = [];
  const pool = [...clean].sort((a, b) => b.prefer - a.prefer);
  while (pool.length && chosen.length < slots) {
    let best = 0;
    if (chosen.length) {
      // Among what is still visually distinct, take the best-looking one; ties
      // go to the pick furthest from the pictures already chosen.
      let key = -Infinity;
      pool.forEach((c, i) => {
        const worst = Math.max(...chosen.map((e) => visualOverlap(c.m, e.m)));
        if (worst >= NEAR_DUPLICATE) return;
        const k = c.prefer - worst * 2;
        if (k > key) { key = k; best = i; }
      });
    }
    const [pick] = pool.splice(best, 1);
    pick.overlapWithChosen = chosen.length
      ? +Math.max(...chosen.map((e) => visualOverlap(pick.m, e.m))).toFixed(2)
      : pick.overlap;
    chosen.push(pick);
    pool.forEach((c) => {
      if (chosen.some((e) => e.lib === c.lib && e.name === c.name)) return;
      if (Math.max(...chosen.map((e) => visualOverlap(c.m, e.m))) >= NEAR_DUPLICATE) c.issues.push('near-duplicate of another proposal');
    });
    for (let i = pool.length - 1; i >= 0; i--) if (pool[i].issues.length) pool.splice(i, 1);
  }
  // A pick deserves a second look by a human whenever the match was a synonym
  // rather than the literal name, or the drawing came from a filled library.
  for (const c of chosen) {
    c.review = c.score < 4 || c.mode === 'filled' || c.ink > 0.26 ? true : false;
  }
  results.push({
    label,
    existing: cleanExisting.map((v) => v.id),
    existingCount: cleanExisting.length,
    hasImported: Boolean(IMPORTED_ART[label]),
    hasLineArt: Boolean(LINE_ART[label]),
    accepted: chosen,
    slots,
    needsReview: chosen.some((c) => c.review),
    rejectedCount: candidates.length - clean.length,
    triedCandidates: candidates.length,
  });
}

if (args.includes('--emit-map')) {
  const lines = [];
  for (const r of results) {
    if (!r.accepted.length) continue;
    const picks = r.accepted.map((c) => `['${c.lib}', '${c.name}']`);
    lines.push(`  '${r.label}': [${picks.join(', ')}],`);
  }
  fs.writeFileSync('/tmp/batch1-map-draft.mjs', lines.join('\n') + '\n');
  console.log(`wrote ${lines.length} proposed entries -> /tmp/batch1-map-draft.mjs`);
  const none = results.filter((r) => !r.accepted.length);
  console.log(`${none.length} categories with no gate-passing candidate:`);
  console.log(`  ${none.map((r) => r.label).join(', ')}`);
}

if (asJson) {
  fs.writeFileSync('/tmp/batch1-candidates.json', JSON.stringify(results, null, 1));
  console.log(`wrote /tmp/batch1-candidates.json (${results.length} categories)`);
} else {
  for (const r of results) {
    const head = `${r.label}  [clean now: ${r.existingCount}${r.existing.length ? `: ${r.existing.join(', ')}` : ''}]`;
    console.log(`\n${head}`);
    if (!r.accepted.length) {
      console.log(`   ✖ no acceptable candidate (${r.triedCandidates} searched, ${r.rejectedCount} rejected)`);
      const top = r.accepted;
      void top;
      continue;
    }
    for (const c of r.accepted) {
      console.log(`   ✔ ${c.lib}/${c.name} mode=${c.mode} ink=${(c.ink * 100).toFixed(1)}% fill=${(c.fill * 100).toFixed(0)}% overlap=${(c.overlap * 100).toFixed(0)}% vs ${c.overlapWith ?? '-'}`);
    }
    if (r.rejectedCount) console.log(`   (${r.rejectedCount} more searched but rejected)`);
  }
  const gaps = results.filter((r) => !r.accepted.length);
  console.log(`\n${results.length} categories, ${gaps.length} with no gate-passing candidate:`);
  console.log(`  ${gaps.map((g) => g.label).join(', ')}`);
}
void SOURCES;
