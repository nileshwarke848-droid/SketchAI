#!/usr/bin/env node
// Renders every artwork variant to a labelled PNG grid so the drawings can be
// eyeballed without a browser.
//
//   node scripts/render-variant-sheet.mjs [output.png]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, Image as NapiImage } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';
import { getArtworkVariants, variantToSvgString } from '../src/data/artwork.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = process.argv[2] ?? path.join(ROOT, 'training', 'work', 'variant-sheet.png');

// Kept in sync with VARIANT_SETS in src/data/artwork-variants.js. Canonical
// Quick, Draw! labels only — "heart" is not a category, and it is "sailboat" /
// "cell phone", not "boat" / "phone".
const LABELS = [
  'sun', 'flower', 'tree', 'house', 'cat', 'dog', 'car', 'bus', 'airplane', 'fish', 'umbrella',
  'train', 'shoe', 'guitar', 'elephant', 'lion', 'bicycle', 'bird', 'sailboat', 'chair', 'clock',
  'cloud', 'cup', 'door', 'eye', 'face', 'hand', 'baseball bat', 'key', 'moon', 'cell phone',
  'star', 'table',
];

const CELL = 132;
const PAD = 8;
const HEADER = 26;
const COLS = 4;

function rasterise(svg) {
  const rendered = new Resvg(svg, { fitTo: { mode: 'width', value: CELL } }).render();
  const image = new NapiImage();
  image.src = rendered.asPng();
  return image;
}

const rows = Math.ceil(LABELS.length / COLS);
const canvas = createCanvas(COLS * CELL, rows * (CELL + HEADER));
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, canvas.width, canvas.height);

LABELS.forEach((label, index) => {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const x = col * CELL;
  const y = row * (CELL + HEADER);

  ctx.fillStyle = '#f4f4f2';
  ctx.fillRect(x + 2, y + 2, CELL - 4, CELL + HEADER - 4);

  ctx.fillStyle = '#242422';
  ctx.font = '15px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + PAD, y + 18);

  const variants = getArtworkVariants(label);
  const slot = (CELL - PAD * 2) / Math.max(variants.length, 1);
  variants.forEach((variant, vIndex) => {
    const svg = variantToSvgString(variant, { size: 160, color: '#242422' });
    if (!svg) return;
    try {
      const image = rasterise(svg);
      const size = Math.min(slot - 6, CELL - PAD * 2 - HEADER);
      ctx.drawImage(image, x + PAD + vIndex * slot, y + HEADER + PAD, size, size);
    } catch (error) {
      ctx.fillStyle = '#c0392b';
      ctx.fillText('ERR', x + PAD + vIndex * slot, y + HEADER + 30);
    }
  });
});

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, canvas.toBuffer('image/png'));

let total = 0;
for (const label of LABELS) total += getArtworkVariants(label).length;
console.log(`labels: ${LABELS.length}  variants rendered: ${total}`);
console.log(`sheet: ${OUTPUT}`);
