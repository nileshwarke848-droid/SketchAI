#!/usr/bin/env node
// Regression for replacing a temporary overlapping sketch without erasing
// previously accepted artwork. This exercises the same production helper used
// by App.jsx, with actual raster canvases and existing clean house/sun art.
import assert from 'node:assert/strict';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';
import { getSketchBounds } from '../src/ai/preprocess.js';
import { getArtworkVariants, variantToSvgString } from '../src/data/artwork.js';
import { commitSketchReplacement, getArtworkReplacementPlacement } from '../src/lib/canvas-layers.js';

const WIDTH = 1200;
const HEIGHT = 720;
const COLOR = '#242422';

function renderArtwork(variant) {
  assert.ok(variant, 'expected an existing clean artwork variant');
  const svg = variantToSvgString(variant, { size: 320, color: COLOR });
  const rendered = new Resvg(svg, { fitTo: { mode: 'width', value: 320 } }).render();
  const canvas = createCanvas(rendered.width, rendered.height);
  canvas.getContext('2d').putImageData(
    new ImageData(new Uint8ClampedArray(rendered.pixels), rendered.width, rendered.height),
    0,
    0,
  );
  return canvas;
}

function pixels(canvas) {
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
}

function inkCount(canvas) {
  const data = pixels(canvas);
  let count = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count += 1;
  return count;
}

function drawRoughSun(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const cx = 650;
  const cy = 390;
  const radius = 86;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 8; i += 1) {
    const angle = (i * Math.PI) / 4;
    const start = radius + 18;
    const end = radius + 52;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * start, cy + Math.sin(angle) * start);
    ctx.lineTo(cx + Math.cos(angle) * end, cy + Math.sin(angle) * end);
    ctx.stroke();
  }
}

const permanent = createCanvas(WIDTH, HEIGHT);
const sketch = createCanvas(WIDTH, HEIGHT);
const house = renderArtwork(getArtworkVariants('house')[0]);
const sun = renderArtwork(getArtworkVariants('sun')[0]);

// A: accept a clean house onto the permanent layer.
const permanentContext = permanent.getContext('2d');
permanentContext.drawImage(house, 420, 250, 300, 300);
const beforeSketch = new Uint8ClampedArray(pixels(permanent));
assert.ok(inkCount(permanent) > 0, 'accepted house should be present');

// B: draw a temporary sun so it overlaps the accepted house.
drawRoughSun(sketch);
const bounds = getSketchBounds(sketch);
assert.ok(bounds.width > 0 && bounds.height > 0, 'temporary sun should have bounds');
const beforeArtHash = Buffer.from(beforeSketch);
assert.deepEqual(Buffer.from(pixels(permanent)), beforeArtHash,
  'ordinary rough drawing must not paint onto the permanent art canvas');

const artBefore = pixels(permanent);
const sketchBefore = pixels(sketch);
let overlapPixels = 0;
for (let i = 0; i < artBefore.length; i += 4) {
  if (artBefore[i + 3] > 0 && sketchBefore[i + 3] > 10) overlapPixels += 1;
}
assert.ok(overlapPixels > 0, 'rough sun must overlap existing house pixels');

// Expected output is exactly normal source-over composition of the new clean
// sun over the untouched accepted house; transparent SVG regions preserve it.
const placement = getArtworkReplacementPlacement(bounds, WIDTH, HEIGHT);
const expected = createCanvas(WIDTH, HEIGHT);
const expectedContext = expected.getContext('2d');
expectedContext.drawImage(permanent, 0, 0);
expectedContext.drawImage(sun, placement.x, placement.y, placement.dimension, placement.dimension);
const expectedPixels = pixels(expected);

// Count old pixels under the rough mask that the clean sun itself does not
// cover. These are the pixels the old destination-out mask incorrectly erased.
const overlay = createCanvas(WIDTH, HEIGHT);
overlay.getContext('2d').drawImage(sun, placement.x, placement.y, placement.dimension, placement.dimension);
const overlayPixels = pixels(overlay);
let preservedUnderSketch = 0;
for (let i = 0; i < artBefore.length; i += 4) {
  if (artBefore[i + 3] > 0 && sketchBefore[i + 3] > 10 && overlayPixels[i + 3] === 0) {
    preservedUnderSketch += 1;
  }
}
assert.ok(preservedUnderSketch > 0,
  'scenario must include existing house pixels under the rough sketch but outside the clean sun ink');

// Seed destination-out as a trap: production replacement must explicitly use
// source-over and restore the prior context state, never erase the old drawing.
permanentContext.globalCompositeOperation = 'destination-out';
const result = commitSketchReplacement({
  permanentCanvas: permanent,
  sketchCanvas: sketch,
  image: sun,
  bounds,
});
assert.deepEqual(result, placement, 'replacement must preserve the sketch-derived placement');
assert.equal(permanentContext.globalCompositeOperation, 'destination-out',
  'replacement restores the caller composite state');
assert.deepEqual(Buffer.from(pixels(permanent)), Buffer.from(expectedPixels),
  'replacement must equal source-over artwork compositing over the original house');
assert.equal(inkCount(sketch), 0, 'temporary sketch layer must be completely clear after replacement');
assert.equal(getSketchBounds(sketch).width, 0, 'cleared sketch has no remaining bounds');

console.log('Canvas-layer overlap regression');
console.log('================================');
console.log(`existing house pixels overlapping rough sun : ${overlapPixels}`);
console.log(`old pixels preserved under sketch outside sun : ${preservedUnderSketch}`);
console.log('permanent output matches source-over expected  : yes');
console.log(`temporary sketch ink after replacement        : ${inkCount(sketch)}`);
console.log('PASS');
