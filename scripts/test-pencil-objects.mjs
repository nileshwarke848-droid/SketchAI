import assert from 'node:assert/strict';
import {
  addSceneObject,
  createBitmapSceneObject,
  duplicateSceneObjects,
  flipSceneObjects,
  moveSceneObjects,
  resizeSceneObject,
  selectObjectsInMarquee,
  updateSceneObject,
} from '../src/lib/scene.js';
import { selectObjectsTouchedByDoodle } from '../src/lib/selection-doodle.js';

const png = 'data:image/png;base64,AA==';
const stroke = (id, x, y) => createBitmapSceneObject({
  id,
  bitmapId: `bitmap-${id}`,
  bitmap: png,
  label: 'Pencil stroke',
  x,
  y,
  width: 90,
  height: 12,
  zIndex: 0,
  isSketchStroke: true,
});

let objects = [];
const first = stroke('stroke-a', 100, 120);
objects = addSceneObject(objects, first);
const second = stroke('stroke-b', 300, 120);
objects = addSceneObject(objects, second);
assert.equal(objects.length, 2, 'each pencil drag has a distinct scene object');
assert.equal(objects[0].isSketchStroke, true, 'pencil type is preserved in scene data');

const touched = selectObjectsTouchedByDoodle(objects, [{ x: 105, y: 124 }, { x: 112, y: 124 }], 0);
assert.deepEqual(touched, ['stroke-a'], 'touching one part selects its complete pencil object');
assert.deepEqual(selectObjectsInMarquee(objects, [], { x: 90, y: 110, width: 120, height: 30 }), ['stroke-a']);
assert.deepEqual(selectObjectsInMarquee(objects, ['stroke-a'], { x: 290, y: 110, width: 120, height: 30 }, { additive: true }), ['stroke-a', 'stroke-b']);

const moved = moveSceneObjects(objects, objects, 25, -8);
assert.deepEqual(moved.map(({ x, y }) => [x, y]), [[125, 112], [325, 112]]);
assert.ok(moved.every((object) => object.isSketchStroke), 'moving keeps strokes AI-recognizable');

const resized = updateSceneObject(moved, 'stroke-a', (object) => resizeSceneObject(object, { signX: 1, signY: 1 }, { x: 270, y: 160 }));
assert.ok(resized[0].width > moved[0].width, 'pencil strokes use standard resize geometry');
assert.equal(resized[0].isSketchStroke, true, 'resizing retains the recognition marker');

const flipped = flipSceneObjects(resized, ['stroke-a']);
assert.equal(flipped[0].flipX, true, 'pencil strokes use standard transform tools');
assert.equal(flipped[0].isSketchStroke, true, 'flipping retains the recognition marker');

const duplicated = duplicateSceneObjects(flipped, ['stroke-a']);
assert.equal(duplicated.duplicates.length, 1);
assert.equal(duplicated.duplicates[0].isSketchStroke, true, 'duplicate stays recognizable by AI');
assert.notEqual(duplicated.duplicates[0].id, 'stroke-a');

console.log('Pencil object tests passed: separate strokes, whole-stroke touch selection, marquee/Shift multi-select, move, resize, flip and duplicate.');
