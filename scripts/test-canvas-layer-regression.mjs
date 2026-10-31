#!/usr/bin/env node
// Regression for the object-backed canvas architecture: rough sketching stays
// temporary, clean artwork is rendered from scene state, and overlapping
// insertions preserve every existing object's editable source data.
import assert from 'node:assert/strict';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';
import { getSketchBounds } from '../src/ai/preprocess.js';
import { getArtworkVariants, variantToEditableSvgString } from '../src/data/artwork.js';
import {
  addSceneObject,
  artworkImageKey,
  createSceneObject,
  getSceneObjectPlacement,
  renderScene,
} from '../src/lib/scene.js';

const WIDTH = 1200;
const HEIGHT = 720;
const COLOR = '#242422';

function renderArtwork(variant, color = COLOR) {
  assert.ok(variant, 'expected an existing clean artwork variant');
  const svg = variantToEditableSvgString(variant, {
    width: variant.w,
    height: variant.h,
    color,
  });
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
  const context = canvas.getContext('2d');
  context.strokeStyle = '#000';
  context.lineWidth = 14;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const cx = 650;
  const cy = 390;
  const radius = 86;
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.stroke();
  for (let index = 0; index < 8; index += 1) {
    const angle = (index * Math.PI) / 4;
    context.beginPath();
    context.moveTo(cx + Math.cos(angle) * (radius + 18), cy + Math.sin(angle) * (radius + 18));
    context.lineTo(cx + Math.cos(angle) * (radius + 52), cy + Math.sin(angle) * (radius + 52));
    context.stroke();
  }
}

const permanent = createCanvas(WIDTH, HEIGHT);
const sketch = createCanvas(WIDTH, HEIGHT);
const houseVariant = getArtworkVariants('house')[0];
const sunVariant = getArtworkVariants('sun')[0];
const artworkCache = new Map([
  [artworkImageKey(houseVariant.id, COLOR), renderArtwork(houseVariant)],
  [artworkImageKey(sunVariant.id, COLOR), renderArtwork(sunVariant)],
]);
const housePlacement = { x: 420, y: 250, width: 300, height: 300 };
const house = createSceneObject({
  id: 'house-1', artwork: houseVariant, label: 'house', color: COLOR, ...housePlacement,
});
let objects = [house];

// Render the clean scene. The object list, not these pixels, is authoritative.
renderScene(objects, permanent, artworkCache);
const originalHousePixels = Buffer.from(pixels(permanent));
assert.ok(inkCount(permanent) > 0, 'accepted house should render');

// Draw a temporary sun over the accepted house. It must not touch the clean-art
// renderer, and the two layers must contain overlapping alpha pixels.
drawRoughSun(sketch);
const bounds = getSketchBounds(sketch);
assert.ok(bounds.width > 0 && bounds.height > 0, 'temporary sun should have bounds');
assert.deepEqual(Buffer.from(pixels(permanent)), originalHousePixels,
  'ordinary rough drawing must never paint onto the clean-art canvas');
let overlapPixels = 0;
const cleanBeforeInsert = pixels(permanent);
const roughPixels = pixels(sketch);
for (let index = 3; index < cleanBeforeInsert.length; index += 4) {
  if (cleanBeforeInsert[index] > 0 && roughPixels[index] > 10) overlapPixels += 1;
}
assert.ok(overlapPixels > 0, 'rough sun must overlap existing house pixels');

// Accepting a suggestion creates a second scene object. Re-rendering the scene
// composes the two vector-backed objects in order without flattening the house.
const placement = getSceneObjectPlacement(bounds, sunVariant, WIDTH, HEIGHT);
const sun = createSceneObject({
  id: 'sun-1', artwork: sunVariant, label: 'sun', color: COLOR, ...placement,
});
objects = addSceneObject(objects, sun);
assert.equal(objects.length, 2, 'both clean drawings remain independently editable objects');
assert.equal(objects[0].id, house.id, 'the original object remains first in the scene');
assert.deepEqual(objects[0], house, 'inserting over a rough sketch does not mutate existing object data');

// Poison the context's composite mode: each object must explicitly paint with
// source-over, and renderScene must leave the caller's context state restored.
const context = permanent.getContext('2d');
context.globalCompositeOperation = 'destination-out';
renderScene(objects, permanent, artworkCache);
assert.equal(context.globalCompositeOperation, 'destination-out', 'scene renderer restores caller composite state');
assert.ok(inkCount(permanent) > 0, 'scene objects render after an overlapping insertion');
const afterInsert = Buffer.from(pixels(permanent));
renderScene(objects, permanent, artworkCache);
assert.deepEqual(Buffer.from(pixels(permanent)), afterInsert,
  'rendering the same scene twice produces identical clean-art pixels');

// The temporary sketch is cleared only after the accepted object is in scene
// state. The permanent pixels are still a pure render of the two objects.
sketch.getContext('2d').clearRect(0, 0, WIDTH, HEIGHT);
assert.equal(inkCount(sketch), 0, 'temporary sketch layer is cleared after acceptance');
assert.equal(getSketchBounds(sketch).width, 0, 'cleared sketch has no remaining bounds');
assert.deepEqual(Buffer.from(pixels(permanent)), afterInsert,
  'clearing the temporary sketch does not alter the clean scene render');

console.log('Scene-layer overlap regression');
console.log('================================');
console.log(`existing house pixels overlapping rough sun : ${overlapPixels}`);
console.log(`scene objects after overlapping acceptance  : ${objects.length}`);
console.log('clean-art render is deterministic            : yes');
console.log(`temporary sketch ink after acceptance        : ${inkCount(sketch)}`);
console.log('PASS');
