#!/usr/bin/env node
// Sanity-checks every artwork option by actually rasterising it.
//
//   node scripts/validate-artwork.mjs
//
// Catches the failure modes that matter for a suggestion bar: a variant that
// renders blank, one that is a solid blob, or one whose drawing is tiny inside
// its own frame. It cannot tell you whether a dog looks like a dog — use
// scripts/render-variant-sheet.mjs and look at the sheet for that.

import { Resvg } from '@resvg/resvg-js';
import { getArtworkVariants, variantToSvgString } from '../src/data/artwork.js';
import { categories } from '../src/data/categories.js';

const SIZE = 128;

function measure(svg) {
  // Read resvg's raw RGBA directly. (Piping the PNG through an @napi-rs Image
  // and drawImage() silently draws nothing in this build.)
  const rendered = new Resvg(svg, { fitTo: { mode: 'width', value: SIZE } }).render();
  const width = rendered.width;
  const height = rendered.height;
  const data = new Uint8ClampedArray(rendered.pixels);

  let ink = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        ink += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { ink: 0, span: 0 };
  return {
    ink: ink / (width * height),
    span: Math.max(maxX - minX + 1, maxY - minY + 1) / Math.max(width, height),
  };
}

const problems = [];
let checked = 0;
let totalVariants = 0;

for (const category of categories) {
  const variants = getArtworkVariants(category.label);
  totalVariants += variants.length;
  variants.forEach((variant, index) => {
    const svg = variantToSvgString(variant, { size: SIZE, color: '#242422' });
    if (!svg) {
      problems.push(`${category.label} #${index + 1}: no SVG produced`);
      return;
    }
    let stats;
    try {
      stats = measure(svg);
    } catch (error) {
      problems.push(`${category.label} #${index + 1}: render failed (${error.message})`);
      return;
    }
    checked += 1;
    const where = `${category.label} #${index + 1} (${variant.origin})`;
    if (stats.ink < 0.005) problems.push(`${where}: renders blank (ink ${(stats.ink * 100).toFixed(2)}%)`);
    else if (stats.ink > 0.85) problems.push(`${where}: solid blob (ink ${(stats.ink * 100).toFixed(1)}%)`);
    if (stats.span > 0 && stats.span < 0.35) {
      problems.push(`${where}: drawing too small in frame (span ${(stats.span * 100).toFixed(0)}%)`);
    }
  });
}

console.log('Artwork rasterisation check');
console.log('='.repeat(60));
console.log(`categories        : ${categories.length}`);
console.log(`artwork options   : ${totalVariants}`);
console.log(`rasterised        : ${checked}`);
console.log(`problems          : ${problems.length}`);
if (problems.length) {
  console.log();
  for (const problem of problems.slice(0, 40)) console.log(`  ! ${problem}`);
  if (problems.length > 40) console.log(`  … and ${problems.length - 40} more`);
}
process.exitCode = problems.length ? 1 : 0;
