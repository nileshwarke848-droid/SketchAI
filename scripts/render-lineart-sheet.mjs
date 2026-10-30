#!/usr/bin/env node
// Contact sheet for the clean line-art system ONLY.
//
//   node scripts/render-lineart-sheet.mjs [output.png]
//
// Deliberately excludes legacy emoji/icon fallbacks: this sheet exists so the
// line-art drawings can be judged on their own, without an emoji sneaking in
// and making a category look finished when it is not.
//
// Layout: primaries grouped demo-critical -> common -> remaining, then a final
// grid of the second line-art variants for categories that have one.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, ImageData as NapiImageData } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';
import { getArtworkVariants, variantToSvgString } from '../src/data/artwork.js';
import { LINE_ART } from '../src/data/line-art.js';
import { categories } from '../src/data/categories.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = process.argv[2] ?? path.join(ROOT, 'training', 'work', 'art-review');

const INK = '#1a1a18';

const DEMO = ['dog', 'cat', 'house', 'car', 'bus', 'airplane', 'fish', 'tree', 'flower', 'sun', 'umbrella'];
const COMMON = ['train', 'guitar', 'shoe', 'elephant', 'lion', 'bicycle', 'bird', 'sailboat', 'chair',
  'clock', 'cloud', 'cup', 'door', 'eye', 'face', 'hand', 'key', 'moon', 'cell phone', 'star', 'table'];

const drawn = Object.keys(LINE_ART);
const rest = drawn.filter((l) => !DEMO.includes(l) && !COMMON.includes(l)).sort();

/** Every artwork option for a label that is genuinely line art. */
function lineArtOptions(label) {
  return getArtworkVariants(label).filter(
    (option) => option.origin === 'lineart' || option.origin === 'variant',
  );
}

function drawSvg(ctx, svg, x, y, size) {
  const rendered = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render();
  const pixels = new Uint8ClampedArray(rendered.pixels);
  const off = createCanvas(rendered.width, rendered.height);
  off.getContext('2d').putImageData(
    new NapiImageData(pixels, rendered.width, rendered.height), 0, 0,
  );
  ctx.drawImage(off, x, y);
}

/**
 * Renders one self-contained sheet. Small groups get big cells so the drawings
 * can actually be judged; the long tail gets denser cells to stay readable.
 */
function renderSheet({ title, labels, optionsIndex = 0, cols, cell, file }) {
  const labelH = 20;
  const row = cell + labelH + 10;
  const width = cols * cell + 40;
  const height = 40 + Math.ceil(labels.length / cols) * row + 20;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#b36f58';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${title}  —  ${labels.length}`, 20, 26);
  ctx.strokeStyle = '#e9eae4';
  ctx.beginPath();
  ctx.moveTo(20, 36);
  ctx.lineTo(width - 20, 36);
  ctx.stroke();

  labels.forEach((label, index) => {
    const col = index % cols;
    const rowIndex = Math.floor(index / cols);
    const x = 20 + col * cell;
    const cellY = 48 + rowIndex * row;

    ctx.fillStyle = '#fafaf8';
    ctx.fillRect(x + 2, cellY + 2, cell - 6, row - 8);

    const option = lineArtOptions(label)[optionsIndex];
    if (!option) return;
    try {
      drawSvg(ctx, variantToSvgString(option, { size: cell - 34, color: INK }),
        x + 17, cellY + 8, cell - 34);
    } catch (error) {
      ctx.fillStyle = '#c0392b';
      ctx.font = '11px sans-serif';
      ctx.fillText('render failed', x + 10, cellY + 40);
    }

    ctx.fillStyle = '#3d463c';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + (cell - 6) / 2, cellY + cell + 4);
    ctx.textAlign = 'left';
  });

  const out = path.join(OUT_DIR, file);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(out, canvas.toBuffer('image/png'));
  return { file, width, height, count: labels.length };
}

// ---- render ----------------------------------------------------------------
const demoLabels = DEMO.filter((l) => LINE_ART[l]);
const commonLabels = COMMON.filter((l) => LINE_ART[l]);
const seconds = drawn.filter((label) => lineArtOptions(label).length > 1);

const made = [
  // Big cells for the eleven that must look excellent.
  renderSheet({ title: 'DEMO-CRITICAL', labels: demoLabels, cols: 4, cell: 200, file: '1-demo-critical.png' }),
  renderSheet({ title: 'COMMON OBJECTS', labels: commonLabels, cols: 5, cell: 160, file: '2-common-objects.png' }),
  renderSheet({ title: 'REMAINING CATEGORIES', labels: rest, cols: 8, cell: 120, file: '3-remaining.png' }),
];
if (seconds.length) {
  made.push(renderSheet({
    title: 'SECOND LINE-ART VARIANTS', labels: seconds, optionsIndex: 1, cols: 6, cell: 150,
    file: '4-second-variants.png',
  }));
}

// ---- report ----------------------------------------------------------------
const withArt = categories.filter((c) => getArtworkVariants(c.label)[0]?.origin === 'lineart').length;
console.log('Clean line-art contact sheets');
console.log('='.repeat(56));
console.log(`line-art drawings      : ${drawn.length}`);
console.log(`categories w/ primary  : ${withArt} / ${categories.length}`);
console.log(`categories w/ 2nd      : ${seconds.length}`);
console.log();
for (const sheet of made) {
  console.log(`  ${sheet.file.padEnd(26)} ${String(sheet.count).padStart(3)} drawings  ${sheet.width}x${sheet.height}`);
}
console.log(`\nwritten to ${OUT_DIR}`);
