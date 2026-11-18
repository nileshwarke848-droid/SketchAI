// Turns model predictions into the list of cards the suggestion bar renders.
//
// Kept pure and free of React so the ordering rules can be tested on their own.
//
// The product goal is NOT "was top-1 correct" — a 37.7% top-1 model is only
// useful if the user can find what they meant somewhere on the bar. So we spend
// our 12 cards across the top few classes rather than showing twelve near-identical
// options for one guess, and we never show the same picture twice.

import { displayName, getArtworkVariants, normaliseLabel } from '../data/artwork.js';

// How many predicted classes are allowed to contribute cards.
//
// Set to 10 to match the model's real strength: top-1 accuracy is only 37.71%
// but top-10 recall is 76.12%. Measured on the 16 hand-drawn doodles in
// training/doodles.json, drawing from 10 classes puts the intended object on the
// bar 14/16 times, versus 10/16 when drawing from only 5.
export const CLASSES_USED = 10;
/** Extra artwork options offered for each class beyond its primary one. */
export const VARIANTS_PER_CLASS = 2;
// Hard ceiling on rendered cards — keeps the DOM small and the row scannable.
// Ten slots are reserved for "one option per class" (the pass that decides
// whether the user can find their object); the last two let alternative
// renderings of the strongest guesses appear once duplicates free space.
export const MAX_CARDS = 12;

/**
 * A signature for the actual pixels a card would show.
 *
 * Many categories legitimately share one icon (clock/alarm clock, pillow/bed,
 * toe/foot). Two cards with the same drawing look like a bug, so identical
 * artwork is only ever rendered once no matter how many classes produce it.
 */
function artworkSignature(variant, label) {
  if (!variant) return `text:${normaliseLabel(label)}`;
  return `art:${variant.w}x${variant.h}:${variant.b}`;
}

/**
 * @param {Array<{label: string, score: number}>} predictions model output, best first
 * @param {{classesUsed?: number, variantsPerClass?: number, maxCards?: number}} [options]
 * @returns {Array<{id: string, label: string, name: string, score: number, variant: object|null, illustrated: boolean, pass: number}>}
 */
export function buildSuggestions(predictions, options = {}) {
  const {
    classesUsed = CLASSES_USED,
    variantsPerClass = VARIANTS_PER_CLASS,
    maxCards = MAX_CARDS,
  } = options;

  const classes = (predictions ?? [])
    .filter((p) => p && p.label)
    .slice(0, classesUsed);

  const cards = [];
  const seenArtwork = new Set();
  const seenLabels = new Set();

  const push = (prediction, variant, pass) => {
    if (cards.length >= maxCards) return;
    if (seenLabels.has(prediction.label) && pass === 1) return;
    const signature = artworkSignature(variant, prediction.label);
    if (seenArtwork.has(signature)) return; // duplicate visual — skip
    seenArtwork.add(signature);
    seenLabels.add(prediction.label);
    cards.push({
      id: `${prediction.label}#${variant?.id ?? 'text'}`,
      label: prediction.label,
      name: displayName(prediction.label),
      score: prediction.score,
      variant: variant ?? null,
      illustrated: Boolean(variant),
      pass,
    });
  };

  const optionsFor = (prediction, max = undefined) =>
    getArtworkVariants(prediction.label, max === undefined ? {} : { max });

  // PASS 1 — one option for every predicted class, strongest guess first. This
  // is the pass that matters for finding the intended object.
  for (const prediction of classes) {
    push(prediction, optionsFor(prediction, variantsPerClass)[0] ?? null, 1);
  }

  // PASS 2 — a second rendering of the same classes, for when the right object
  // is predicted but the first drawing is not the one the user pictured.
  for (const prediction of classes) {
    const variants = optionsFor(prediction, variantsPerClass);
    if (variants[1]) push(prediction, variants[1], 2);
  }

  // PASS 3 — only if there is still room, offer any further variants.
  for (const prediction of classes) {
    for (const variant of optionsFor(prediction).slice(variantsPerClass)) {
      push(prediction, variant, 3);
    }
  }

  return cards;
}
