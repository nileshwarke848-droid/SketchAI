#!/usr/bin/env node
// Contact sheet for the imported open-source line art ONLY.
//
//   node scripts/render-oss-sheet.mjs [outputDir]
//
// Shows the approved primary drawing for each category, and nothing else — no
// emoji fallbacks mixed in, so the artwork can be judged on its own.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, ImageData as NapiImageData } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';
import { getArtworkVariants, variantToSvgString } from '../src/data/artwork.js';
import { IMPORTED_ART } from '../src/data/imported-art.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = process.argv[2] ?? path.join(ROOT, 'training', 'oss-review');
const INK = '#1a1a18';

const DEMO = ['dog', 'cat', 'house', 'car', 'bus', 'airplane', 'fish', 'tree',
  'flower', 'sun', 'umbrella', 'zebra'];
const COMMON = ['train', 'guitar', 'shoe', 'elephant', 'lion', 'bicycle', 'bird',
  'sailboat', 'chair', 'clock', 'cloud', 'cup', 'door', 'eye', 'face', 'hand',
  'key', 'moon', 'cell phone', 'star', 'table'];

const drawn = Object.keys(IMPORTED_ART);
const rest = drawn.filter((l) => !DEMO.includes(l) && !COMMON.includes(l)).sort();

/** The primary the app actually shows, rendered exactly as a card shows it. */
function svgFor(label, size) {
  const primary = getArtworkVariants(label)[0];
  if (!primary) return null;
  const svg = variantToSvgString(primary, { size, color: INK });
  return svg ? svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`) : null;
}

/** Only categories whose primary is an imported drawing. */
const importedLabels = new Set(Object.keys(IMPORTED_ART));

function drawSvg(ctx, svg, x, y, size) {
  const rendered = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render();
  const pixels = new Uint8ClampedArray(rendered.pixels);
  const off = createCanvas(rendered.width, rendered.height);
  off.getContext('2d').putImageData(
    new NapiImageData(pixels, rendered.width, rendered.height), 0, 0,
  );
  ctx.drawImage(off, x, y);
}

function renderSheet({ labels, cols, cell, file }) {
  const labelH = 20;
  const row = cell + labelH + 10;
  const width = cols * cell + 40;
  const height = 40 + Math.ceil(labels.length / cols) * row + 20;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  labels.forEach((label, i) => {
    const col = i % cols;
    const line = Math.floor(i / cols);
    const x = 20 + col * cell;
    const y = 30 + line * row;
    ctx.strokeStyle = '#e2e0da';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    const svg = svgFor(label, cell - 24);
    if (svg) drawSvg(ctx, svg, x + 12, y + 12, cell - 24);
    ctx.fillStyle = '#5a5955';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + cell / 2, y + cell + 15, cell - 4);
  });

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, canvas.toBuffer('image/png'));
  console.log(`${path.relative(ROOT, file)}  ${width}x${height}  ${labels.length} drawings`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
console.log(`imported drawings: ${drawn.length}\n`);
const missingDemo = DEMO.filter((l) => !importedLabels.has(l));
const missingCommon = COMMON.filter((l) => !importedLabels.has(l));
if (missingDemo.length) console.log(`sheet A — no imported drawing for: ${missingDemo.join(', ')}`);
if (missingCommon.length) console.log(`sheet B — no imported drawing for: ${missingCommon.join(', ')}`);

renderSheet({ labels: DEMO.filter((l) => importedLabels.has(l)), cols: 4, cell: 170,
  file: path.join(OUT_DIR, 'A-demo-critical.png') });
renderSheet({ labels: COMMON.filter((l) => importedLabels.has(l)), cols: 5, cell: 140,
  file: path.join(OUT_DIR, 'B-common-objects.png') });
renderSheet({ labels: rest, cols: 8, cell: 110,
  file: path.join(OUT_DIR, 'C-remaining.png') });
