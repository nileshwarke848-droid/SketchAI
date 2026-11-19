import assert from 'node:assert/strict';
import {
  isClosedSelectionDoodle,
  selectObjectsInDoodleLoop,
  selectObjectsTouchedByDoodle,
} from '../src/lib/selection-doodle.js';

const objects = [
  { id: 'cat', x: 40, y: 40, width: 30, height: 30, rotation: 0, flipX: false },
  { id: 'tree', x: 140, y: 40, width: 40, height: 60, rotation: 0, flipX: false },
  { id: 'tilted', x: 230, y: 35, width: 54, height: 32, rotation: 38, flipX: false },
];

const loop = [
  { x: 20, y: 20 }, { x: 105, y: 20 }, { x: 105, y: 95 },
  { x: 20, y: 95 }, { x: 20, y: 20 },
];
assert.equal(isClosedSelectionDoodle(loop, 10), true, 'a returning path is recognized as a lasso');
assert.deepEqual(selectObjectsInDoodleLoop(objects, loop), ['cat'], 'a closed loop selects enclosed objects only');
assert.deepEqual(selectObjectsInDoodleLoop(objects, loop, ['tree'], { additive: true }), ['cat', 'tree'], 'Shift-additive lasso preserves prior selections');
assert.deepEqual(selectObjectsInDoodleLoop(objects, [{ x: 15, y: 15 }, { x: 110, y: 15 }, { x: 110, y: 100 }, { x: 15, y: 100 }]), ['cat'], 'lasso polygon need not repeat its first point');

const openStroke = [{ x: 5, y: 55 }, { x: 105, y: 55 }];
assert.equal(isClosedSelectionDoodle(openStroke, 10), false, 'an open brush stroke is not mistaken for a lasso');
assert.deepEqual(selectObjectsTouchedByDoodle(objects, openStroke, 2), ['cat'], 'an open stroke selects the object it crosses');
assert.deepEqual(selectObjectsTouchedByDoodle(objects, [{ x: 125, y: 68 }, { x: 196, y: 68 }], 3), ['tree'], 'an open stroke can target a different object');
assert.deepEqual(selectObjectsTouchedByDoodle(objects, [{ x: 280, y: 25 }, { x: 280, y: 77 }], 1), ['tilted'], 'stroke selection respects rotated object bounds');
assert.deepEqual(selectObjectsTouchedByDoodle(objects, [{ x: 5, y: 5 }], 1, ['tree'], { additive: true }), ['tree'], 'Shift-additive brush selection preserves previous selections');
assert.deepEqual(selectObjectsTouchedByDoodle(objects, [{ x: 5, y: 5 }], 1), [], 'a stroke away from all objects selects nothing');
console.log('Select Doodle tests passed (lasso, brush stroke, rotated bounds, additive selection).');
