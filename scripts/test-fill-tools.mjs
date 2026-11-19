#!/usr/bin/env node
// Dedicated raster bucket, background, layer-isolation and history regressions.
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { EditorHistory } from '../src/lib/editor-history.js';
import { createSceneObject, artworkImageKey, hitTestScene, renderScene } from '../src/lib/scene.js';
import { canvasToClientPoint, clientToCanvasPoint } from '../src/lib/canvas-coordinates.js';
import { composeFillBoundary, fillCanvasRegion, fillRasterRegion, floodFillMask } from '../src/lib/raster-fill.js';

const WIDTH = 1200;
const HEIGHT = 720;
const PIXEL_COUNT = WIDTH * HEIGHT;
const RED = '#e26755';
const BLUE = '#6590bd';

function layers() {
  return {
    reference: createCanvas(WIDTH, HEIGHT),
    fill: createCanvas(WIDTH, HEIGHT),
    scene: createCanvas(WIDTH, HEIGHT),
    sketch: createCanvas(WIDTH, HEIGHT),
  };
}

function compose(target, backgroundColor = '#ffffff') {
  return composeFillBoundary(target.reference, {
    backgroundColor,
    fillCanvas: target.fill,
    sceneCanvas: target.scene,
    sketchCanvas: target.sketch,
  });
}

function drawClosedRect(sketch) {
  const context = sketch.getContext('2d');
  context.strokeStyle = '#242422';
  context.lineWidth = 12;
  context.lineJoin = 'round';
  context.strokeRect(200, 150, 300, 220);
}

function colorAt(canvas, x, y) {
  return [...canvas.getContext('2d').getImageData(x, y, 1, 1).data];
}

function hasColor(canvas, x, y, [r, g, b, a = 255]) {
  const actual = colorAt(canvas, x, y);
  return actual[0] === r && actual[1] === g && actual[2] === b && actual[3] === a;
}

function check(name, fn) {
  fn();
  console.log(`  ✔ ${name}`);
}

console.log('Paint bucket and canvas-background tests');
console.log('=========================================');

const localObject = createCanvas(240, 180);
{
  const context = localObject.getContext('2d');
  context.strokeStyle = '#242422';
  context.lineWidth = 12;
  context.lineJoin = 'round';
  context.strokeRect(24, 24, 192, 132);
}
const localFill = fillRasterRegion({ canvas: localObject, seed: { x: 120, y: 90 }, color: RED });
check('filling inside a closed object writes color into its own raster', () => {
  assert.ok(localFill.changed > 1000);
  assert.equal(localFill.open, false);
  assert.deepEqual(colorAt(localObject, 120, 90), [226, 103, 85, 255]);
  assert.notDeepEqual(colorAt(localObject, 5, 5), [226, 103, 85, 255]);
});

const openObject = createCanvas(120, 90);
{
  const context = openObject.getContext('2d');
  context.strokeStyle = '#242422';
  context.lineWidth = 8;
  context.beginPath(); context.moveTo(20, 20); context.lineTo(100, 20); context.lineTo(100, 70); context.stroke();
}
const openFill = fillRasterRegion({ canvas: openObject, seed: { x: 35, y: 45 }, color: BLUE });
check('an open transparent area is not accidentally converted into a solid object fill', () => {
  assert.equal(openFill.changed, 0);
  assert.equal(openFill.open, true);
  assert.deepEqual(colorAt(openObject, 35, 45), [0, 0, 0, 0]);
});

const closed = layers();
drawClosedRect(closed.sketch);
compose(closed);
const closedFill = fillCanvasRegion({ referenceCanvas: closed.reference, fillCanvas: closed.fill, seed: { x: 250, y: 210 }, color: RED });
check('closed rectangular boundary fills its interior only', () => {
  assert.ok(closedFill.count > 40_000 && closedFill.count < 80_000);
  assert.ok(closedFill.changed > 40_000);
  assert.ok(hasColor(closed.fill, 250, 210, [226, 103, 85, 255]));
  assert.deepEqual(colorAt(closed.fill, 80, 80), [0, 0, 0, 0], 'the outside remains transparent on the fill layer');
  assert.deepEqual(colorAt(closed.fill, 200, 210), [0, 0, 0, 0], 'the line itself remains on the sketch layer');
});

const outside = layers();
drawClosedRect(outside.sketch);
compose(outside);
const outsideFill = fillCanvasRegion({ referenceCanvas: outside.reference, fillCanvas: outside.fill, seed: { x: 50, y: 50 }, color: BLUE });
check('outside click fills the exterior connected region, not the closed interior', () => {
  assert.ok(outsideFill.count > PIXEL_COUNT - 80_000);
  assert.ok(hasColor(outside.fill, 50, 50, [101, 144, 189, 255]));
  assert.deepEqual(colorAt(outside.fill, 250, 210), [0, 0, 0, 0]);
});

const gap = layers();
{
  const context = gap.sketch.getContext('2d');
  context.strokeStyle = '#242422';
  context.lineWidth = 12;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(200, 150); context.lineTo(500, 150);
  context.lineTo(500, 370);
  context.lineTo(430, 370);
  context.moveTo(410, 370); context.lineTo(200, 370);
  context.lineTo(200, 150);
  context.stroke();
}
compose(gap);
const escaped = fillCanvasRegion({ referenceCanvas: gap.reference, fillCanvas: gap.fill, seed: { x: 250, y: 200 }, color: RED });
check('a deliberately gapped boundary lets fill escape like a paint program', () => {
  assert.ok(escaped.count > PIXEL_COUNT * 0.9);
  assert.ok(hasColor(gap.fill, 50, 50, [226, 103, 85, 255]));
});

const recolor = layers();
drawClosedRect(recolor.sketch);
compose(recolor);
fillCanvasRegion({ referenceCanvas: recolor.reference, fillCanvas: recolor.fill, seed: { x: 250, y: 210 }, color: RED });
compose(recolor);
const blueResult = fillCanvasRegion({ referenceCanvas: recolor.reference, fillCanvas: recolor.fill, seed: { x: 250, y: 210 }, color: BLUE });
const repeatedResult = fillCanvasRegion({ referenceCanvas: recolor.reference, fillCanvas: recolor.fill, seed: { x: 250, y: 210 }, color: BLUE });
check('fill color changes work and repeating the same color is a safe no-op', () => {
  assert.ok(blueResult.changed > 0);
  assert.equal(repeatedResult.changed, 0);
  assert.ok(hasColor(recolor.fill, 250, 210, [101, 144, 189, 255]));
});

const undoLayers = layers();
drawClosedRect(undoLayers.sketch);
compose(undoLayers);
const history = new EditorHistory(8);
history.push({ objects: [], sketch: undoLayers.sketch.getContext('2d').getImageData(0, 0, WIDTH, HEIGHT), fill: undoLayers.fill.getContext('2d').getImageData(0, 0, WIDTH, HEIGHT), selectedObjectId: null, canvasBackgroundColor: '#ffffff', hasFill: false });
fillCanvasRegion({ referenceCanvas: undoLayers.reference, fillCanvas: undoLayers.fill, seed: { x: 250, y: 210 }, color: RED });
history.push({ objects: [], sketch: undoLayers.sketch.getContext('2d').getImageData(0, 0, WIDTH, HEIGHT), fill: undoLayers.fill.getContext('2d').getImageData(0, 0, WIDTH, HEIGHT), selectedObjectId: null, canvasBackgroundColor: '#ffffff', hasFill: true });
const undone = history.undo();
undoLayers.fill.getContext('2d').putImageData(undone.fill, 0, 0);
const undoPixel = colorAt(undoLayers.fill, 250, 210);
const redone = history.redo();
undoLayers.fill.getContext('2d').putImageData(redone.fill, 0, 0);
const redoPixel = colorAt(undoLayers.fill, 250, 210);
check('one history step restores a fill and redo reapplies it', () => {
  assert.deepEqual(undoPixel, [0, 0, 0, 0]);
  assert.equal(undone.hasFill, false);
  assert.deepEqual(redoPixel, [226, 103, 85, 255]);
  assert.equal(redone.hasFill, true);
});

const sceneBoundary = layers();
const outline = createCanvas(100, 100);
const outlineContext = outline.getContext('2d');
outlineContext.strokeStyle = '#242422';
outlineContext.lineWidth = 6;
outlineContext.strokeRect(4, 4, 92, 92);
const artwork = { id: 'editable-boundary', w: 100, h: 100, b: '<rect/>' };
const object = createSceneObject({ id: 'editable-boundary-1', artwork, label: 'outline', x: 250, y: 150, width: 300, height: 300, color: '#242422' });
const objectsBefore = JSON.stringify(object);
renderScene([object], sceneBoundary.scene, new Map([[artworkImageKey(artwork.id, object.color), outline]]));
const cleanPixelsBefore = Buffer.from(sceneBoundary.scene.getContext('2d').getImageData(0, 0, WIDTH, HEIGHT).data);
compose(sceneBoundary);
const sceneFill = fillCanvasRegion({ referenceCanvas: sceneBoundary.reference, fillCanvas: sceneBoundary.fill, seed: { x: 350, y: 250 }, color: RED });
const cleanPixelsAfter = Buffer.from(sceneBoundary.scene.getContext('2d').getImageData(0, 0, WIDTH, HEIGHT).data);
check('editable artwork remains separate and selectable after serving as a fill boundary', () => {
  assert.ok(sceneFill.changed > 0);
  assert.equal(JSON.stringify(object), objectsBefore);
  assert.equal(hitTestScene([object], { x: 350, y: 250 })?.id, object.id);
  assert.deepEqual(cleanPixelsAfter, cleanPixelsBefore, 'the clean object canvas is never flattened by fill');
});

const zoomed = layers();
drawClosedRect(zoomed.sketch);
compose(zoomed);
const logicalSeed = { x: 250, y: 210 };
const view = { zoom: 2, panX: -450, panY: -270 };
const viewport = { getBoundingClientRect: () => ({ left: 31, top: 47, width: 900, height: 540 }) };
const client = canvasToClientPoint(logicalSeed.x, logicalSeed.y, viewport, WIDTH, HEIGHT, view);
const mappedSeed = clientToCanvasPoint(client.x, client.y, viewport, WIDTH, HEIGHT, view);
const zoomFill = fillCanvasRegion({ referenceCanvas: zoomed.reference, fillCanvas: zoomed.fill, seed: mappedSeed, color: BLUE });
check('fill click under combined zoom and pan maps back to the correct logical region', () => {
  assert.ok(Math.abs(mappedSeed.x - logicalSeed.x) < 1e-8);
  assert.ok(Math.abs(mappedSeed.y - logicalSeed.y) < 1e-8);
  assert.ok(zoomFill.changed > 0);
  assert.ok(hasColor(zoomed.fill, logicalSeed.x, logicalSeed.y, [101, 144, 189, 255]));
});

for (const zoom of [0.25, 0.5, 1, 1.5, 2, 4]) {
  const target = layers();
  drawClosedRect(target.sketch);
  compose(target);
  const viewport = { getBoundingClientRect: () => ({ left: 31, top: 47, width: 900, height: 540 }) };
  const baseX = 900 * logicalSeed.x / WIDTH;
  const baseY = 540 * logicalSeed.y / HEIGHT;
  const viewAtSeed = { zoom, panX: 450 - baseX * zoom, panY: 270 - baseY * zoom };
  const clientPoint = canvasToClientPoint(logicalSeed.x, logicalSeed.y, viewport, WIDTH, HEIGHT, viewAtSeed);
  const clickPoint = clientToCanvasPoint(clientPoint.x, clientPoint.y, viewport, WIDTH, HEIGHT, viewAtSeed);
  const result = fillCanvasRegion({ referenceCanvas: target.reference, fillCanvas: target.fill, seed: clickPoint, color: RED });
  assert.ok(result.changed > 0, `${zoom * 100}% fill click should modify the enclosed region`);
  assert.ok(hasColor(target.fill, logicalSeed.x, logicalSeed.y, [226, 103, 85, 255]));
  console.log(`  ✔ ${zoom * 100}% zoom/pan fill click reaches the intended logical region`);
}

const backgroundLayers = layers();
compose(backgroundLayers, '#123456');
const backgroundHistory = new EditorHistory(5);
backgroundHistory.push({ objects: [], canvasBackgroundColor: '#ffffff', hasFill: false });
backgroundHistory.push({ objects: [], canvasBackgroundColor: '#123456', hasFill: false });
const backgroundUndo = backgroundHistory.undo();
const backgroundRedo = backgroundHistory.redo();
const backgroundFill = fillCanvasRegion({ referenceCanvas: backgroundLayers.reference, fillCanvas: backgroundLayers.fill, seed: { x: 900, y: 600 }, color: BLUE });
check('canvas background is independent state and background changes undo/redo', () => {
  assert.deepEqual(colorAt(backgroundLayers.reference, 900, 600), [18, 52, 86, 255]);
  assert.equal(backgroundUndo.canvasBackgroundColor, '#FFFFFF');
  assert.equal(backgroundRedo.canvasBackgroundColor, '#123456');
  assert.equal(backgroundFill.count, PIXEL_COUNT, 'a uniform background is one connected fill region');
});

const largeCanvas = createCanvas(WIDTH, HEIGHT);
const largeContext = largeCanvas.getContext('2d');
largeContext.fillStyle = '#ffffff';
largeContext.fillRect(0, 0, WIDTH, HEIGHT);
const start = Date.now();
const largeFill = floodFillMask(largeContext.getImageData(0, 0, WIDTH, HEIGHT), 0, 0);
const elapsed = Date.now() - start;
check('iterative large-area fill completes without recursion or stack overflow', () => {
  assert.equal(largeFill.count, PIXEL_COUNT);
  assert.ok(elapsed < 5000, `large area completed in ${elapsed}ms`);
  console.log(`    large area: ${PIXEL_COUNT.toLocaleString()} pixels in ${elapsed}ms`);
});

console.log('All fill-tool checks passed.');
