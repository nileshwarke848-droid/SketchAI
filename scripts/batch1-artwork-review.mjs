// Shared, deterministic Batch-1 review rules for the contact sheet and QA report.
//
// A second SVG only counts as a distinct option when its rendered ink is not
// almost the same silhouette as an option already kept. This is intentionally a
// conservative raster comparison: it catches the same outline exported by two
// libraries with a different stroke weight or tiny path edits. It is not a
// replacement for the human review sheet.
import fs from 'node:fs';
import path from 'node:path';
import { getArtworkVariants } from '../src/data/artwork.js';
import { visualOverlap, raster, NEAR_DUPLICATE } from './oss-art-lib.mjs';

export const DISTINCT_OVERLAP_LIMIT = NEAR_DUPLICATE;
export const BATCH1_LABELS = fs.readFileSync(path.resolve('src/data/quickdraw-categories.txt'), 'utf8')
  .split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 100);

// Human review overrides for semantic/visual near-duplicates that a raster IoU
// can miss (or, in the case of a specific subtype, art that is too weak for the
// canonical label). These assets remain in the app where they are existing
// SketchAI line art; they simply do not inflate the distinct-option count.
// Key each reason by the stable artwork id returned by getArtworkVariants().
export const MANUAL_EXCLUSIONS = {
  ant: {
    'ant-line': 'same ant body/leg arrangement, shown turned horizontally',
  },
  airplane: {
    'airplane-variant-2': 'same top-down aircraft form, only angled/rotated',
    'airplane-variant-3': 'same top-down aircraft form with minor path changes',
  },
  apple: {
    'apple-line': 'same apple profile and leaf as the primary',
  },
  axe: {
    'axe-line': 'the outline does not read as an axe head',
  },
  banana: {
    'banana-line': 'same crescent-shaped banana profile as the primary',
  },
  barn: {
    'barn-line': 'same front-facing barn silhouette as the primary',
  },
  bear: {
    'bear-line': 'teddy-bear pose rather than a whole animal',
  },
  bicycle: {
    'bicycle-variant-2': 'same side-profile bicycle form as the primary',
    'bicycle-line': 'another side-profile bicycle; not a materially new view',
  },
  book: {
    'book-line': 'another open-book spread; visually repeats the primary form',
  },
  brain: {
    'brain-line': 'same brain outline; internal dividing detail only',
  },
  bread: {
    'bread-line': 'another single-slice view; the distinct loaf is already shown',
  },
  broccoli: {
    'broccoli-line': 'same single-head-and-stalk silhouette as the primary',
  },
  cake: {
    'cake-line': 'same front-facing birthday-cake form as the primary',
  },
  candle: {
    'candle-line': 'same upright single-candle view as the primary',
  },
  camera: {
    'camera-line': 'same front-facing camera and lens as the primary',
  },
  carrot: {
    'carrot-line': 'same single-carrot outline; leaf detail omitted',
  },
  car: {
    'car-variant-2': 'same side-profile generic car as the primary',
    'car-line': 'pickup-truck subtype, not a generic car option',
  },
  'cell phone': {
    'cell phone-variant-2': 'same portrait-phone outline; notch/home details only',
  },
  church: {
    'church-line': 'reads as a pulpit/cross stand rather than a church',
  },
  circle: {
    'circle-line': 'another plain circle outline; no distinct depiction',
  },
  compass: {
    'compass-line': 'same compass ring and needle; only tick marks differ',
  },
  cow: {
    'cow-line': 'cow head only; not a distinct whole-animal drawing',
  },
  crown: {
    'crown-line': 'same three-point crown silhouette; band detail only',
  },
  clock: {
    'clock-variant-2': 'ordinary analog face with extra exterior ticks only',
    'clock-line': 'ordinary analog face, visually repeats the primary',
  },
  cloud: {
    'cloud-variant-2': 'plain-cloud outline; the primary already shows this form',
    'cloud-line': 'plain-cloud outline; the primary already shows this form',
  },
  'cruise ship': {
    'cruise ship-imported-secondary': 'generic small ship, not a cruise liner',
    'cruise ship-line': 'generic boat, not a cruise liner',
  },
  cup: {
    'cup-line': 'same handled-mug form as the existing SketchAI mug variant',
  },
  dolphin: {
    'dolphin-line': 'same jumping-dolphin profile as the source options',
  },
};

export function reviewBatch1Category(label) {
  const all = getArtworkVariants(label, { max: 32 });
  const clean = all.filter((v) => v.origin !== 'icon');
  const primary = clean[0] ?? null;
  if (!primary) return {
    label, primary: null, options: [], extras: [], lineArt: null,
    lineArtCandidate: null, duplicates: [],
  };

  const options = [primary];
  const duplicates = [];
  const exclusions = MANUAL_EXCLUSIONS[label] ?? {};
  const candidates = clean.filter((v) => v !== primary && v.origin !== 'lineart');
  for (const candidate of candidates) {
    const manualReason = exclusions[candidate.id];
    if (manualReason) {
      duplicates.push({ candidate, manual: true, reason: manualReason });
      continue;
    }
    const m = raster(candidate);
    const overlaps = options.map((kept) => ({ kept, score: visualOverlap(m, raster(kept)) }));
    const closest = overlaps.reduce((a, b) => b.score > a.score ? b : a, overlaps[0]);
    if (closest.score >= DISTINCT_OVERLAP_LIMIT) {
      duplicates.push({ candidate, comparedTo: closest.kept, overlap: closest.score });
    } else {
      options.push(candidate);
    }
  }

  const foundLineArt = clean.find((v) => v.origin === 'lineart') ?? null;
  // If the hand-authored line drawing is the category's sole primary, don't
  // render/count that same object a second time as an alternate.
  const lineArtCandidate = foundLineArt === primary ? null : foundLineArt;
  let lineArt = null;
  if (lineArtCandidate && lineArtCandidate !== primary) {
    const manualReason = exclusions[lineArtCandidate.id];
    if (manualReason) {
      duplicates.push({ candidate: lineArtCandidate, manual: true, reason: manualReason, lineArt: true });
    } else {
      const m = raster(lineArtCandidate);
      const overlaps = options.map((kept) => ({ kept, score: visualOverlap(m, raster(kept)) }));
      const closest = overlaps.reduce((a, b) => b.score > a.score ? b : a, overlaps[0]);
      if (closest.score >= DISTINCT_OVERLAP_LIMIT) {
        duplicates.push({ candidate: lineArtCandidate, comparedTo: closest.kept, overlap: closest.score, lineArt: true });
      } else {
        lineArt = lineArtCandidate;
        options.push(lineArtCandidate);
      }
    }
  }

  return {
    label,
    primary,
    options,
    extras: options.filter((v) => v !== primary && v.origin !== 'lineart'),
    lineArt,
    lineArtCandidate,
    duplicates,
  };
}

export function summarizeBatch1() {
  const rows = BATCH1_LABELS.map(reviewBatch1Category);
  const counts = { threePlus: 0, exactlyTwo: 0, exactlyOne: 0, zero: 0 };
  for (const row of rows) {
    if (row.options.length >= 3) counts.threePlus++;
    else if (row.options.length === 2) counts.exactlyTwo++;
    else if (row.options.length === 1) counts.exactlyOne++;
    else counts.zero++;
  }
  return { rows, counts };
}
