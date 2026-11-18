// Artwork for suggestion cards.
//
// Every Quick, Draw! category can be a guess, and every category now has at
// least one bundled drawing. Tiers describe the icon metadata:
//   A - a direct icon for the object (e.g. cat -> cat face)
//   B - a close, readable stand-in (e.g. fence -> Material "fence")
//   C - no suitable bundled icon; artwork comes from reviewed line art or an
//     original SketchAI fallback drawing instead of a misleading picture.
//
// Icons and fallback drawings are bundled locally (src/data/icons.js and
// src/data/fallback-art.js) so nothing is fetched at runtime.
import { ICONS, ICON_LICENSES } from './icons.js';
import { categories, categoriesByLabel, categoriesByNormalisedLabel } from './categories.js';
import { VARIANT_SETS } from './artwork-variants.js';
import { LINE_ART } from './line-art.js';
import { IMPORTED_ART } from './imported-art.js';
import { IMPORTED_ART_VARIANTS as BATCH1_IMPORTED_ART_VARIANTS } from './imported-art-variants.js';
import { IMPORTED_ART_VARIANTS as BATCH2_IMPORTED_ART_VARIANTS } from './imported-art-variants-batch2.js';
import { IMPORTED_ART_VARIANTS as BATCH3_IMPORTED_ART_VARIANTS } from './imported-art-variants-batch3.js';
import { BATCH1_DERIVED_ART } from './batch1-derived-art.js';
import { BATCH2_DERIVED_ART } from './batch2-derived-art.js';
import { BATCH3_DERIVED_ART } from './batch3-derived-art.js';
import { FALLBACK_ART } from './fallback-art.js';

// Keep the separately reviewed generated maps independent on disk; merge them
// only at lookup so Batch-1 QA and its frozen review artifacts remain intact.
const IMPORTED_ART_VARIANTS = {
  ...BATCH1_IMPORTED_ART_VARIANTS,
  ...BATCH2_IMPORTED_ART_VARIANTS,
  ...BATCH3_IMPORTED_ART_VARIANTS,
};

/** Model labels use underscores ("alarm_clock"); the official list uses spaces. */
export function normaliseLabel(label) {
  return String(label).toLowerCase().replace(/_/g, ' ').trim();
}

// Batch 1 keeps its stricter clean-art fallback contract. Reviewed Batch-2/3
// sources are added ahead of the existing legacy icon fallback, which remains
// unchanged for those later categories.
const BATCH1_LABELS = new Set(categories.slice(0, 100).map(({ label }) => normaliseLabel(label)));

const ALIASES = {
  'smiley face': 'smiley face',
  't shirt': 't-shirt',
  'tshirt': 't-shirt',
  'alarm': 'alarm clock',
  'lightbulb': 'light bulb',
  'bike': 'bicycle',
  'plane': 'airplane',
  'coffee cup': 'coffee cup',
  'cup': 'cup',
  'face': 'face',
  'mouse': 'mouse',
  'television': 'television',
};

/** Category metadata for a model label, in any casing/spacing. */
export function getCategory(label) {
  const name = normaliseLabel(label);
  return (
    categoriesByNormalisedLabel.get(name) ??
    categoriesByLabel.get(name) ??
    categoriesByLabel.get(ALIASES[name]) ??
    null
  );
}

export function hasArtwork(label) {
  return getArtworkVariants(label, { max: 1 }).length > 0;
}

export function getIconData(label) {
  const category = getCategory(label);
  if (!category?.key) return null;
  const icon = ICONS[category.key];
  if (!icon) return null;
  return { ...icon, key: category.key, tier: category.tier, source: category.source };
}

/** Human-friendly label for display. */
export function displayName(label) {
  const category = getCategory(label);
  const name = category?.label ?? normaliseLabel(label);
  return name.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// --- inline SVG (React) -------------------------------------------------------
function iconMarkup(icon, { monochrome = false, color } = {}) {
  const tint = monochrome ? ` stroke="${color}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${icon.w} ${icon.h}"${tint}>${icon.b}</svg>`;
}

export function iconToSvgString(label, { size = 160, color } = {}) {
  const icon = getIconData(label);
  if (!icon) return null;
  const monochrome = icon.source === 'mdi';
  // Material icons are drawn with currentColor paths, so tint them with the
  // brush colour and convert the fill to a stroke-friendly paint.
  const body = monochrome ? `<g fill="${color ?? '#242422'}">${icon.b}</g>` : icon.b;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${icon.w} ${icon.h}">${body}</svg>`;
}

// --- variants ---------------------------------------------------------------
//
// A suggestion bar is more useful when one class offers a few visually
// different clean drawings: the intended object is often prediction #2 or #3,
// and even when it is #1 the user may prefer a different rendering of it.
//
// `getArtworkVariants()` puts the strongest clean drawing first, then source
// variants from the pinned open libraries, then the existing SketchAI line art.
// `batch1-derived-art.js` is used only where the approved source set has no
// reasonable accurate drawing; it does not replace prediction or canvas logic.

/**
 * Every artwork option for a label, best first.
 *
 * @param {string} label canonical or model-style label
 * @param {{max?: number}} [options]
 * @returns {Array<{id: string, w: number, h: number, b: string, origin: string, tier?: string, source?: string}>}
 */
export function getArtworkVariants(label, { max = 4 } = {}) {
  const variants = [];
  const key = normaliseLabel(label);
  const push = (art, id, origin, extra = {}) =>
    variants.push({ ...art, id: `${key}-${id}`, origin, ...extra });

  // The ordering contract is shared across canonical batches:
  //   1. strongest clean primary (open source, or original derived only when no
  //      readable, accurate source exists)
  //   2. genuinely different source/clean variants
  //   3. existing SketchAI hand-authored line art, kept available
  //   4. any older hand-authored alternates
  //   5. legacy icon fallback, then text-only
  //
  // A reviewed batch-specific derived drawing is primary; a replaced imported
  // glyph remains available as a secondary only when it is still useful.
  const derived = BATCH1_DERIVED_ART[key] ?? BATCH2_DERIVED_ART[key] ?? BATCH3_DERIVED_ART[key];
  if (derived) push(derived, 'derived', 'derived');

  const imported = IMPORTED_ART[key];
  if (imported) {
    push(imported, derived ? 'imported-secondary' : 'imported', derived ? 'imported-variant' : 'imported');
  }

  (IMPORTED_ART_VARIANTS[key] ?? []).forEach((extra, index) => {
    const { lib, key: sourceKey, mode, ...art } = extra;
    push(art, `source-${index + 2}`, 'imported-variant', { source: lib, sourceKey, mode });
  });

  const drawing = LINE_ART[key];
  if (drawing) push(drawing, 'line', 'lineart');

  (VARIANT_SETS[key] ?? []).forEach((extra, index) => {
    push(extra, `variant-${index + 2}`, 'variant');
  });

  const fallback = FALLBACK_ART[key];
  if (fallback) push(fallback, 'handdrawn-fallback', 'derived', { source: 'original' });

  const icon = getIconData(label);
  // In Batch 1, a legacy colour/filled icon is only a fallback, not an
  // alternate to an accurate clean drawing. For later batches preserve the
  // existing fallback behavior; this task must not alter their artwork pool.
  if (icon && (!BATCH1_LABELS.has(key) || !variants.length)) push(icon, 'icon', 'icon');

  return variants
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, Math.max(1, max));
}

/** Lower sorts first; all source art stays ahead of the preserved hand line art. */
function rank(art) {
  if (art.origin === 'imported' || art.origin === 'derived') return 0;
  if (art.origin === 'imported-variant') return 1;
  if (art.origin === 'lineart') return 2;
  if (art.origin === 'variant') return 3;
  if (art.origin === 'icon') return art.source === 'mdi' ? 4 : 5;
  return 6;
}

/** How many distinct artwork options a label has. */
export function variantCount(label) {
  return getArtworkVariants(label).length;
}

/**
 * One artwork option as a standalone SVG string.
 *
 * Bundled icons keep their own colours (emoji artwork looks wrong recoloured);
 * hand-authored variants are line art and take the brush colour, so an inserted
 * drawing matches the strokes the user made.
 */
export function variantToSvgString(variant, { size = 160, color = '#242422', width = size, height = size } = {}) {
  if (!variant) return null;
  // Line art (primary and alternates) is drawn with the pen colour, so an
  // inserted drawing matches the brush the user picked.
  const isLineArt =
    variant.origin === 'imported' ||
    variant.origin === 'imported-variant' ||
    variant.origin === 'derived' ||
    variant.origin === 'lineart' ||
    variant.origin === 'variant';
  const body = isLineArt
    ? variant.b.replaceAll('STROKE', color)
    : variant.source === 'mdi'
      ? `<g fill="${color}">${variant.b}</g>`
      : variant.b;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${variant.w} ${variant.h}">${body}</svg>`;
}

/**
 * Standalone artwork SVG for an editable scene object. Unlike suggestion-card
 * previews, scene objects are monochrome so their color can be changed later.
 */
export function variantToEditableSvgString(variant, { size = 160, color = '#242422', width = size, height = size } = {}) {
  if (!variant) return null;
  if (color === 'original') return variantToSvgString(variant, { size, width, height });
  const isLineArt =
    variant.origin === 'imported' ||
    variant.origin === 'imported-variant' ||
    variant.origin === 'derived' ||
    variant.origin === 'lineart' ||
    variant.origin === 'variant';
  let body;
  if (isLineArt) {
    body = variant.b.replaceAll('STROKE', color).replaceAll('currentColor', color);
  } else if (variant.source === 'mdi') {
    body = `<g fill="${color}">${variant.b.replaceAll('currentColor', color)}</g>`;
  } else if (variant.origin === 'icon') {
    body = variant.b
      .replace(/\b(fill|stroke)="(?!none"|url\()[^"]*"/gi, `$1="${color}"`)
      .replace(/\b(fill|stroke)\s*:\s*(?!none\b|url\()[^;"]+/gi, `$1:${color}`)
      .replaceAll('currentColor', color)
      .replaceAll('STROKE', color);
    if (!/\b(fill|stroke)=/i.test(body)) body = `<g fill="${color}" stroke="${color}">${body}</g>`;
  } else {
    body = variant.b.replaceAll('STROKE', color).replaceAll('currentColor', color);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${variant.w} ${variant.h}">${body}</svg>`;
}

export { iconMarkup, ICON_LICENSES };
