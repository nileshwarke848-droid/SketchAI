#!/usr/bin/env node
// Focused unit/regression coverage for the structured scene-object editor.
import assert from 'node:assert/strict';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';
import { EditorHistory } from '../src/lib/editor-history.js';
import {
  addSceneObject,
  artworkImageKey,
  createSceneObject,
  defaultSceneObjectColor,
  deleteSceneObject,
  duplicateSceneObject,
  getObjectCenter,
  getRotationFromPointer,
  getRotationHandle,
  getSceneObjectPlacement,
  getTransformedCorners,
  hitTestObject,
  hitTestScene,
  objectLocalToWorld,
  renderScene,
  resizeSceneObject,
  shiftSceneObject,
  updateSceneObject,
  worldToObjectLocal,
} from '../src/lib/scene.js';
import { variantToEditableSvgString } from '../src/data/artwork.js';

const WIDTH = 500;
const HEIGHT = 360;
const ART = {
  id: 'test-asymmetric',
  w: 100,
  h: 80,
  origin: 'imported',
  b: '<path fill="STROKE" d="M8 12h28v44H8z"/><circle fill="STROKE" cx="73" cy="24" r="11"/>',
};
const INITIAL_COLOR = '#242422';
const RED = '#e26755';

function object(id, patch = {}) {
  return createSceneObject({
    id,
    artwork: ART,
    label: id,
    x: 80,
    y: 60,
    width: 200,
    height: 160,
    color: INITIAL_COLOR,
    ...patch,
  });
}

function rasterArtwork(artwork, color) {
  const svg = variantToEditableSvgString(artwork, {
    color,
    width: artwork.w,
    height: artwork.h,
  });
  const rendered = new Resvg(svg, { fitTo: { mode: 'width', value: 200 } }).render();
  const canvas = createCanvas(rendered.width, rendered.height);
  canvas.getContext('2d').putImageData(
    new ImageData(new Uint8ClampedArray(rendered.pixels), rendered.width, rendered.height),
    0,
    0,
  );
  return canvas;
}

function cacheFor(objects, extraColors = []) {
  const colors = new Set([...objects.map((item) => item.color), ...extraColors]);
  const cache = new Map();
  for (const color of colors) cache.set(artworkImageKey(ART.id, color), rasterArtwork(ART, color));
  return cache;
}

function pixelBytes(canvas) {
  return Buffer.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
}

function check(name, fn) {
  fn();
  console.log(`  ✔ ${name}`);
}

console.log('Scene-object editor tests');
console.log('=========================');

const first = object('first');
const center = getObjectCenter(first);

check('scene objects retain variant data, position, color and transform fields', () => {
  assert.equal(first.artworkId, ART.id);
  assert.equal(first.artwork.b, ART.b);
  assert.deepEqual({ x: first.x, y: first.y, width: first.width, height: first.height },
    { x: 80, y: 60, width: 200, height: 160 });
  assert.equal(first.rotation, 0);
  assert.equal(first.flipX, false);
  assert.equal(first.color, INITIAL_COLOR);
});

check('non-MDI bundled icons retain their original colors until recolored', () => {
  assert.equal(defaultSceneObjectColor({ origin: 'icon', source: 'fluent' }, RED), 'original');
  assert.equal(defaultSceneObjectColor({ origin: 'icon', source: 'mdi' }, RED), RED);
  assert.equal(defaultSceneObjectColor(ART, RED), RED);
  const multicolor = { id: 'colored', w: 24, h: 24, origin: 'icon', source: 'fluent', b: '<path fill="#123456" d="M1 1h10v10H1z"/>' };
  assert.match(variantToEditableSvgString(multicolor, { color: 'original' }), /#123456/);
});

check('sketch-derived placement preserves the artwork aspect ratio', () => {
  const placement = getSceneObjectPlacement({ x: 300, y: 200, width: 120, height: 70 }, ART, WIDTH, HEIGHT);
  assert.ok(placement);
  assert.ok(Math.abs(placement.width / placement.height - ART.w / ART.h) < 1e-9);
  assert.ok(placement.x >= 0 && placement.y >= 0);
});

check('rotated and flipped local/world transforms are inverse operations', () => {
  const transformed = { ...first, rotation: 37, flipX: true };
  const local = { x: 37, y: -21 };
  const roundTrip = worldToObjectLocal(transformed, objectLocalToWorld(transformed, local));
  assert.ok(Math.abs(roundTrip.x - local.x) < 1e-9);
  assert.ok(Math.abs(roundTrip.y - local.y) < 1e-9);
});

check('selection hit testing uses rotated local-space bounds', () => {
  const rotated = { ...first, rotation: 45 };
  assert.equal(hitTestObject(rotated, center), true);
  const outside = objectLocalToWorld(rotated, { x: rotated.width / 2 + 8, y: 0 });
  assert.equal(hitTestObject(rotated, outside), false);
});

check('topmost overlapping object is selected first', () => {
  const bottom = { ...first, id: 'bottom', zIndex: 0 };
  const top = { ...first, id: 'top', x: first.x + 20, y: first.y + 20, zIndex: 1 };
  assert.equal(hitTestScene([bottom, top], { x: 180, y: 140 })?.id, 'top');
});

check('move updates only the selected object without mutating the source', () => {
  const next = updateSceneObject([first], first.id, { x: first.x + 35, y: first.y - 12 });
  assert.deepEqual({ x: next[0].x, y: next[0].y }, { x: 115, y: 48 });
  assert.deepEqual({ x: first.x, y: first.y }, { x: 80, y: 60 });
});

check('corner resize preserves the initial ratio and pins the opposite corner', () => {
  const handle = { signX: -1, signY: -1 };
  const anchor = objectLocalToWorld(first, { x: first.width / 2, y: first.height / 2 });
  const pointer = objectLocalToWorld(first, { x: -first.width, y: -first.height });
  const resized = resizeSceneObject(first, handle, pointer);
  assert.ok(Math.abs(resized.width / resized.height - first.width / first.height) < 1e-9);
  assert.ok(resized.width > first.width && resized.height > first.height);
  const resizedAnchor = objectLocalToWorld(resized, { x: resized.width / 2, y: resized.height / 2 });
  assert.ok(Math.abs(resizedAnchor.x - anchor.x) < 1e-8);
  assert.ok(Math.abs(resizedAnchor.y - anchor.y) < 1e-8);
});

check('corner resize under rotation and horizontal flip keeps dimensions valid', () => {
  const transformed = { ...first, rotation: 28, flipX: true };
  const pointer = objectLocalToWorld(transformed, { x: -transformed.width, y: -transformed.height });
  const resized = resizeSceneObject(transformed, { signX: -1, signY: -1 }, pointer);
  assert.ok(resized.width >= 40 && resized.height >= 40);
  assert.ok(Math.abs(resized.width / resized.height - transformed.width / transformed.height) < 1e-9);
});

check('rotation follows pointer angle around object center', () => {
  const rotation = getRotationFromPointer(
    first,
    0,
    { x: center.x + 80, y: center.y },
    { x: center.x, y: center.y + 80 },
  );
  assert.ok(Math.abs(rotation - 90) < 1e-9);
});

check('selection outline corners transform with object rotation', () => {
  const corners = getTransformedCorners({ ...first, rotation: 90 });
  assert.equal(corners.length, 4);
  assert.deepEqual(corners.map(({ signX, signY }) => [signX, signY]), [[-1, -1], [1, -1], [1, 1], [-1, 1]]);
  assert.ok(Math.abs(corners[0].x - (center.x + 80)) < 1e-8);
});

check('selection and rotation handles stay on the correct corners after rotated flip', () => {
  const transformed = { ...first, rotation: 43, flipX: true };
  const corners = getTransformedCorners(transformed);
  for (const corner of corners) {
    const expected = objectLocalToWorld(transformed, {
      x: corner.signX * transformed.width / 2,
      y: corner.signY * transformed.height / 2,
    });
    assert.ok(Math.abs(corner.x - expected.x) < 1e-9);
    assert.ok(Math.abs(corner.y - expected.y) < 1e-9);
    assert.equal(hitTestObject(transformed, corner, 1e-6), true);
  }
  const rotationHandle = getRotationHandle(transformed);
  const expectedHandle = objectLocalToWorld(transformed, {
    x: 0,
    y: -transformed.height / 2 - 32,
  });
  assert.ok(Math.abs(rotationHandle.x - expectedHandle.x) < 1e-9);
  assert.ok(Math.abs(rotationHandle.y - expectedHandle.y) < 1e-9);
});

check('recolor rewrites editable line-art SVG paint without changing geometry', () => {
  const svg = variantToEditableSvgString(ART, { color: RED, width: ART.w, height: ART.h });
  assert.match(svg, new RegExp(`fill="${RED}"`));
  assert.match(svg, /M8 12h28v44H8z/);
  assert.doesNotMatch(svg, /STROKE/);
});

check('recolor also tints legacy icon attributes and inline paint styles', () => {
  const icon = {
    id: 'test-icon', w: 24, h: 24, origin: 'icon', source: 'legacy',
    b: '<path fill="#123456" style="stroke:#654321;fill:#123456" d="M1 1h10v10H1z"/>',
  };
  const svg = variantToEditableSvgString(icon, { color: RED, width: 24, height: 24 });
  assert.doesNotMatch(svg, /#123456|#654321/);
  assert.match(svg, new RegExp(`fill="${RED}"`));
  assert.match(svg, new RegExp(`stroke:${RED}`));
});

check('delete removes one object and renumbers the remaining stack', () => {
  const stack = addSceneObject(addSceneObject([], object('a')), object('b'));
  const next = deleteSceneObject(stack, 'a');
  assert.deepEqual(next.map(({ id, zIndex }) => [id, zIndex]), [['b', 0]]);
  assert.equal(stack.length, 2, 'delete leaves the prior scene snapshot intact');
});

check('duplicate creates an independent editable object above its source', () => {
  const result = duplicateSceneObject([first], first.id, { idFactory: () => 'copy-1', offset: 20 });
  assert.equal(result.duplicate.id, 'copy-1');
  assert.equal(result.duplicate.artworkId, first.artworkId);
  assert.equal(result.duplicate.x, first.x + 20);
  assert.equal(result.duplicate.y, first.y + 20);
  assert.equal(result.objects[1].zIndex, 1);
  assert.equal(result.objects[1].artwork, first.artwork, 'immutable artwork definition is shared');
});

check('bring-forward and send-backward each move exactly one stack step', () => {
  const stack = ['a', 'b', 'c'].map((id, zIndex) => ({ ...first, id, zIndex }));
  assert.deepEqual(shiftSceneObject(stack, 'a', 1).map(({ id }) => id), ['b', 'a', 'c']);
  assert.deepEqual(shiftSceneObject(stack, 'c', -1).map(({ id }) => id), ['a', 'c', 'b']);
  assert.equal(shiftSceneObject(stack, 'a', -1), stack, 'first object cannot move farther back');
});

check('asymmetric horizontal flip mirrors pixels around the object center without changing geometry', () => {
  const cache = cacheFor([first]);
  const normal = createCanvas(WIDTH, HEIGHT);
  const flipped = createCanvas(WIDTH, HEIGHT);
  renderScene([first], normal, cache);
  const flippedObject = updateSceneObject([first], first.id, { flipX: !first.flipX })[0];
  renderScene([flippedObject], flipped, cache);
  const before = normal.getContext('2d').getImageData(0, 0, WIDTH, HEIGHT).data;
  const after = flipped.getContext('2d').getImageData(0, 0, WIDTH, HEIGHT).data;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const mirroredX = x >= first.x && x < first.x + first.width
        ? 2 * first.x + first.width - 1 - x
        : x;
      const beforeIndex = (y * WIDTH + mirroredX) * 4;
      const afterIndex = (y * WIDTH + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        assert.equal(after[afterIndex + channel], before[beforeIndex + channel],
          `pixel (${x},${y}) channel ${channel} is not mirrored about object center`);
      }
    }
  }
  for (const key of ['x', 'y', 'width', 'height', 'rotation', 'zIndex']) {
    assert.equal(flippedObject[key], first[key], `flip must not change ${key}`);
  }
  assert.equal(first.flipX, false);
  assert.equal(flippedObject.flipX, true);
});

check('rotation plus horizontal flip preserves scene geometry and changes asymmetric pixels', () => {
  const rotated = { ...first, rotation: 31 };
  const flipped = { ...rotated, flipX: true };
  const cache = cacheFor([rotated]);
  const normalCanvas = createCanvas(WIDTH, HEIGHT);
  const flippedCanvas = createCanvas(WIDTH, HEIGHT);
  renderScene([rotated], normalCanvas, cache);
  renderScene([flipped], flippedCanvas, cache);
  assert.notDeepEqual(pixelBytes(normalCanvas), pixelBytes(flippedCanvas));
  for (const key of ['x', 'y', 'width', 'height', 'rotation', 'zIndex']) {
    assert.equal(flipped[key], rotated[key], `rotated flip must not change ${key}`);
  }
});

check('move, proportional resize and recolor remain independent from flip state', () => {
  const moved = { ...first, x: first.x + 19, y: first.y + 13 };
  const resized = resizeSceneObject(moved, { signX: -1, signY: -1 },
    objectLocalToWorld(moved, { x: -moved.width, y: -moved.height }));
  const recolored = { ...resized, color: RED };
  const flipped = { ...recolored, flipX: true };
  const cache = cacheFor([recolored]);
  const canvas = createCanvas(WIDTH, HEIGHT);
  renderScene([flipped], canvas, cache);
  assert.ok(pixelBytes(canvas).some((value) => value > 0));
  assert.equal(flipped.x, resized.x);
  assert.equal(flipped.y, resized.y);
  assert.equal(flipped.width, resized.width);
  assert.equal(flipped.height, resized.height);
  assert.equal(flipped.rotation, resized.rotation);
  assert.equal(flipped.color, RED);
});

check('flip undo and redo restore both transform state and rendered pixels', () => {
  const history = new EditorHistory();
  const cache = cacheFor([first]);
  const initialCanvas = createCanvas(WIDTH, HEIGHT);
  const flippedCanvas = createCanvas(WIDTH, HEIGHT);
  renderScene([first], initialCanvas, cache);
  const flippedObject = updateSceneObject([first], first.id, { flipX: true })[0];
  renderScene([flippedObject], flippedCanvas, cache);
  const originalPixels = pixelBytes(initialCanvas);
  const flippedPixels = pixelBytes(flippedCanvas);
  history.push({ objects: [first], sketch: null, selectedObjectId: first.id });
  history.push({ objects: [flippedObject], sketch: null, selectedObjectId: first.id });
  const undone = history.undo();
  assert.equal(undone.objects[0].flipX, false);
  const undoCanvas = createCanvas(WIDTH, HEIGHT);
  renderScene(undone.objects, undoCanvas, cache);
  assert.deepEqual(pixelBytes(undoCanvas), originalPixels);
  const redone = history.redo();
  assert.equal(redone.objects[0].flipX, true);
  const redoCanvas = createCanvas(WIDTH, HEIGHT);
  renderScene(redone.objects, redoCanvas, cache);
  assert.deepEqual(pixelBytes(redoCanvas), flippedPixels);
});

check('recolor changes the rendered object while preserving the artwork variant', () => {
  const cache = cacheFor([first], [RED]);
  const before = createCanvas(WIDTH, HEIGHT);
  const after = createCanvas(WIDTH, HEIGHT);
  renderScene([first], before, cache);
  const recolored = updateSceneObject([first], first.id, { color: RED })[0];
  renderScene([recolored], after, cache);
  assert.notDeepEqual(pixelBytes(before), pixelBytes(after));
  assert.equal(recolored.artworkId, first.artworkId);
  assert.equal(first.color, INITIAL_COLOR);
});

check('a rough-stroke canvas never modifies clean scene pixels', () => {
  const clean = createCanvas(WIDTH, HEIGHT);
  const sketch = createCanvas(WIDTH, HEIGHT);
  renderScene([first], clean, cacheFor([first]));
  const before = pixelBytes(clean);
  const context = sketch.getContext('2d');
  context.strokeStyle = '#e26755';
  context.lineWidth = 18;
  context.beginPath();
  context.moveTo(center.x - 20, center.y);
  context.lineTo(center.x + 20, center.y);
  context.stroke();
  assert.ok(sketch.getContext('2d').getImageData(0, 0, WIDTH, HEIGHT).data.some((value, index) => index % 4 === 3 && value > 0));
  assert.deepEqual(pixelBytes(clean), before);
});

check('separate objects can be edited independently', () => {
  const second = object('second', { x: 300, y: 100, color: RED });
  const scene = [first, second];
  const updated = updateSceneObject(scene, first.id, { x: 120, rotation: 25 });
  assert.equal(updated[0].x, 120);
  assert.equal(updated[0].rotation, 25);
  assert.equal(updated[1], second, 'unselected object retains its exact object record');
});

check('undo/redo restores object edits, sketch snapshots and branches correctly', () => {
  const history = new EditorHistory(10);
  const sketch0 = { mark: 'blank' };
  const sketch1 = { mark: 'rough' };
  const sketch2 = { mark: 'erased' };
  history.push({ objects: [], sketch: sketch0, selectedObjectId: null });
  history.push({ objects: [first], sketch: sketch1, selectedObjectId: first.id });
  history.push({ objects: [{ ...first, x: 150 }], sketch: sketch2, selectedObjectId: first.id });
  assert.equal(history.canUndo, true);
  assert.equal(history.undo().objects[0].x, first.x);
  assert.equal(history.undo().sketch.mark, 'blank');
  assert.equal(history.canRedo, true);
  assert.equal(history.redo().sketch.mark, 'rough');
  history.push({ objects: [], sketch: sketch0, selectedObjectId: null });
  assert.equal(history.canRedo, false, 'a new action truncates the redo branch');
});

check('clear is one undoable action that restores the complete object stack', () => {
  const history = new EditorHistory();
  const second = object('second', { x: 270, y: 130 });
  history.push({ objects: [first, second], sketch: { mark: 'rough' }, selectedObjectId: second.id });
  history.push({ objects: [], sketch: { mark: 'blank' }, selectedObjectId: null });
  const restored = history.undo();
  assert.deepEqual(restored.objects.map(({ id }) => id), ['first', 'second']);
  assert.equal(restored.sketch.mark, 'rough');
  assert.equal(restored.selectedObjectId, 'second');
});

console.log('');
console.log('All object-editor checks passed.');
