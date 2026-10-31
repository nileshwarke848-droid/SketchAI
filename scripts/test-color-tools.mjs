#!/usr/bin/env node
// Full 24-bit color conversion, validation, drawing, fill, scene and history regressions.
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import {
  DEFAULT_BACKGROUND_COLOR,
  QUICK_COLOR_SWATCHES,
  hexToRgb,
  isValidHexColor,
  isValidRgbChannel,
  normalizeHexColor,
  parseRgbChannelInput,
  rgbToHex,
} from '../src/lib/color-utils.js';
import { drawCanvasStrokeSegment } from '../src/lib/canvas-drawing.js';
import { EditorHistory } from '../src/lib/editor-history.js';
import { applyFillMask, composeFillBoundary, fillCanvasRegion, parseHexColor } from '../src/lib/raster-fill.js';
import {
  artworkImageKey,
  createArtworkImageCache,
  createSceneObject,
  createTextSceneObject,
  renderScene,
  updateSceneObject,
} from '../src/lib/scene.js';

const ART = {
  id: 'rgb-test-artwork', w: 20, h: 20, b: '<path fill="STROKE" d="M2 2h16v16H2z"/>',
  origin: 'imported', source: 'test', sourceKey: 'rgb-test', mode: 'fill',
};

function check(name, fn) {
  fn();
  console.log(`  ✔ ${name}`);
}

console.log('Full RGB color-system tests');
console.log('===========================');

check('RGB-to-HEX and HEX-to-RGB round-trip exact sample and boundary colors', () => {
  assert.equal(rgbToHex(18, 52, 86), '#123456');
  assert.deepEqual(hexToRgb('#123456'), { r: 18, g: 52, b: 86 });
  assert.equal(rgbToHex(0, 0, 0), '#000000');
  assert.equal(rgbToHex(255, 255, 255), '#FFFFFF');
  assert.deepEqual(hexToRgb('#000000'), { r: 0, g: 0, b: 0 });
  assert.deepEqual(hexToRgb('#FFFFFF'), { r: 255, g: 255, b: 255 });
  for (let value = 0; value <= 255; value += 1) {
    const samples = [[value, 0, 255], [0, value, 255], [255, 0, value]];
    for (const channels of samples) {
      const hex = rgbToHex(...channels);
      assert.ok(hex);
      assert.deepEqual(hexToRgb(hex), { r: channels[0], g: channels[1], b: channels[2] });
    }
  }
});

check('normalization accepts six-digit case variants and rejects malformed HEX', () => {
  assert.equal(normalizeHexColor('#a1b2c3'), '#A1B2C3');
  assert.equal(normalizeHexColor('#A1B2C3'), '#A1B2C3');
  assert.equal(isValidHexColor('#a1b2c3'), true);
  for (const invalid of [null, '', '123456', '#123', '#12345', '#1234567', '#12345678', '#GG0000', '#12 456', ' #123456', '#123456 ']) {
    assert.equal(normalizeHexColor(invalid), null, `${String(invalid)} must be rejected`);
    assert.equal(isValidHexColor(invalid), false);
    assert.equal(hexToRgb(invalid), null);
  }
});

check('all RGB channels require integers from zero through 255', () => {
  for (const valid of [0, 1, 127, 254, 255]) assert.equal(isValidRgbChannel(valid), true);
  for (const invalid of [-1, 256, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1', null]) {
    assert.equal(isValidRgbChannel(invalid), false, `${String(invalid)} is not a numeric channel`);
  }
  assert.equal(rgbToHex(256, 0, 0), null);
  assert.equal(rgbToHex(0, -1, 0), null);
  assert.equal(rgbToHex(0, 0, 1.25), null);
  assert.equal(rgbToHex(Number.NaN, 0, 0), null);
  assert.equal(parseRgbChannelInput('0'), 0);
  assert.equal(parseRgbChannelInput('255'), 255);
  assert.equal(parseRgbChannelInput('007'), 7);
  for (const invalid of ['', ' ', '-1', '+1', '256', '1.5', '1e2', 'NaN', 'Infinity']) {
    assert.equal(parseRgbChannelInput(invalid), null, `${JSON.stringify(invalid)} must be rejected`);
  }
});

check('24-bit color coverage is independent of the quick-swatch shortcuts', () => {
  assert.ok(QUICK_COLOR_SWATCHES.length >= 8);
  assert.ok(QUICK_COLOR_SWATCHES.every(({ hex }) => isValidHexColor(hex)));
  assert.ok(!QUICK_COLOR_SWATCHES.some(({ hex }) => hex === '#123456'));
  assert.equal(QUICK_COLOR_SWATCHES.find(({ hex }) => hex === '#FF0000')?.name, 'Red');
});

check('raster parsing shares canonical RGB conversion and rejects invalid colors', () => {
  assert.deepEqual(parseHexColor('#12a4f7'), [18, 164, 247, 255]);
  assert.deepEqual(parseHexColor('#123'), [17, 34, 51, 255]);
  assert.equal(parseHexColor('#12GGFF'), null);
  const pixels = { width: 2, height: 1, data: new Uint8ClampedArray(8) };
  assert.equal(applyFillMask(pixels, new Uint8Array([1, 0]), '#00ff01'), 1);
  assert.deepEqual([...pixels.data.slice(0, 4)], [0, 255, 1, 255]);
  assert.throws(() => applyFillMask(pixels, new Uint8Array([1, 0]), '#notrgb'), /Unsupported fill color/);
});

const brushCanvas = createCanvas(240, 160);
const brushContext = brushCanvas.getContext('2d');
const sampleColor = '#12A4F7';
check('logical-pixel brush rendering preserves exact arbitrary RGB and size endpoints', () => {
  assert.equal(drawCanvasStrokeSegment(brushContext, { x: 20, y: 40.5 }, { x: 220, y: 40.5 }, sampleColor, 1), true);
  const edgeSample = [...brushContext.getImageData(120, 40, 1, 1).data];
  assert.ok(Math.abs(edgeSample[0] - 18) <= 1 && Math.abs(edgeSample[1] - 164) <= 1);
  assert.equal(edgeSample[2], 247);
  assert.ok(edgeSample[3] >= 250, `one-pixel logical stroke must cover the center pixel: ${edgeSample}`);
  assert.deepEqual([...brushContext.getImageData(120, 38, 1, 1).data], [0, 0, 0, 0]);
  assert.equal(drawCanvasStrokeSegment(brushContext, { x: 20, y: 100 }, { x: 220, y: 100 }, '#AABBCC', 100), true);
  assert.deepEqual([...brushContext.getImageData(120, 55, 1, 1).data], [170, 187, 204, 255]);
  assert.equal(drawCanvasStrokeSegment(brushContext, { x: 0, y: 0 }, { x: 2, y: 2 }, '#xyz123', 7), false);
  assert.equal(drawCanvasStrokeSegment(brushContext, { x: 0, y: 0 }, { x: 2, y: 2 }, '#123456', 0.5), true);
});

const historyCanvas = createCanvas(240, 160);
const historyContext = historyCanvas.getContext('2d');
const strokeHistory = new EditorHistory(5);
strokeHistory.push({ objects: [], sketch: historyContext.getImageData(0, 0, 240, 160), fill: null });
drawCanvasStrokeSegment(historyContext, { x: 20, y: 40 }, { x: 220, y: 40 }, sampleColor, 9);
strokeHistory.push({ objects: [], sketch: historyContext.getImageData(0, 0, 240, 160), fill: null });
const strokeUndo = strokeHistory.undo();
const strokeRedo = strokeHistory.redo();
check('brush strokes restore and redo exact pixel colors through editor history', () => {
  assert.equal(strokeUndo.sketch.data[40 * 240 * 4 + 120 * 4 + 3], 0);
  assert.deepEqual([...strokeRedo.sketch.data.slice(40 * 240 * 4 + 120 * 4, 40 * 240 * 4 + 120 * 4 + 4)], [18, 164, 247, 255]);
});

const fillReference = createCanvas(16, 12);
const fillLayer = createCanvas(16, 12);
const boundaryContext = fillReference.getContext('2d');
boundaryContext.fillStyle = '#123456';
boundaryContext.fillRect(0, 0, 16, 12);
const fillResult = fillCanvasRegion({ referenceCanvas: fillReference, fillCanvas: fillLayer, seed: { x: 8, y: 6 }, color: '#7FA3BC', tolerance: 0 });
check('bucket fill accepts exact non-preset RGB values and paints only the fill layer', () => {
  assert.equal(fillResult.count, 16 * 12);
  assert.equal(fillResult.changed, 16 * 12);
  assert.deepEqual([...fillLayer.getContext('2d').getImageData(8, 6, 1, 1).data], [127, 163, 188, 255]);
});

const composedBackground = createCanvas(12, 9);
composeFillBoundary(composedBackground, { backgroundColor: '#18a4f7' });
check('background composition normalizes and renders any valid RGB color', () => {
  assert.deepEqual([...composedBackground.getContext('2d').getImageData(1, 1, 1, 1).data], [24, 164, 247, 255]);
  assert.throws(() => composeFillBoundary(createCanvas(1, 1), { backgroundColor: 'oops' }), /Unsupported canvas background color/);
});

const backgroundHistory = new EditorHistory(6);
backgroundHistory.push({ objects: [], canvasBackgroundColor: DEFAULT_BACKGROUND_COLOR });
backgroundHistory.push({ objects: [], canvasBackgroundColor: '#123456' });
backgroundHistory.push({ objects: [], canvasBackgroundColor: DEFAULT_BACKGROUND_COLOR });
const resetUndo = backgroundHistory.undo();
const applyUndo = backgroundHistory.undo();
const applyRedo = backgroundHistory.redo();
const resetRedo = backgroundHistory.redo();
check('background changes and Reset White are canonical and participate in undo/redo', () => {
  assert.equal(resetUndo.canvasBackgroundColor, '#123456');
  assert.equal(applyUndo.canvasBackgroundColor, '#FFFFFF');
  assert.equal(applyRedo.canvasBackgroundColor, '#123456');
  assert.equal(resetRedo.canvasBackgroundColor, '#FFFFFF');
  assert.equal(DEFAULT_BACKGROUND_COLOR, '#FFFFFF');
});

const text = createTextSceneObject({ id: 'rgb-text', text: 'RGB title', x: 10, y: 20, color: '#f0d84f' });
const recoloredText = updateSceneObject([text], text.id, { color: '#18a4f7' })[0];
const textHistory = new EditorHistory(5);
textHistory.push({ objects: [text], selectedObjectId: text.id });
textHistory.push({ objects: [recoloredText], selectedObjectId: text.id });
check('new text and explicit text recoloring normalize arbitrary RGB and undo/redo', () => {
  assert.equal(text.color, '#F0D84F');
  assert.equal(recoloredText.color, '#18A4F7');
  assert.equal(textHistory.undo().objects[0].color, '#F0D84F');
  assert.equal(textHistory.redo().objects[0].color, '#18A4F7');
  assert.throws(() => createTextSceneObject({ text: 'Invalid', x: 0, y: 0, color: '#123' }), /valid RGB hex/);
});

const artObject = createSceneObject({ id: 'rgb-art', artwork: ART, label: 'RGB test', x: 10, y: 20, width: 20, height: 20, color: '#7fa3bc' });
const recoloredArt = updateSceneObject([artObject], artObject.id, { color: '#18a4f7' })[0];
const rejectedArt = updateSceneObject([recoloredArt], recoloredArt.id, { color: 'NaN' });
const artHistory = new EditorHistory(5);
artHistory.push({ objects: [artObject], selectedObjectId: artObject.id });
artHistory.push({ objects: [recoloredArt], selectedObjectId: artObject.id });
const undoArtwork = artHistory.undo();
const redoArtwork = artHistory.redo();
check('artwork color changes are canonical, malformed updates are ignored, and history restores them', () => {
  assert.equal(artObject.color, '#7FA3BC');
  assert.equal(recoloredArt.color, '#18A4F7');
  assert.equal(rejectedArt[0].color, '#18A4F7');
  assert.equal(undoArtwork.objects[0].color, '#7FA3BC');
  assert.equal(redoArtwork.objects[0].color, '#18A4F7');
  assert.throws(() => createSceneObject({ id: 'invalid', artwork: ART, label: 'invalid', x: 0, y: 0, width: 20, height: 20, color: '#zzzzzz' }), /valid RGB hex/);
  assert.throws(() => createSceneObject({ id: 'invalid-original', artwork: ART, label: 'invalid original', x: 0, y: 0, width: 20, height: 20, color: 'original' }), /valid RGB hex/);
});

check('artwork image cache keys normalize case without losing dynamic RGB rendering', () => {
  assert.equal(artworkImageKey(ART.id, '#18a4f7'), artworkImageKey(ART.id, '#18A4F7'));
  assert.throws(() => artworkImageKey(ART.id, '#gg0000'), /valid RGB hex/);
  const imagePixels = new Map();
  const cache = new Map();
  for (const color of ['#7FA3BC', '#18A4F7']) {
    const canvas = createCanvas(20, 20);
    const context = canvas.getContext('2d');
    context.fillStyle = color;
    context.fillRect(0, 0, 20, 20);
    cache.set(artworkImageKey(ART.id, color), canvas);
  }
  const target = createCanvas(80, 60);
  renderScene([artObject, { ...recoloredArt, x: 40 }], target, cache);
  imagePixels.set('before', [...target.getContext('2d').getImageData(20, 30, 1, 1).data]);
  imagePixels.set('after', [...target.getContext('2d').getImageData(50, 30, 1, 1).data]);
  assert.deepEqual(imagePixels.get('before'), [127, 163, 188, 255]);
  assert.deepEqual(imagePixels.get('after'), [24, 164, 247, 255]);
});

const fakeImageInstances = [];
class FakeImage {
  constructor() { fakeImageInstances.push(this); }
  async decode() {}
  set src(value) { this.source = value; }
}
const asyncCache = createArtworkImageCache(FakeImage);
const lowerCacheCall = asyncCache.ensure(ART, '#18a4f7');
const upperCacheCall = asyncCache.ensure(ART, '#18A4F7');
assert.equal(await lowerCacheCall, await upperCacheCall);
assert.equal(fakeImageInstances.length, 1);
assert.equal(asyncCache.has(ART.id, '#18a4f7'), true);
console.log('  ✔ case-equivalent asynchronous artwork cache requests share one decoded raster');

console.log('All full-RGB color-system checks passed.');
