#!/usr/bin/env node
// Parametric shape geometry, transform, hit testing and raster rendering.
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { renderObjectRaster } from '../src/lib/doodle-eraser.js';
import {
  addSceneObject,
  createBitmapSceneObject,
  createSceneObject,
  createShapeSceneObject,
  hitTestObject,
  isThicknessEditable,
  adjustRasterThickness,
  moveShapeEndpoint,
  objectLocalToWorld,
  recolorSceneObjects,
  renderScene,
  resizeSceneObject,
  resizeSceneObjectsGroup,
  worldToObjectLocal,
} from '../src/lib/scene.js';

const line = createShapeSceneObject({
  id: 'line-1', shapeKind: 'line', from: { x: 70, y: 80 }, to: { x: 270, y: 180 },
  color: '#1255AA', strokeWidth: 8,
});
assert.equal(line.type, 'shape');
assert.equal(line.isSketchStroke, true);
assert.equal(line.width, 200);
assert.equal(line.height, 100);
assert.deepEqual(objectLocalToWorld(line, line.start), { x: 70, y: 80 });
assert.deepEqual(objectLocalToWorld(line, line.end), { x: 270, y: 180 });
assert.equal(hitTestObject(line, { x: 170, y: 130 }), true);
assert.equal(hitTestObject(line, { x: 170, y: 80 }), false, 'line bounds do not behave like a filled rectangle');

const moved = moveShapeEndpoint(line, 'end', { x: 320, y: 120 });
assert.deepEqual(objectLocalToWorld(moved, moved.start), { x: 70, y: 80 });
assert.deepEqual(objectLocalToWorld(moved, moved.end), { x: 320, y: 120 });
assert.equal(hitTestObject(moved, { x: 195, y: 100 }), true);

const nearPoint = (actual, expected) => {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-8 && Math.abs(actual.y - expected.y) < 1e-8,
    `${JSON.stringify(actual)} should be near ${JSON.stringify(expected)}`);
};
const rotated = { ...line, rotation: 37, flipX: true };
const worldEnd = objectLocalToWorld(rotated, rotated.end);
nearPoint(worldToObjectLocal(rotated, worldEnd), rotated.end);
const movedRotated = moveShapeEndpoint(rotated, 'start', { x: 55, y: 35 });
nearPoint(objectLocalToWorld(movedRotated, movedRotated.end), worldEnd);
nearPoint(objectLocalToWorld(movedRotated, movedRotated.start), { x: 55, y: 35 });

for (const shapeKind of ['rectangle', 'ellipse', 'arrow']) {
  const shape = createShapeSceneObject({
    id: shapeKind, shapeKind, from: { x: 100, y: 100 }, to: { x: 240, y: 210 },
    color: '#E26755', fillColor: shapeKind === 'rectangle' || shapeKind === 'ellipse' ? '#22AA77' : 'none',
    strokeWidth: 5,
  });
  assert.equal(shape.shapeKind, shapeKind);
  assert.equal(hitTestObject(shape, { x: 170, y: 155 }), true);
  assert.equal(hitTestObject(shape, shapeKind === 'arrow' ? { x: 100, y: 100 } : { x: 100, y: 155 }), true);
  const resized = resizeSceneObject(shape, { signX: 1, signY: 1 }, { x: 330, y: 260 });
  assert.ok(resized.width > shape.width && resized.height > shape.height);
  assert.ok(Math.abs(resized.start.x / resized.width - shape.start.x / shape.width) < 1e-10);
}

const groupArrow = createShapeSceneObject({
  id: 'group-arrow', shapeKind: 'arrow', from: { x: 100, y: 100 }, to: { x: 200, y: 160 },
  strokeWidth: 6,
});
const groupResize = resizeSceneObjectsGroup([groupArrow], [groupArrow], {
  x: groupArrow.x, y: groupArrow.y, width: groupArrow.width, height: groupArrow.height,
  right: groupArrow.x + groupArrow.width, bottom: groupArrow.y + groupArrow.height,
}, { signX: 1, signY: 1 }, { x: 300, y: 260 });
assert.ok(groupResize[0].end.x > groupArrow.end.x, 'group resize scales parametric endpoint positions');
assert.ok(groupResize[0].strokeWidth > groupArrow.strokeWidth, 'group resize scales shape stroke width with its geometry');

const filledRect = createShapeSceneObject({
  id: 'filled', shapeKind: 'rectangle', from: { x: 20, y: 20 }, to: { x: 120, y: 90 },
  fillColor: '#F0C000',
});
assert.equal(hitTestObject(filledRect, { x: 70, y: 55 }), true);
const recolored = recolorSceneObjects([filledRect], ['filled'], '#12A4F7');
assert.equal(recolored[0].color, '#12A4F7');
assert.equal(recolored[0].fillColor, '#F0C000', 'outline recoloring preserves the independent fill setting');

const outlineArtwork = createSceneObject({
  id: 'outline-art', label: 'Outline', x: 10, y: 10, width: 100, height: 100,
  artwork: { id: 'outline-art', w: 100, h: 100, origin: 'imported',
    b: '<g fill="none" stroke="STROKE" stroke-width="2"><path d="M10 10L90 90"/></g>' },
});
const solidArtwork = createSceneObject({
  id: 'solid-art', label: 'Solid', x: 10, y: 10, width: 100, height: 100,
  artwork: { id: 'solid-art', w: 100, h: 100, origin: 'imported',
    b: '<path fill="STROKE" d="M10 10h80v80H10z"/>' },
});
const handMark = createBitmapSceneObject({
  id: 'hand-mark', bitmapId: 'hand-mark', bitmap: 'data:image/png;base64,AA==',
  label: 'Pencil Stroke', x: 0, y: 0, width: 40, height: 40, isSketchStroke: true,
});
const suggestedRaster = { ...handMark, id: 'suggested-raster', isSketchStroke: false };
assert.equal(isThicknessEditable(outlineArtwork), true, 'outlined suggestions expose thickness adjustment');
assert.equal(isThicknessEditable(solidArtwork), false, 'solid suggestions are left unchanged');
assert.equal(isThicknessEditable(handMark), true, 'hand-drawn bitmap doodles expose thickness adjustment');
assert.equal(isThicknessEditable(suggestedRaster), false, 'non-user raster art is excluded');

const ink = createCanvas(32, 24);
const inkContext = ink.getContext('2d');
inkContext.fillStyle = '#111111';
inkContext.fillRect(15, 6, 2, 12);
const countOpaque = (source) => {
  const data = source.getContext('2d').getImageData(0, 0, source.width, source.height).data;
  let count = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count += 1;
  return count;
};
const originalInkPixels = countOpaque(ink);
const thickenedInk = adjustRasterThickness(ink, ink.width, ink.height, 6,
  (width, height) => createCanvas(width, height));
const thinnedInk = adjustRasterThickness(ink, ink.width, ink.height, -4,
  (width, height) => createCanvas(width, height));
assert.ok(countOpaque(thickenedInk) > originalInkPixels, 'positive adjustment visibly thickens a doodle');
assert.ok(countOpaque(thinnedInk) < originalInkPixels, 'negative adjustment visibly thins a doodle');

const canvas = createCanvas(400, 300);
const scene = addSceneObject([], createShapeSceneObject({
  id: 'render-arrow', shapeKind: 'arrow', from: { x: 40, y: 50 }, to: { x: 300, y: 210 },
  color: '#123456', strokeWidth: 12, arrowHead: 'both',
}));
renderScene(scene, canvas, null);
const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
assert.ok(pixels.some((value, index) => index % 4 === 3 && value > 0), 'shape renderer paints visible pixels');
assert.ok(scene[0].start && scene[0].end && scene[0].arrowHead === 'both', 'arrow geometry remains parametric/editable');
const thickerShapeCanvas = createCanvas(400, 300);
renderScene(scene.map((object) => ({ ...object, thicknessDelta: 8 })), thickerShapeCanvas, null);
assert.ok(countOpaque(thickerShapeCanvas) > countOpaque(canvas), 'shape thickness delta changes rendered line weight');
const localRaster = renderObjectRaster({
  object: { ...scene[0], rotation: 47, flipX: true }, pixelScale: 2,
  canvasFactory: (width, height) => createCanvas(width, height),
});
const rasterPixels = localRaster.getContext('2d').getImageData(0, 0, localRaster.width, localRaster.height).data;
assert.ok(rasterPixels.some((value, index) => index % 4 === 3 && value > 0), 'shape raster supports doodle erasing in object-local space');

console.log('Shape tool unit checks passed.');
