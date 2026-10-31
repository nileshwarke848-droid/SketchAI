#!/usr/bin/env node
// Focused coverage for editable text objects and their inline-edit draft flow.
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { EditorHistory } from '../src/lib/editor-history.js';
import {
  addSceneObject,
  createTextSceneObject,
  deleteSceneObject,
  duplicateSceneObject,
  getObjectCenter,
  getTransformedCorners,
  hitTestObject,
  hitTestScene,
  objectLocalToWorld,
  renderScene,
  resizeSceneObject,
  shiftSceneObject,
  updateSceneObject,
} from '../src/lib/scene.js';
import {
  beginTextCreation,
  beginTextEditing,
  cancelTextDraft,
  confirmTextDraft,
  updateTextDraftValue,
} from '../src/lib/text-editor.js';

function check(name, fn) {
  fn();
  console.log(`  ✔ ${name}`);
}

console.log('Editable text-tool tests');
console.log('========================');

const firstDraft = beginTextCreation({ x: 210, y: 170 });
check('text creation draft records logical placement and starts empty', () => {
  assert.deepEqual(firstDraft, { mode: 'create', x: 210, y: 170, value: '' });
  assert.equal(confirmTextDraft(firstDraft), null, 'empty Enter is a no-op');
});

check('Escape cancellation produces no draft and therefore no scene object', () => {
  assert.equal(cancelTextDraft(), null);
  assert.equal(confirmTextDraft(cancelTextDraft()), null);
});

const typedDraft = updateTextDraftValue(firstDraft, '  Hello\nSketchAI  ');
const confirmed = confirmTextDraft(typedDraft);
check('text entry confirms as a trimmed single line', () => {
  assert.equal(confirmed.text, 'Hello SketchAI');
  assert.equal(confirmed.mode, 'create');
});

let text = createTextSceneObject({
  id: 'text-one',
  text: confirmed.text,
  x: confirmed.x,
  y: confirmed.y,
  color: '#242422',
  fontSize: 48,
  fontFamily: 'Georgia, serif',
});
check('create text stores safe font and editable scene-object fields', () => {
  assert.equal(text.type, 'text');
  assert.equal(text.text, 'Hello SketchAI');
  assert.equal(text.label, text.text);
  assert.equal(text.fontFamily, 'Georgia, serif');
  assert.equal(text.fontWeight, 'normal');
  assert.equal(text.textAlign, 'left');
  assert.ok(text.width > 0 && text.height > 0 && text.fontSize >= 10);
});

check('double-click edit draft restores the selected object wording', () => {
  assert.deepEqual(beginTextEditing(text), {
    mode: 'edit', id: 'text-one', x: text.x, y: text.y, value: 'Hello SketchAI',
  });
  assert.equal(beginTextEditing({ type: 'artwork' }), null);
});

const editDraft = updateTextDraftValue(beginTextEditing(text), 'Editable title');
const editConfirmed = confirmTextDraft(editDraft);
const centerBeforeContentEdit = getObjectCenter(text);
const changedBounds = createTextSceneObject({ text: editConfirmed.text, x: text.x, y: text.y, fontSize: text.fontSize });
text = updateSceneObject([text], text.id, {
  text: editConfirmed.text,
  label: editConfirmed.text,
  width: changedBounds.width,
  height: changedBounds.height,
  x: centerBeforeContentEdit.x - changedBounds.width / 2,
  y: centerBeforeContentEdit.y - changedBounds.height / 2,
})[0];
check('edit text content updates the editable object without changing its center', () => {
  assert.equal(text.text, 'Editable title');
  assert.deepEqual(getObjectCenter(text), centerBeforeContentEdit);
});

const moved = updateSceneObject([text], text.id, { x: text.x + 35, y: text.y - 12 })[0];
check('text object can be moved in logical scene coordinates', () => {
  assert.equal(moved.x, text.x + 35);
  assert.equal(moved.y, text.y - 12);
});

const rotated = updateSceneObject([moved], moved.id, { rotation: 37 })[0];
check('rotated text hit testing uses transformed local bounds', () => {
  const center = getObjectCenter(rotated);
  assert.equal(hitTestObject(rotated, center), true);
  const outside = objectLocalToWorld(rotated, { x: rotated.width / 2 + 20, y: 0 });
  assert.equal(hitTestObject(rotated, outside), false);
  assert.equal(hitTestScene([rotated], center)?.id, rotated.id);
});

const resizePointer = objectLocalToWorld(rotated, { x: -rotated.width, y: -rotated.height });
const resized = resizeSceneObject(rotated, { signX: -1, signY: -1 }, resizePointer);
check('text resize scales font with its box and enforces a readable minimum', () => {
  assert.ok(resized.width > 0 && resized.height > 0);
  assert.ok(resized.fontSize >= 10);
  assert.ok(resized.fontSize > rotated.fontSize);
});

const recolored = updateSceneObject([resized], resized.id, { color: '#e26755' })[0];
check('text recoloring updates scene data independently of its wording', () => {
  assert.equal(recolored.color, '#E26755');
  assert.equal(recolored.text, resized.text);
});

const duplicateResult = duplicateSceneObject([recolored], recolored.id, { idFactory: () => 'text-copy' });
check('text duplicates as an independent editable object', () => {
  assert.equal(duplicateResult.duplicate.type, 'text');
  assert.equal(duplicateResult.duplicate.text, recolored.text);
  assert.notEqual(duplicateResult.duplicate.id, recolored.id);
  assert.equal(duplicateResult.duplicate.x, recolored.x + 20);
});

const stack = addSceneObject([recolored], duplicateResult.duplicate);
check('text participates in shared one-step layer ordering and deletion', () => {
  assert.deepEqual(stack.map((object) => object.zIndex), [0, 1]);
  assert.equal(shiftSceneObject(stack, 'text-copy', -1)[0].id, 'text-copy');
  assert.equal(deleteSceneObject(stack, 'text-copy').length, 1);
});

const history = new EditorHistory(10);
history.push({ objects: [], selectedObjectId: null });
history.push({ objects: [text], selectedObjectId: text.id });
history.push({ objects: [recolored], selectedObjectId: recolored.id });
check('undo and redo restore text edits, style, and selection', () => {
  const undo = history.undo();
  assert.equal(undo.objects[0].text, 'Editable title');
  assert.equal(undo.selectedObjectId, text.id);
  const redo = history.redo();
  assert.equal(redo.objects[0].color, '#E26755');
  assert.equal(redo.selectedObjectId, recolored.id);
});

const renderCanvas = createCanvas(640, 360);
renderScene([recolored], renderCanvas, new Map());
const rgba = renderCanvas.getContext('2d').getImageData(0, 0, renderCanvas.width, renderCanvas.height).data;
let ink = 0;
for (let index = 3; index < rgba.length; index += 4) if (rgba[index] > 0) ink += 1;
check('renderer draws text from structured scene state without an artwork raster cache', () => {
  assert.ok(ink > 0, 'text renderer should paint visible glyph pixels');
  assert.equal(getTransformedCorners(recolored).length, 4);
});

console.log('All text-tool checks passed.');
