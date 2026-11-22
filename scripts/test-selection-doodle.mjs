import assert from 'node:assert/strict';
import {
  combineSelectionIds,
  isClosedSelectionDoodle,
  selectObjectsInDoodleLoop,
  selectObjectsTouchedByDoodle,
  selectionDoodleGap,
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
// --- regression: a hand-drawn lasso that stops a little short of its start -----
// Reported from use: drawing a loop around objects selected nothing unless the
// stroke ended within a few pixels of its first point, because the app fell back
// to "scribble" mode and only selected objects the stroke actually crossed.
const bigObject = { id: 'bus', x: 500, y: 300, width: 120, height: 120, rotation: 0, flipX: false };
const loopAround = (gapPx, radius = 200, n = 120) => {
  const span = Math.PI * 2 - gapPx / radius;
  return Array.from({ length: n }, (_, index) => {
    const angle = (index / (n - 1)) * span;
    return { x: 560 + radius * Math.cos(angle), y: 360 + radius * Math.sin(angle) };
  });
};

for (const gap of [0, 20, 40, 60]) {
  const points = loopAround(gap);
  assert.equal(selectionDoodleGap(points) <= 60, true, `fixture: ${gap}px gap`);
  assert.equal(isClosedSelectionDoodle(points, 16), true,
    `a ${gap}px gap on a 200px loop is still a lasso`);
  assert.deepEqual(selectObjectsInDoodleLoop([bigObject], [...points, points[0]]), ['bus'],
    `a ${gap}px-gap lasso encloses the object inside it`);
}

// A long stroke across the canvas is not a loop, however straight it is.
const sweep = Array.from({ length: 40 }, (_, index) => ({ x: 20 + index * 25, y: 200 + (index % 2) * 40 }));
assert.equal(isClosedSelectionDoodle(sweep, 16), false, 'a long back-and-forth sweep is not a lasso');

// A C-shape comes most of the way round but its ends are far apart.
const cShape = Array.from({ length: 60 }, (_, index) => {
  const angle = -Math.PI * 0.75 + (index / 59) * Math.PI * 1.5;
  return { x: 560 + 200 * Math.cos(angle), y: 360 + 200 * Math.sin(angle) };
});
assert.equal(isClosedSelectionDoodle(cShape, 16), false, 'a C-shaped stroke is not a lasso');

// A small open shape is not made a lasso by the size-aware allowance: a 30px gap
// on a 30px shape is most of the shape, and only 15 % of its diagonal is allowed.
const smallOpenSquare = [{ x: 10, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 40 }, { x: 10, y: 40 }];
assert.equal(isClosedSelectionDoodle(smallOpenSquare, 16), false,
  'a small open shape with a 30px gap is not a lasso');

// A closed lasso reports the union of enclosed and touched objects, in scene order.
assert.deepEqual(combineSelectionIds(objects, ['cat'], ['tree']), ['cat', 'tree'], 'union keeps scene order');
assert.deepEqual(combineSelectionIds(objects, ['cat'], [], ['cat']), ['cat'], 'union removes duplicates');

console.log('Select Doodle tests passed (lasso, near-closed lasso, brush stroke, rotated bounds, additive selection).');

