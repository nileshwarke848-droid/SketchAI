#!/usr/bin/env node
// Regression coverage for multi-object selection and group editing.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EditorHistory } from '../src/lib/editor-history.js';
import {
  createSceneObject,
  createTextSceneObject,
  deleteSceneObjects,
  duplicateSceneObjects,
  flipSceneObjects,
  getGroupBounds,
  getObjectAxisAlignedBounds,
  getObjectCenter,
  getObjectsIntersectingRect,
  getSelectedSceneObjects,
  getTransformedCorners,
  hitTestScene,
  moveSceneObjects,
  recolorSceneObjects,
  reorderSceneObjects,
  resizeSceneObjectsGroup,
  rotateSceneObjectsGroup,
  selectObjectsInMarquee,
  updateSelectionForClick,
} from '../src/lib/scene.js';
import {
  canvasToClientPoint,
  clientToCanvasPoint,
  zoomViewportAroundPoint,
} from '../src/lib/canvas-coordinates.js';

const ART = {
  id: 'multi-test-art', w: 100, h: 80, origin: 'imported', source: 'test',
  b: '<path fill="STROKE" d="M10 10h60v50H10z"/>',
};
const RED = '#E26755';
const BLUE = '#1255AA';
const source = [
  createSceneObject({ id: 'a', artwork: ART, label: 'A', x: 80, y: 70, width: 120, height: 80, color: RED, zIndex: 0 }),
  createSceneObject({ id: 'b', artwork: ART, label: 'B', x: 280, y: 110, width: 90, height: 72, color: BLUE, rotation: 18, zIndex: 1 }),
  createTextSceneObject({ id: 'text', text: 'Hello group', x: 480, y: 160, fontSize: 42, color: RED, zIndex: 2 }),
  createSceneObject({ id: 'd', artwork: ART, label: 'D', x: 760, y: 520, width: 100, height: 80, zIndex: 3 }),
];
const [a, b, text, d] = source;
const byId = (objects, id) => objects.find((object) => object.id === id);
const close = (actual, expected, epsilon = 1e-7) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✔ ${name}`);
}

console.log('Multi-object selection tests');
console.log('============================');

await check('1. Normal click selects one hit object', () => {
  assert.deepEqual(updateSelectionForClick(source, [], 'a'), ['a']);
});

await check('2. Normal click replaces selection and empty click clears it', () => {
  assert.deepEqual(updateSelectionForClick(source, ['a'], 'b'), ['b']);
  assert.deepEqual(updateSelectionForClick(source, ['a', 'b'], null), []);
});

await check('3. Clicking an already-selected object retains the group for dragging', () => {
  assert.deepEqual(updateSelectionForClick(source, ['b', 'a'], 'a'), ['a', 'b']);
});

await check('4. Shift-click adds an unselected object', () => {
  assert.deepEqual(updateSelectionForClick(source, ['a'], 'b', { shiftKey: true }), ['a', 'b']);
});

await check('5. Shift-click toggles a selected object off; empty Shift-click preserves selection', () => {
  assert.deepEqual(updateSelectionForClick(source, ['a', 'b'], 'a', { shiftKey: true }), ['b']);
  assert.deepEqual(updateSelectionForClick(source, ['a', 'b'], null, { shiftKey: true }), ['a', 'b']);
});

await check('6. Overlapping selection hit testing resolves only the topmost object', () => {
  const bottom = { ...a, id: 'bottom', zIndex: 0 };
  const top = { ...a, id: 'top', x: a.x + 15, y: a.y + 12, zIndex: 1 };
  const hit = hitTestScene([bottom, top], { x: 120, y: 110 });
  assert.equal(hit?.id, 'top');
  assert.deepEqual(updateSelectionForClick([bottom, top], [], hit.id), ['top']);
});

await check('7. Marquee intersects transformed object bounds, including rotation', () => {
  const bounds = getObjectAxisAlignedBounds(b);
  const hits = getObjectsIntersectingRect([b, d], {
    x: bounds.x + bounds.width * 0.7,
    y: bounds.y + bounds.height * 0.7,
    width: 8,
    height: 8,
  });
  assert.deepEqual(hits.map((object) => object.id), ['b']);
  assert.deepEqual(selectObjectsInMarquee(source, [], bounds, {}).includes('b'), true);
});

await check('8. Reverse-direction marquee produces the same transformed-bound selection', () => {
  const forward = { x: 60, y: 55, width: 250, height: 150 };
  const reverse = { x: forward.x + forward.width, y: forward.y + forward.height, width: -forward.width, height: -forward.height };
  assert.deepEqual(getObjectsIntersectingRect(source, reverse).map((object) => object.id),
    getObjectsIntersectingRect(source, forward).map((object) => object.id));
});

await check('9. Shift-marquee adds to the current selection in scene order', () => {
  assert.deepEqual(selectObjectsInMarquee(source, ['d'], { x: 70, y: 60, width: 340, height: 160 }, { additive: true }), ['a', 'b', 'd']);
});

await check('10. Plain marquee replaces selection and a click-sized empty marquee clears it', () => {
  assert.deepEqual(selectObjectsInMarquee(source, ['d'], { x: 0, y: 0, width: 10, height: 10 }), []);
  assert.deepEqual(updateSelectionForClick(source, ['a'], null), []);
});

await check('11. Group bounds union rotated and unrotated object bounds', () => {
  const bounds = getGroupBounds([a, b]);
  const parts = [a, b].map(getObjectAxisAlignedBounds);
  close(bounds.x, Math.min(...parts.map((item) => item.x)));
  close(bounds.y, Math.min(...parts.map((item) => item.y)));
  close(bounds.right, Math.max(...parts.map((item) => item.right)));
  close(bounds.bottom, Math.max(...parts.map((item) => item.bottom)));
  assert.equal(bounds.width, bounds.right - bounds.x);
  assert.equal(bounds.height, bounds.bottom - bounds.y);
});

await check('12. Group move applies one shared logical delta and preserves relative geometry', () => {
  const moved = moveSceneObjects(source, [a, b], 31, -17);
  for (const id of ['a', 'b']) {
    close(byId(moved, id).x, byId(source, id).x + 31);
    close(byId(moved, id).y, byId(source, id).y - 17);
    assert.equal(byId(moved, id).rotation, byId(source, id).rotation);
  }
  assert.equal(byId(moved, 'text'), text, 'unselected object record is preserved');
  assert.deepEqual({ x: b.x - a.x, y: b.y - a.y }, {
    x: byId(moved, 'b').x - byId(moved, 'a').x,
    y: byId(moved, 'b').y - byId(moved, 'a').y,
  });
});

await check('13. Group resize is proportional and scales selected text font size', () => {
  const selected = [a, text];
  const bounds = getGroupBounds(selected);
  const start = { x: bounds.x + 45, y: bounds.y + 35 };
  const target = { x: bounds.x + bounds.width * 1.6, y: bounds.y + bounds.height * 1.6 };
  const resized = resizeSceneObjectsGroup(source, selected, bounds, { signX: 1, signY: 1 }, target);
  const scale = 1.6;
  for (const initial of selected) {
    const after = byId(resized, initial.id);
    close(after.width, initial.width * scale);
    close(after.height, initial.height * scale);
    close(after.x + after.width / 2 - bounds.x, (initial.x + initial.width / 2 - bounds.x) * scale);
  }
  close(byId(resized, 'text').fontSize, text.fontSize * scale);

  const tinyText = createTextSceneObject({ id: 'tiny', text: 'X', x: 500, y: 300, fontSize: 42, color: RED });
  const cappedBounds = getGroupBounds([a, tinyText]);
  const capped = resizeSceneObjectsGroup(source.concat(tinyText), [a, tinyText], cappedBounds, { signX: 1, signY: 1 }, {
    x: cappedBounds.x + cappedBounds.width * 50,
    y: cappedBounds.y + cappedBounds.height * 50,
  });
  const cappedScale = byId(capped, 'a').width / a.width;
  close(byId(capped, 'tiny').fontSize, tinyText.fontSize * cappedScale);
  assert.equal(byId(capped, 'tiny').fontSize, 300);
  assert.equal(byId(resized, 'b'), b);
  assert.notDeepEqual(start, target);
});

await check('14. Group rotation turns every center around the group center and shares the angular delta', () => {
  const selected = [a, b];
  const bounds = getGroupBounds(selected);
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const startPointer = { x: center.x + 100, y: center.y };
  const pointer = { x: center.x, y: center.y + 100 };
  const rotated = rotateSceneObjectsGroup(source, selected, bounds, startPointer, pointer);
  for (const initial of selected) {
    const after = byId(rotated, initial.id);
    const oldCenter = getObjectCenter(initial);
    const expected = { x: center.x - (oldCenter.y - center.y), y: center.y + (oldCenter.x - center.x) };
    close(getObjectCenter(after).x, expected.x);
    close(getObjectCenter(after).y, expected.y);
    close(after.rotation, initial.rotation + 90);
  }
  assert.equal(byId(rotated, 'text'), text);
});

await check('15. Multi-delete removes all selected IDs and renumbers the remaining stack', () => {
  const deleted = deleteSceneObjects(source, ['a', 'text']);
  assert.deepEqual(deleted.map((object) => [object.id, object.zIndex]), [['b', 0], ['d', 1]]);
  assert.equal(source.length, 4, 'source array remains immutable');
});

await check('16. Multi-delete is one undoable action and restores the group selection', () => {
  const history = new EditorHistory();
  history.push({ objects: source, selectedObjectIds: ['a', 'text'] });
  history.push({ objects: deleteSceneObjects(source, ['a', 'text']), selectedObjectIds: [] });
  assert.equal(history.entries.length, 2);
  const restored = history.undo();
  assert.deepEqual(restored.objects.map((object) => object.id), source.map((object) => object.id));
  assert.deepEqual(restored.selectedObjectIds, ['a', 'text']);
  assert.deepEqual(history.redo().objects.map((object) => object.id), ['b', 'd']);
});

await check('17. Multi-duplicate uses unique IDs, preserves attributes/order and offsets every copy by 20px', () => {
  let counter = 0;
  const result = duplicateSceneObjects(source, ['text', 'a'], { idFactory: () => `copy-${++counter}` });
  assert.deepEqual(result.duplicates.map((object) => object.id), ['copy-1', 'copy-2'], 'copy order follows the scene stack');
  assert.deepEqual(result.objects.slice(-2).map((object) => object.id), ['copy-1', 'copy-2']);
  for (const original of [a, text]) {
    const copy = result.duplicates.find((object) => object.id === `copy-${original.id === 'a' ? 1 : 2}`);
    assert.equal(copy.x, original.x + 20);
    assert.equal(copy.y, original.y + 20);
    assert.equal(copy.type, original.type);
    assert.equal(copy.color, original.color);
    assert.equal(copy.artwork, original.artwork);
    assert.equal(copy.fontSize, original.fontSize);
  }
  assert.equal(new Set(result.objects.map((object) => object.id)).size, result.objects.length);
  const collisionSafe = duplicateSceneObjects(source, ['a', 'text'], { idFactory: () => 'a' });
  assert.equal(new Set(collisionSafe.objects.map((object) => object.id)).size, collisionSafe.objects.length,
    'a repeated or colliding ID factory cannot duplicate scene IDs');
});

await check('18. Duplicate operation selects the newly-created copies rather than originals', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /chooseObjects\(result\.duplicates\.map\(\(object\) => object\.id\)\)/);
  assert.match(app, /const result = duplicateSceneObjects\(sceneObjectsRef\.current, ids\)/);
});

await check('19. Bring Forward moves the selected set one logical step without reordering it', () => {
  const stack = ['a', 'b', 'c', 'd', 'e'].map((id, zIndex) => ({ ...a, id, zIndex }));
  const next = reorderSceneObjects(stack, ['b', 'd'], 1);
  assert.deepEqual(next.map((object) => object.id), ['a', 'c', 'b', 'e', 'd']);
  assert.deepEqual(next.filter((object) => ['b', 'd'].includes(object.id)).map((object) => object.id), ['b', 'd']);
  assert.deepEqual(reorderSceneObjects(stack, ['e'], 1), stack);
});

await check('20. Send Backward moves the selected set one logical step without reordering it', () => {
  const stack = ['a', 'b', 'c', 'd', 'e'].map((id, zIndex) => ({ ...a, id, zIndex }));
  const next = reorderSceneObjects(stack, ['b', 'd'], -1);
  assert.deepEqual(next.map((object) => object.id), ['b', 'a', 'd', 'c', 'e']);
  assert.deepEqual(next.filter((object) => ['b', 'd'].includes(object.id)).map((object) => object.id), ['b', 'd']);
  assert.deepEqual(reorderSceneObjects(stack, ['a'], -1), stack);
});

await check('21. Apply Active Color recolors selected artwork and text as a single immutable operation', () => {
  const scene = [a, text, d];
  const next = recolorSceneObjects(scene, ['a', 'text'], '#12ab34');
  assert.deepEqual([byId(next, 'a').color, byId(next, 'text').color], ['#12AB34', '#12AB34']);
  assert.equal(byId(next, 'd'), d);
  assert.equal(a.color, RED);
});

await check('22. Horizontal flip toggles each selected object about its own center without changing layout', () => {
  const flipped = flipSceneObjects(source, ['a', 'b']);
  for (const initial of [a, b]) {
    const after = byId(flipped, initial.id);
    assert.equal(after.flipX, !initial.flipX);
    for (const key of ['x', 'y', 'width', 'height', 'rotation', 'zIndex']) assert.equal(after[key], initial[key]);
    close(getObjectCenter(after).x, getObjectCenter(initial).x);
    close(getObjectCenter(after).y, getObjectCenter(initial).y);
  }
  assert.equal(byId(flipped, 'text'), text);
});

await check('23. Mixed artwork/text selections share group transforms while text settings remain single-text only', async () => {
  const mixed = [a, text];
  assert.deepEqual(getSelectedSceneObjects(source, ['text', 'a']), mixed);
  assert.equal(getGroupBounds(mixed).width > Math.max(a.width, text.width), true);
  const moved = moveSceneObjects(source, mixed, 15, 9);
  assert.equal(byId(moved, 'a').x, a.x + 15);
  assert.equal(byId(moved, 'text').x, text.x + 15);
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /selectedObject\.type === 'text' && <div className="text-object-controls"/);
  assert.match(app, /selectedObjects\.length > 1 && <div className="object-toolbar multi-object-toolbar"/);
});

await check('24. Ctrl/Cmd+A selects all scene objects and typing targets guard shortcuts', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /event\.key\.toLowerCase\(\) === 'a'/);
  assert.match(app, /chooseObjects\(sceneObjectsRef\.current\.map\(\(object\) => object\.id\)\)/);
  assert.match(app, /if \(!\(event\.ctrlKey \|\| event\.metaKey\) \|\| typing\) return/);
  assert.match(app, /const isTyping = \(target\) => target && \(\/INPUT\|TEXTAREA\|SELECT\/\.test\(target\.tagName\) \|\| target\.isContentEditable\)/);
});

await check('25. Escape cancels active text editing first, otherwise clears selection', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /if \(textDraft\) setTextDraft\(cancelTextDraft\(\)\);[\s\S]*?if \(selectedObjectIdsRef\.current\.length\) chooseObjects\(\[\]\)/);
  assert.match(app, /event\.key === 'Escape'.*?event\.stopPropagation\(\); setTextDraft\(cancelTextDraft\(\)\)/s);
});

await check('26. Multi-selection history snapshots clone selection IDs and selection-only changes do not push history', async () => {
  const history = new EditorHistory();
  const ids = ['a', 'b'];
  history.push({ objects: source, selectedObjectIds: ids });
  ids.push('text');
  assert.deepEqual(history.current.selectedObjectIds, ['a', 'b']);
  assert.equal(history.entries.length, 1);
  const bounds = getGroupBounds([a, b]);
  const startPointer = { x: bounds.x + bounds.width / 2 + 80, y: bounds.y + bounds.height / 2 };
  const endPointer = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 + 80 };
  const gestures = [
    moveSceneObjects(source, [a, b], 10, 12),
    resizeSceneObjectsGroup(source, [a, b], bounds, { signX: 1, signY: 1 }, {
      x: bounds.x + bounds.width * 1.2, y: bounds.y + bounds.height * 1.2,
    }),
    rotateSceneObjectsGroup(source, [a, b], bounds, startPointer, endPointer),
  ];
  for (const result of gestures) {
    const perGestureHistory = new EditorHistory();
    perGestureHistory.push({ objects: source, selectedObjectIds: ['a', 'b'] });
    perGestureHistory.push({ objects: result, selectedObjectIds: ['a', 'b'] });
    assert.equal(perGestureHistory.entries.length, 2, 'each completed group gesture creates one snapshot');
    assert.deepEqual(perGestureHistory.undo().objects.map((object) => [object.x, object.y]),
      source.map((object) => [object.x, object.y]));
    assert.deepEqual(perGestureHistory.redo().selectedObjectIds, ['a', 'b']);
  }
  assert.equal(history.entries.length, 1, 'selection-only state changes are not history actions');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const moveBlock = app.slice(app.indexOf('const onPointerMove'), app.indexOf('const onPointerEnd'));
  assert.doesNotMatch(moveBlock, /pushHistory\(/, 'pointer-move frames must not create history entries');
  assert.match(app, /else if \(gesture\.changed\) \{\s*pushHistory\(\);/);
});

await check('27. Zoom/pan pointer conversion and fixed logical canvas dimensions remain accurate', async () => {
  const viewportElement = { getBoundingClientRect: () => ({ left: 20, top: 35, width: 600, height: 360 }) };
  const view = zoomViewportAroundPoint({ zoom: 1.5, panX: -42, panY: 25 }, 2, { x: 260, y: 170 });
  const logical = { x: 777, y: 601 };
  const client = canvasToClientPoint(logical.x, logical.y, viewportElement, 1200, 720, view);
  const roundTrip = clientToCanvasPoint(client.x, client.y, viewportElement, 1200, 720, view);
  close(roundTrip.x, logical.x);
  close(roundTrip.y, logical.y);
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /const W = 1200, H = 720/);
  assert.match(app, /width=\{W\} height=\{H\}/);
});

await check('28. Bottom-edge pointer mapping, accessible group toolbar and 30-object performance are protected', async () => {
  const viewportElement = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 360 }) };
  const bottom = clientToCanvasPoint(600, 360, viewportElement, 1200, 720, { zoom: 1, panX: 0, panY: 0 });
  assert.deepEqual(bottom, { x: 1200, y: 720 }, 'the exact bottom/right canvas edge remains in logical coordinates');
  let nextId = 0;
  const many = Array.from({ length: 30 }, (_, index) => createSceneObject({
    id: `perf-${index}`, artwork: ART, label: `P${index}`, x: index * 13, y: index * 7,
    width: 70, height: 56, zIndex: index,
  }));
  const start = performance.now();
  const moved = moveSceneObjects(many, many, 5, -3);
  const copies = duplicateSceneObjects(many, many.map((object) => object.id), {
    idFactory: () => `fast-copy-${++nextId}`,
  });
  const bounds = getGroupBounds(moved);
  assert.equal(moved.length, 30);
  assert.equal(copies.objects.length, 60);
  assert.equal(copies.duplicates.length, 30);
  assert.ok(bounds.width > 0 && bounds.height > 0);
  assert.ok(performance.now() - start < 1500, '30-object group operations should remain comfortably interactive');
  assert.ok(moved.every((object, index) => object.artwork === many[index].artwork), 'shared immutable artwork references remain intact');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /canvasWrapRef\.current,\s*canvasRef\.current\.width,\s*canvasRef\.current\.height/);
  assert.match(app, /onPointerDown=\{onPointerDown\} onPointerMove=\{onPointerMove\} onPointerUp=\{onPointerEnd\}/);
  assert.match(app, /aria-label="Multiple selection toolbar" data-selection-count=\{selectedObjects\.length\}/);
  for (const label of ['Duplicate selected objects', 'Bring selected objects forward', 'Send selected objects backward', 'Flip selected objects horizontally', 'Delete selected objects']) {
    assert.ok(app.includes(label), `toolbar action is exposed: ${label}`);
  }
});

assert.equal(passed, 28);
console.log('');
console.log(`All ${passed} multi-select checks passed.`);
