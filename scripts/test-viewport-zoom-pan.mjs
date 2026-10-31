#!/usr/bin/env node
// Round-trip and interaction regressions for view-only zoom/pan transforms.
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import {
  DEFAULT_VIEWPORT,
  MAX_VIEW_ZOOM,
  MIN_VIEW_ZOOM,
  applyViewportTransform,
  canvasToClientPoint,
  clampViewZoom,
  clientToCanvasPoint,
  clientToViewportPoint,
  inverseViewportTransform,
  viewportTransformCss,
  zoomViewportAroundPoint,
} from '../src/lib/canvas-coordinates.js';
import { createTextSceneObject, hitTestScene, updateSceneObject } from '../src/lib/scene.js';

const WIDTH = 1200;
const HEIGHT = 720;
const element = { getBoundingClientRect: () => ({ left: 53, top: 29, width: 900, height: 540 }) };
const eps = 1e-8;
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < eps, `${label}: ${actual} != ${expected}`);

console.log('Viewport zoom/pan tests');
console.log('=======================');

const scales = [0.25, 0.5, 1, 1.5, 2, 4];
const samples = [
  { x: 0, y: 0 },
  { x: 600, y: 360 },
  { x: 1199, y: 718 },
  { x: 1200, y: 720 },
  { x: 247, y: 91 },
];

for (const zoom of scales) {
  const pan = { zoom, panX: 450 - 450 * zoom + 23, panY: 270 - 270 * zoom - 17 };
  for (const logical of samples) {
    const client = canvasToClientPoint(logical.x, logical.y, element, WIDTH, HEIGHT, pan);
    const mapped = clientToCanvasPoint(client.x, client.y, element, WIDTH, HEIGHT, pan);
    close(mapped.x, logical.x, `${zoom * 100}% x round-trip`);
    close(mapped.y, logical.y, `${zoom * 100}% y round-trip`);
  }
  const client = canvasToClientPoint(600, 360, element, WIDTH, HEIGHT, pan);
  const logical = clientToCanvasPoint(client.x, client.y, element, WIDTH, HEIGHT, pan);
  const drawing = createCanvas(WIDTH, HEIGHT);
  drawing.getContext('2d').fillRect(Math.round(logical.x), Math.round(logical.y), 1, 1);
  assert.equal(drawing.getContext('2d').getImageData(600, 360, 1, 1).data[3], 255,
    `${zoom * 100}% sketch point paints at its logical coordinate`);
  const text = createTextSceneObject({ id: `text-${zoom}`, text: 'View test', x: logical.x - 40, y: logical.y - 20, fontSize: 24 });
  assert.equal(hitTestScene([text], logical)?.id, text.id, `${zoom * 100}% selection uses inverse view conversion`);
  const dragStartClient = canvasToClientPoint(logical.x, logical.y, element, WIDTH, HEIGHT, pan);
  const dragEndClient = canvasToClientPoint(logical.x + 28, logical.y + 14, element, WIDTH, HEIGHT, pan);
  const dragStart = clientToCanvasPoint(dragStartClient.x, dragStartClient.y, element, WIDTH, HEIGHT, pan);
  const dragEnd = clientToCanvasPoint(dragEndClient.x, dragEndClient.y, element, WIDTH, HEIGHT, pan);
  const moved = updateSceneObject([text], text.id, {
    x: text.x + dragEnd.x - dragStart.x,
    y: text.y + dragEnd.y - dragStart.y,
  })[0];
  close(moved.x, text.x + 28, `${zoom * 100}% drag movement x`);
  close(moved.y, text.y + 14, `${zoom * 100}% drag movement y`);
  assert.equal(text.x, logical.x - 40, 'zooming and panning do not mutate scene coordinates');
  console.log(`  ✔ ${zoom * 100}% drawing, selection, movement and text placement round-trip`);
}

for (const zoom of scales) {
  const bottomView = {
    zoom,
    panX: 450 - 450 * zoom,
    panY: 270 - (540 * 718 / HEIGHT) * zoom,
  };
  const client = canvasToClientPoint(600, 718, element, WIDTH, HEIGHT, bottomView);
  const point = clientToCanvasPoint(client.x, client.y, element, WIDTH, HEIGHT, bottomView);
  close(point.x, 600, `${zoom * 100}% bottom x`);
  close(point.y, 718, `${zoom * 100}% bottom y`);
  assert.ok(client.y >= 29 && client.y <= 29 + 540, 'pan can bring the lower canvas region into view');
}
console.log('  ✔ bottom-of-canvas y=718 remains accurate at every zoom scale');

const panOnly = { zoom: 1, panX: 80, panY: -45 };
const pannedClient = canvasToClientPoint(300, 200, element, WIDTH, HEIGHT, panOnly);
const local = clientToViewportPoint(pannedClient.x, pannedClient.y, element);
assert.deepEqual(local, { x: 305, y: 105 });
assert.deepEqual(inverseViewportTransform(applyViewportTransform({ x: 305, y: 105 }, panOnly), panOnly), { x: 305, y: 105 });
console.log('  ✔ horizontal and vertical pan use the same viewport coordinate origin');

const combined = { zoom: 2.5, panX: -315, panY: 84 };
const combinedPoint = { x: 437, y: 219 };
const combinedClient = canvasToClientPoint(combinedPoint.x, combinedPoint.y, element, WIDTH, HEIGHT, combined);
const combinedRoundTrip = clientToCanvasPoint(combinedClient.x, combinedClient.y, element, WIDTH, HEIGHT, combined);
close(combinedRoundTrip.x, combinedPoint.x, 'combined pan/zoom x');
close(combinedRoundTrip.y, combinedPoint.y, 'combined pan/zoom y');
console.log('  ✔ combined pan and zoom preserve logical coordinates');

const pointer = { x: 421, y: 283 };
const startView = { zoom: 1.5, panX: -40, panY: 32 };
const anchoredWorld = inverseViewportTransform(pointer, startView);
const zoomed = zoomViewportAroundPoint(startView, 3, pointer);
const anchoredAfter = applyViewportTransform(anchoredWorld, zoomed);
close(anchoredAfter.x, pointer.x, 'zoom around cursor keeps x stationary');
close(anchoredAfter.y, pointer.y, 'zoom around cursor keeps y stationary');
console.log('  ✔ cursor-anchored zoom holds the logical point stationary');

assert.equal(clampViewZoom(0.01), MIN_VIEW_ZOOM);
assert.equal(clampViewZoom(10), MAX_VIEW_ZOOM);
assert.deepEqual(DEFAULT_VIEWPORT, { zoom: 1, panX: 0, panY: 0 });
assert.equal(viewportTransformCss(DEFAULT_VIEWPORT), 'translate(0px, 0px) scale(1)');
console.log('  ✔ zoom clamps to 25–400%, reset restores 100% with zero pan');
console.log('PASS');
