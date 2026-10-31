#!/usr/bin/env node
// Browser-download regression: validate two-layer compositing, PNG bytes,
// synchronous user activation, object-URL/data-URL paths, and non-mutation.
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createCanvas } from '@napi-rs/canvas';
import {
  DOWNLOAD_ANCHOR_REMOVE_DELAY_MS,
  canvasToBlob,
  compositeLayers,
  releaseUrl,
  saveCanvasAsPng,
} from '../src/lib/download.js';

const WIDTH = 1200;
const HEIGHT = 720;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://sketchai.test/' });
const { document } = dom.window;
const nativeCreateElement = document.createElement.bind(document);
const originalDocument = globalThis.document;
const originalUrl = globalThis.URL;
const originalBlob = globalThis.Blob;
const originalActivation = globalThis.__sketchaiDownloadGesture;
const originalClick = dom.window.HTMLAnchorElement.prototype.click;

document.createElement = (name, options) =>
  String(name).toLowerCase() === 'canvas' ? createCanvas(WIDTH, HEIGHT) : nativeCreateElement(name, options);
globalThis.document = document;
globalThis.__sketchaiDownloadGesture = false;

const clicks = [];
const created = [];
const revoked = [];
let shouldThrowOnCreate = false;
let shouldThrowOnClick = false;
globalThis.URL = {
  createObjectURL(blob) {
    if (shouldThrowOnCreate) throw new Error('simulated URL.createObjectURL failure');
    const url = `blob:sketchai-test-${created.length + 1}`;
    created.push({ url, blob });
    return url;
  },
  revokeObjectURL(url) { revoked.push(url); },
};
dom.window.HTMLAnchorElement.prototype.click = function click() {
  clicks.push({
    href: this.href,
    filename: this.download,
    attached: this.isConnected,
    visibleStyle: this.style.display !== 'none',
    activation: globalThis.__sketchaiDownloadGesture,
    element: this,
  });
  if (shouldThrowOnClick) throw new Error('simulated browser download restriction');
};

function pixels(canvas) {
  return new Uint8ClampedArray(canvas.getContext('2d').getImageData(0, 0, WIDTH, HEIGHT).data);
}

function pixel(canvas, x, y) {
  const data = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
  return [...data];
}

function validatePng(bytes, blob) {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(bytes.subarray(0, 8).equals(pngSignature), 'blob must contain a PNG signature');
  assert.equal(bytes.readUInt32BE(16), WIDTH, 'PNG width must be 1200');
  assert.equal(bytes.readUInt32BE(20), HEIGHT, 'PNG height must be 720');
  assert.equal(blob.type, 'image/png');
  assert.ok(blob.size > 100, 'PNG Blob must contain encoded image data');
  assert.equal(blob.size, bytes.length);
}

async function saveAndValidate(canvas, expectedBackgroundAlpha) {
  const priorClickCount = clicks.length;
  globalThis.__sketchaiDownloadGesture = true;
  const result = saveCanvasAsPng(canvas, { filename: 'sketchai-drawing.png' });
  globalThis.__sketchaiDownloadGesture = false;

  assert.ok(!result?.then, 'download helper must click synchronously, not return a pending Promise');
  assert.equal(clicks.length, priorClickCount + 1, 'one user action must create exactly one download click');
  const click = clicks.at(-1);
  assert.ok(click.attached, 'download anchor must be attached when clicked');
  assert.ok(click.visibleStyle, 'download anchor must not use display:none');
  assert.ok(click.activation, 'anchor click must stay inside the user-activation turn');
  assert.equal(click.filename, 'sketchai-drawing.png');
  assert.equal(click.href, result.url);
  assert.ok(result.url.startsWith('blob:') || result.url.startsWith('data:image/png;base64,'));
  assert.equal(result.mime, 'image/png');
  assert.equal(result.automaticClick, true);

  const blob = result.method === 'blob'
    ? created.find((entry) => entry.url === result.url)?.blob
    : new Blob([Buffer.from(result.url.split(',')[1], 'base64')], { type: 'image/png' });
  assert.ok(blob, 'export should produce a Blob even when its anchor uses a data URL');
  const bytes = Buffer.from(await blob.arrayBuffer());
  validatePng(bytes, blob);
  if (expectedBackgroundAlpha === 0) assert.equal(pixel(canvas, 0, 0)[3], 0);
  else assert.deepEqual(pixel(canvas, 0, 0), [255, 255, 255, 255]);
  return result;
}

try {
  const art = createCanvas(WIDTH, HEIGHT);
  const sketch = createCanvas(WIDTH, HEIGHT);
  const artContext = art.getContext('2d');
  artContext.fillStyle = '#e26755';
  artContext.fillRect(100, 100, 200, 160);
  const sketchContext = sketch.getContext('2d');
  sketchContext.strokeStyle = '#242422';
  sketchContext.lineWidth = 18;
  sketchContext.lineCap = 'round';
  sketchContext.beginPath();
  sketchContext.moveTo(260, 190);
  sketchContext.lineTo(500, 190);
  sketchContext.stroke();

  const artBefore = Buffer.from(pixels(art));
  const sketchBefore = Buffer.from(pixels(sketch));
  const results = [];

  // Art-only exports: both opaque and transparent backgrounds.
  const opaqueArt = compositeLayers({ width: WIDTH, height: HEIGHT, layers: [art], opaque: true });
  assert.deepEqual(pixel(opaqueArt, 150, 150), [226, 103, 85, 255]);
  assert.deepEqual(pixel(opaqueArt, 350, 190), [255, 255, 255, 255]);
  results.push(await saveAndValidate(opaqueArt, 255));

  const transparentArt = compositeLayers({ width: WIDTH, height: HEIGHT, layers: [art], opaque: false });
  assert.deepEqual(pixel(transparentArt, 0, 0), [0, 0, 0, 0]);
  assert.deepEqual(pixel(transparentArt, 150, 150), [226, 103, 85, 255]);
  results.push(await saveAndValidate(transparentArt, 0));

  // Art + active sketch exports: the sketch is composited above accepted art.
  const opaqueComposition = compositeLayers({ width: WIDTH, height: HEIGHT, layers: [art, sketch], opaque: true });
  assert.deepEqual(pixel(opaqueComposition, 400, 190), [36, 36, 34, 255]);
  assert.deepEqual(pixel(opaqueComposition, 150, 150), [226, 103, 85, 255]);
  results.push(await saveAndValidate(opaqueComposition, 255));

  const transparentComposition = compositeLayers({ width: WIDTH, height: HEIGHT, layers: [art, sketch], opaque: false });
  assert.deepEqual(pixel(transparentComposition, 0, 0), [0, 0, 0, 0]);
  assert.deepEqual(pixel(transparentComposition, 400, 190), [36, 36, 34, 255]);
  assert.deepEqual(pixel(transparentComposition, 150, 150), [226, 103, 85, 255]);
  results.push(await saveAndValidate(transparentComposition, 0));

  // A broken/unsupported object-URL implementation must fall back to a data URL
  // without a second automatic click or a new browser tab.
  shouldThrowOnCreate = true;
  const fallback = compositeLayers({ width: WIDTH, height: HEIGHT, layers: [art, sketch], opaque: true });
  const fallbackResult = await saveAndValidate(fallback, 255);
  assert.equal(fallbackResult.method, 'data-url');
  shouldThrowOnCreate = false;

  // Blob construction itself can be unavailable in restricted environments.
  // The link still receives the validated PNG data URL instead of failing.
  globalThis.Blob = undefined;
  globalThis.__sketchaiDownloadGesture = true;
  const noBlobResult = saveCanvasAsPng(opaqueComposition, { filename: 'sketchai-drawing.png' });
  globalThis.__sketchaiDownloadGesture = false;
  globalThis.Blob = originalBlob;
  assert.equal(noBlobResult.method, 'data-url');
  assert.equal(noBlobResult.url.startsWith('data:image/png;base64,'), true);
  assert.equal(noBlobResult.automaticClick, true);
  const noBlobBytes = Buffer.from(noBlobResult.url.split(',')[1], 'base64');
  validatePng(noBlobBytes, { type: 'image/png', size: noBlobBytes.length });
  assert.equal(clicks.at(-1).attached, true);
  assert.equal(clicks.at(-1).activation, true);

  // toBlob-null, throwing, and absent implementations all retain the PNG fallback.
  const validDataUrl = opaqueComposition.toDataURL('image/png');
  const nullBlob = await canvasToBlob({
    toBlob(callback) { setTimeout(() => callback(null), 0); },
    toDataURL() { return validDataUrl; },
  });
  validatePng(Buffer.from(await nullBlob.arrayBuffer()), nullBlob);
  const throwingBlob = await canvasToBlob({ toBlob() { throw new Error('no toBlob'); }, toDataURL() { return validDataUrl; } });
  validatePng(Buffer.from(await throwingBlob.arrayBuffer()), throwingBlob);
  const missingBlob = await canvasToBlob({ toDataURL() { return validDataUrl; } });
  validatePng(Buffer.from(await missingBlob.arrayBuffer()), missingBlob);
  const validBlob = await canvasToBlob({
    toBlob(callback) { setTimeout(() => callback(new Blob([Buffer.from(validDataUrl.split(',')[1], 'base64')], { type: 'image/png' })), 0); },
    toDataURL() { throw new Error('valid toBlob should not need the fallback'); },
  });
  validatePng(Buffer.from(await validBlob.arrayBuffer()), validBlob);
  const wrongMimeBlob = await canvasToBlob({
    toBlob(callback) { callback(new Blob(['not a PNG'], { type: 'image/jpeg' })); },
    toDataURL() { return validDataUrl; },
  });
  validatePng(Buffer.from(await wrongMimeBlob.arrayBuffer()), wrongMimeBlob);

  // Some browsers reject synthetic anchor clicks. The helper must still return
  // its live URL so the app can present the normal, visible manual-save link.
  shouldThrowOnClick = true;
  globalThis.__sketchaiDownloadGesture = true;
  const blockedClickResult = saveCanvasAsPng(opaqueComposition, { filename: 'sketchai-drawing.png' });
  globalThis.__sketchaiDownloadGesture = false;
  shouldThrowOnClick = false;
  assert.equal(blockedClickResult.automaticClick, false);
  const blockedClick = clicks.at(-1);
  assert.equal(blockedClick.attached, true);
  assert.equal(blockedClick.activation, true);
  assert.equal(blockedClick.href, blockedClickResult.url);
  const blockedClickBlob = created.find((entry) => entry.url === blockedClickResult.url)?.blob;
  assert.ok(blockedClickBlob, 'a failed synthetic click must keep the object URL alive for manual retry');
  validatePng(Buffer.from(await blockedClickBlob.arrayBuffer()), blockedClickBlob);

  assert.deepEqual(Buffer.from(pixels(art)), artBefore, 'export must not mutate permanent art');
  assert.deepEqual(Buffer.from(pixels(sketch)), sketchBefore, 'export must not mutate the sketch layer');
  assert.equal(clicks.length, results.length + 3, 'all exports together must produce one click each');
  assert.equal(revoked.length, 0, 'export must not revoke object URLs before fallback links can use them');

  await sleep(DOWNLOAD_ANCHOR_REMOVE_DELAY_MS + 50);
  assert.ok(clicks.every(({ element }) => !element.isConnected), 'temporary anchors are removed after the browser has time to consume them');
  for (const result of [...results, blockedClickResult]) if (result.url.startsWith('blob:')) releaseUrl(result.url);
  assert.equal(revoked.length, [...results, blockedClickResult].filter((result) => result.url.startsWith('blob:')).length,
    'each retained object URL can be revoked once by its owner');

  console.log('PNG/download regression');
  console.log('=======================');
  console.log(`opaque art-only export                 : PASS (${results[0].size} bytes)`);
  console.log(`transparent art-only export            : PASS (${results[1].size} bytes)`);
  console.log(`opaque art + active sketch export       : PASS (${results[2].size} bytes)`);
  console.log(`transparent art + active sketch export  : PASS (${results[3].size} bytes)`);
  console.log(`object-URL failure data-URL fallback    : PASS (${fallbackResult.size} bytes)`);
  console.log('Blob-constructor unavailable data-URL fallback: PASS');
  console.log('PNG signature/dimensions (1200x720)     : PASS');
  console.log('valid image/png Blob and user activation: PASS');
  console.log('single click, delayed cleanup, no mutation: PASS');
  console.log('toBlob success/null/throw/unavailable + MIME fallback: PASS');
  console.log('synthetic-click rejection manual-link fallback: PASS');
} finally {
  globalThis.document = originalDocument;
  globalThis.URL = originalUrl;
  globalThis.Blob = originalBlob;
  if (originalActivation === undefined) delete globalThis.__sketchaiDownloadGesture;
  else globalThis.__sketchaiDownloadGesture = originalActivation;
  dom.window.HTMLAnchorElement.prototype.click = originalClick;
  dom.window.close();
}
