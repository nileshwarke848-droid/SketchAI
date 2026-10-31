// Shared review rules for the separately scoped Batch-2 / Batch-3 artwork.
// Batch 1 remains isolated in batch1-artwork-review.mjs and its QA stays frozen.
import fs from 'node:fs';
import path from 'node:path';
import { getArtworkVariants } from '../src/data/artwork.js';
import { NEAR_DUPLICATE, raster, visualOverlap } from './oss-art-lib.mjs';

const CANONICAL = fs.readFileSync(path.resolve('src/data/quickdraw-categories.txt'), 'utf8')
  .split(/\r?\n/).map((label) => label.trim().toLowerCase()).filter(Boolean);
export const BATCH_RANGES = {
  2: { start: 100, end: 200 }, // canonical 101–200
  3: { start: 200, end: 345 }, // canonical 201–345
};

// Human visual review exclusions for existing SketchAI art whose basic pose or
// silhouette repeats another option even when the raster score falls below the
// automatic 0.62 threshold. Excluded art remains in the app where it was
// already present; it simply does not inflate the distinct-option count.
export const MANUAL_EXCLUSIONS = {
  2: {
    elephant: { 'elephant-line': 'same side-profile elephant silhouette as the imported primary' },
    envelope: { 'envelope-line': 'same rectangular envelope and diagonal flap as the primary' },
    foot: { 'foot-line': 'hand-drawn outline touches the frame edge and is visibly clipped' },
    eye: {
      'eye-line': 'same plain eye outline and centered pupil',
      'eye-variant-2': 'same eye silhouette; iris detail only',
    },
    eyeglasses: { 'eyeglasses-line': 'same front-facing two-lens eyeglasses silhouette' },
    face: {
      'face-line': 'same round smiley face silhouette',
      'face-variant-2': 'same round smiley face; minor feature changes only',
    },
    firetruck: { 'firetruck-line': 'same side-profile fire engine/truck view' },
    fish: {
      'fish-line': 'same side-profile fish silhouette',
      'fish-variant-2': 'same fish silhouette; gill marks only',
      'fish-variant-3': 'same fish silhouette; stripe marks only',
    },
    'floor lamp': { 'floor lamp-line': 'same upright floor-lamp silhouette' },
    grapes: { 'grapes-line': 'same bunch-of-grapes silhouette; leaf/detail changes only' },
    guitar: { 'guitar-line': 'same acoustic-guitar profile as the imported primary' },
    hamburger: { 'hamburger-line': 'same stacked-bun hamburger silhouette' },
    headphones: { 'headphones-line': 'same over-ear headphone silhouette' },
    hedgehog: { 'hedgehog-line': 'same side-view spiny animal silhouette' },
    helicopter: { 'helicopter-line': 'same side-profile helicopter with overhead rotor' },
    horse: { 'horse-line': 'same side-profile horse pose' },
    house: {
      'house-line': 'same simple front-facing house outline',
      'house-variant-2': 'same front-facing house silhouette; window/door detail only',
      'house-variant-3': 'same front-facing house silhouette; roof detail only',
    },
    key: {
      'key-line': 'same single-key silhouette, rotated horizontally',
      'key-variant-2': 'same single-key silhouette, rotated diagonally',
    },
    leaf: { 'leaf-line': 'same single-leaf outline and orientation' },
    'light bulb': { 'light bulb-line': 'same upright bulb silhouette and base' },
    lightning: { 'lightning-line': 'same single-bolt lightning silhouette' },
    lighthouse: { 'lighthouse-line': 'same upright lighthouse tower view' },
    moon: {
      'moon-line': 'same plain crescent-moon outline',
      'moon-variant-2': 'same crescent-moon silhouette; face/detail changes only',
    },
    motorbike: { 'motorbike-line': 'same side-profile motorcycle silhouette' },
    mountain: { 'mountain-line': 'same simple two-peak mountain outline' },
    mouse: { 'mouse-line': 'hand-drawn animal profile touches the frame edge and is visibly clipped' },
    mouth: { 'mouth-line': 'same pair of lips viewed from the front' },
    mushroom: { 'mushroom-line': 'same single mushroom cap-and-stem silhouette' },
    nose: { 'nose-line': 'same side-profile nose as the imported primary' },
  },
  3: {
    owl: { 'owl-line': 'same front-facing owl depiction as the primary' },
    pants: { 'pants-line': 'same front-facing trousers silhouette' },
    pencil: { 'pencil-line': 'same diagonal pencil silhouette' },
    penguin: { 'penguin-line': 'same front-facing penguin pose as the primary' },
    pig: { 'pig-line': 'same side-profile pig pose as the primary' },
    pizza: { 'pizza-line': 'same top-down triangular pizza slice as the primary' },
    'police car': { 'police car-line': 'generic taxi/car sketch, not a distinct police-car view' },
    potato: { 'potato-line': 'same single-potato outline; blemish detail only' },
    rainbow: { 'rainbow-line': 'same nested rainbow arcs' },
    sailboat: {
      'sailboat-line': 'same simple side-profile sailboat silhouette',
      'sailboat-variant-2': 'same side-profile sailboat; sail/rigging detail only',
    },
    scissors: { 'scissors-line': 'same crossed scissor-blade silhouette' },
    shark: { 'shark-line': 'same side-profile shark silhouette' },
    sheep: { 'sheep-line': 'front-facing sketch touches the frame edge and is clipped; whole-body Game Icons drawing is preferred' },
    shoe: {
      'shoe-line': 'same side-profile shoe/sneaker silhouette',
      'shoe-variant-2': 'same side-profile shoe/sneaker silhouette; sole detail only',
    },
    snail: { 'snail-line': 'same side-profile snail with spiral shell' },
    snowflake: { 'snowflake-line': 'same radial snowflake symbol' },
    snowman: { 'snowman-line': 'same front-facing stacked-sphere snowman' },
    sock: { 'sock-line': 'same single sock profile' },
    speedboat: { 'speedboat-line': 'same side-profile speedboat hull' },
    spider: { 'spider-line': 'same front-facing spider silhouette' },
    spoon: { 'spoon-line': 'same single spoon profile' },
    star: {
      'star-line': 'same plain five-point star outline',
      'star-variant-2': 'same five-point star silhouette; stroke weight only',
    },
    sun: {
      'sun-line': 'same full sun with radial rays',
      'sun-variant-2': 'same full sun with radial rays; ray length only',
    },
    'telephone': { 'telephone-line': 'same telephone handset profile' },
    television: { 'television-line': 'same front-facing television screen' },
    tent: { 'tent-line': 'same triangular tent-front outline' },
    tooth: { 'tooth-line': 'same single molar outline' },
    tractor: { 'tractor-line': 'same side-profile farm tractor view' },
    train: {
      'train-line': 'same side-profile train/locomotive view',
      'train-variant-2': 'same side-profile locomotive; carriage detail only',
    },
    tree: {
      'tree-line': 'same round-canopy tree silhouette as the legacy variant',
      'tree-variant-2': 'same round-canopy tree silhouette as the line-art drawing',
    },
    triangle: { 'triangle-line': 'same plain upright triangle outline' },
    truck: { 'truck-line': 'same side-profile box-truck silhouette' },
    trumpet: { 'trumpet-line': 'same side-view trumpet silhouette' },
    't-shirt': { 't-shirt-line': 'same front-facing short-sleeve T-shirt silhouette' },
    umbrella: {
      'umbrella-line': 'same front-facing umbrella canopy and hook handle',
      'umbrella-variant-2': 'same umbrella silhouette; canopy panel detail only',
      'umbrella-variant-3': 'same umbrella silhouette; scallop/detail changes only',
    },
    'wine bottle': { 'wine bottle-line': 'same single upright wine-bottle outline' },
    'wine glass': { 'wine glass-line': 'same upright stemmed wine-glass silhouette' },
    wristwatch: { 'wristwatch-line': 'same front-facing wristwatch silhouette' },
    zebra: { 'zebra-line': 'same side-profile horse-shaped zebra silhouette' },
  },
};

export function labelsForBatch(batch) {
  const range = BATCH_RANGES[batch];
  if (!range) throw new Error(`Unsupported artwork review batch: ${batch}`);
  return CANONICAL.slice(range.start, range.end);
}

function compareToOptions(candidate, options) {
  const candidateRaster = raster(candidate);
  const overlaps = options.map((kept) => ({ kept, score: visualOverlap(candidateRaster, raster(kept)) }));
  return overlaps.reduce((best, item) => item.score > best.score ? item : best, overlaps[0]);
}

export function reviewCategory(label, batch) {
  const all = getArtworkVariants(label, { max: 64 });
  const clean = all.filter((variant) => variant.origin !== 'icon');
  const exclusions = MANUAL_EXCLUSIONS[batch]?.[label] ?? {};
  const duplicates = [];
  const excludedIds = new Set();
  for (const candidate of clean) {
    const reason = exclusions[candidate.id];
    if (!reason) continue;
    excludedIds.add(candidate.id);
    duplicates.push({ candidate, manual: true, reason });
  }
  const eligible = clean.filter((variant) => !excludedIds.has(variant.id));
  const primary = eligible[0] ?? null;
  if (!primary) return {
    label, primary: null, options: [], extras: [], lineArt: null,
    lineArtCandidate: clean.find((variant) => variant.origin === 'lineart') ?? null,
    duplicates,
  };

  const options = [primary];
  const candidates = eligible.filter((variant) => variant !== primary && variant.origin !== 'lineart');
  for (const candidate of candidates) {
    const closest = compareToOptions(candidate, options);
    if (closest.score >= NEAR_DUPLICATE) {
      duplicates.push({ candidate, comparedTo: closest.kept, overlap: closest.score });
    } else {
      options.push(candidate);
    }
  }

  const foundLineArt = clean.find((variant) => variant.origin === 'lineart') ?? null;
  const lineArtCandidate = foundLineArt === primary ? null : foundLineArt;
  let lineArt = null;
  if (lineArtCandidate && !excludedIds.has(lineArtCandidate.id)) {
    const closest = compareToOptions(lineArtCandidate, options);
    if (closest.score >= NEAR_DUPLICATE) {
      duplicates.push({ candidate: lineArtCandidate, comparedTo: closest.kept, overlap: closest.score, lineArt: true });
    } else {
      lineArt = lineArtCandidate;
      options.push(lineArtCandidate);
    }
  }
  return {
    label,
    primary,
    options,
    extras: options.filter((variant) => variant !== primary && variant.origin !== 'lineart'),
    lineArt,
    lineArtCandidate,
    duplicates,
  };
}

export function summarizeBatch(batch) {
  const rows = labelsForBatch(batch).map((label) => reviewCategory(label, batch));
  const counts = { threePlus: 0, exactlyTwo: 0, exactlyOne: 0, zero: 0 };
  for (const row of rows) {
    if (row.options.length >= 3) counts.threePlus++;
    else if (row.options.length === 2) counts.exactlyTwo++;
    else if (row.options.length === 1) counts.exactlyOne++;
    else counts.zero++;
  }
  return { rows, counts };
}
