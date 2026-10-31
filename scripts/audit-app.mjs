#!/usr/bin/env node
// End-to-end audit of the real SketchAI React app in jsdom with a skia-backed
// canvas and SVG rasterisation. Exercises prediction, suggestions, editable
// artwork/text objects, transformed pointer input, fills/background, and history.
//
//   node scripts/audit-app.mjs                 # 345-class model
//   node scripts/audit-app.mjs --force-fallback # model missing -> 100-class fallback

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createCanvas, ImageData as NapiImageData } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const BUNDLE = path.join(ROOT, 'node_modules', '.cache', 'sketchai-audit', 'app.iife.js');
const FORCE_FALLBACK = process.argv.includes('--force-fallback');
const DEBUG = process.argv.includes('--debug');
const CANVAS_W = 1200;
const CANVAS_H = 720;

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✔ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  ✖ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function bundleApp() {
  fs.mkdirSync(path.dirname(BUNDLE), { recursive: true });
  await build({
    entryPoints: [path.join(ROOT, 'src', 'main.jsx')],
    bundle: true,
    format: 'iife',
    outfile: BUNDLE,
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    resolveExtensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    define: {
      'import.meta.env': JSON.stringify({ DEV: false, BASE_URL: '/' }),
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    logLevel: 'error',
  });
  return fs.readFileSync(BUNDLE, 'utf8');
}

function makeCanvasShim(window) {
  const proto = window.HTMLCanvasElement.prototype;
  proto.getContext = function getContext(kind) {
    if (kind !== '2d') return null;
    const width = this.width || 300;
    const height = this.height || 150;
    if (!this.__backing || this.__backing.width !== width || this.__backing.height !== height) {
      this.__backing = createCanvas(width, height);
    }
    const context = this.__backing.getContext('2d');
    if (!context.__patched) {
      context.__patched = true;
      const drawImage = context.drawImage.bind(context);
      context.drawImage = (source, ...rest) =>
        drawImage(source && (source.__backing ?? source._raster) ? (source.__backing ?? source._raster) : source, ...rest);
    }
    return context;
  };
  const canvasRect = () => {
    const bounds = window.__auditCanvasRect ?? { left: 0, top: 0, width: CANVAS_W, height: CANVAS_H };
    return {
      x: bounds.left, y: bounds.top, left: bounds.left, top: bounds.top,
      right: bounds.left + bounds.width, bottom: bounds.top + bounds.height,
      width: bounds.width, height: bounds.height, toJSON() { return this; },
    };
  };
  proto.getBoundingClientRect = canvasRect;
  window.Element.prototype.getBoundingClientRect = function getElementRect() {
    const layer = this.classList;
    return layer && ['canvas-wrap', 'fill-canvas', 'art-canvas', 'sketch-overlay', 'selection-overlay']
      .some((name) => layer.contains(name)) ? canvasRect() : {
        x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0,
        width: 0, height: 0, toJSON() { return this; },
      };
  };
  proto.setPointerCapture = () => {};
  proto.releasePointerCapture = () => {};
  window.HTMLElement.prototype.setPointerCapture = () => {};
  window.HTMLElement.prototype.releasePointerCapture = () => {};
}

function makeImageShim(window) {
  class DomImage {
    constructor() {
      this._raster = null;
      this._src = '';
    }
    set src(value) {
      this._src = value;
      if (!/^data:image\/svg\+xml/.test(value)) return;
      const svg = decodeURIComponent(value.replace(/^data:image\/svg\+xml[^,]*,/, ''));
      const rendered = new Resvg(svg, { fitTo: { mode: 'width', value: 320 } }).render();
      const canvas = createCanvas(rendered.width, rendered.height);
      canvas.getContext('2d').putImageData(
        new NapiImageData(new Uint8ClampedArray(rendered.pixels), rendered.width, rendered.height), 0, 0,
      );
      this._raster = canvas;
    }
    get src() { return this._src; }
    get width() { return this._raster?.width ?? 0; }
    get height() { return this._raster?.height ?? 0; }
    get complete() { return this.width > 0; }
    async decode() {
      if (!this._raster?.width) throw new Error('The artwork could not be rasterised.');
    }
  }
  window.Image = DomImage;
}

function makeFetchShim(window) {
  const notFound = (statusText = 'Not Found') => ({
    ok: false,
    status: 404,
    statusText,
    headers: { get: () => null },
    text: async () => 'not found',
    json: async () => { throw new Error('404'); },
    arrayBuffer: async () => window.Uint8Array.from([]).buffer,
  });
  window.fetch = async (input) => {
    const raw = typeof input === 'string' ? input : String(input?.url ?? input);
    const clean = raw.replace(/^https?:\/\/[^/]+\//, '').split('?')[0].replace(/^\/+/, '');
    if (FORCE_FALLBACK && clean.startsWith('model-345/')) return notFound();
    const file = path.join(PUBLIC_DIR, clean);
    if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file)) return notFound();
    const body = fs.readFileSync(file);
    if (DEBUG) console.log(`[fetch] 200 ${clean} (${body.length} bytes)`);
    const text = body.toString('utf8');
    const contentType = clean.endsWith('.json') ? 'application/json' : 'application/octet-stream';
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: (key) => key.toLowerCase() === 'content-type' ? contentType : null },
      text: async () => text,
      json: async () => window.JSON.parse(text),
      arrayBuffer: async () => window.Uint8Array.from(body).buffer,
    };
  };
}

function createWindow(code) {
  const virtualConsole = new VirtualConsole();
  if (DEBUG) {
    for (const level of ['jsdomError', 'error', 'info', 'warn', 'log']) {
      virtualConsole.on(level, (...args) => console.log(`[page:${level}]`, ...args));
    }
  } else {
    virtualConsole.on('jsdomError', () => {});
    virtualConsole.on('error', () => {});
    virtualConsole.on('info', () => {});
    virtualConsole.on('warn', () => {});
  }
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      makeCanvasShim(window);
      makeImageShim(window);
      makeFetchShim(window);
      window.confirm = () => true;
    },
  });
  const script = dom.window.document.createElement('script');
  script.textContent = code;
  dom.window.document.body.appendChild(script);
  return dom;
}

function pointer(window, target, type, x, y, modifiers = {}) {
  const event = new window.MouseEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0,
    shiftKey: Boolean(modifiers.shiftKey), ctrlKey: Boolean(modifiers.ctrlKey), metaKey: Boolean(modifiers.metaKey),
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  target.dispatchEvent(event);
}

function keyboard(window, target, key, modifiers = {}) {
  const event = new window.KeyboardEvent('keydown', {
    bubbles: true, cancelable: true, key,
    ctrlKey: Boolean(modifiers.ctrlKey), metaKey: Boolean(modifiers.metaKey),
    shiftKey: Boolean(modifiers.shiftKey),
  });
  target.dispatchEvent(event);
  return event;
}

function drawCircle(window, canvas, centerX, centerY, radius, steps = 48) {
  for (let step = 0; step <= steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    pointer(window, canvas, step === 0 ? 'pointerdown' : 'pointermove', x, y);
  }
  pointer(window, canvas, 'pointerup', centerX + radius, centerY);
}

function drawLine(window, canvas, x1, y1, x2, y2) {
  pointer(window, canvas, 'pointerdown', x1, y1);
  pointer(window, canvas, 'pointermove', x2, y2);
  pointer(window, canvas, 'pointerup', x2, y2);
}

function drawPolyline(window, target, points) {
  if (points.length < 2) return;
  pointer(window, target, 'pointerdown', points[0].x, points[0].y);
  for (const pointValue of points.slice(1)) pointer(window, target, 'pointermove', pointValue.x, pointValue.y);
  const last = points[points.length - 1];
  pointer(window, target, 'pointerup', last.x, last.y);
}

function pixelAt(canvas, x, y) {
  return [...canvas.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data];
}

function pixels(canvas) {
  return new Uint8ClampedArray(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
}

function inkPixels(canvas) {
  const data = pixels(canvas);
  let count = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count += 1;
  return count;
}

function inkRowsAtX(canvas, x, firstY, lastY) {
  const context = canvas.getContext('2d');
  const column = context.getImageData(Math.round(x), firstY, 1, lastY - firstY).data;
  const rows = [];
  for (let row = 0; row < lastY - firstY; row += 1) {
    if (column[row * 4 + 3] > 0) rows.push(firstY + row);
  }
  return rows;
}


function countRgbPixels(canvas, [red, green, blue]) {
  const data = pixels(canvas);
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] > 0 && data[index] === red && data[index + 1] === green && data[index + 2] === blue) count += 1;
  }
  return count;
}


async function setActiveHex(window, value) {
  const field = window.document.querySelector('input[aria-label="Hex color"]');
  setControlValue(window, field, value);
  await sleep(20);
  return window.document.querySelector('[aria-label="Current active color"]')?.textContent?.trim() ?? '';
}

function activeHex(document) {
  return document.querySelector('[aria-label="Current active color"]')?.textContent?.trim() ?? '';
}

function selectedColor(document) {
  return document.querySelector('.selection-overlay')?.dataset.objectColor ?? '';
}

function canvasHash(canvas) {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let hash = 2166136261;
  for (let i = 0; i < data.length; i += 61) { hash ^= data[i]; hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

function regionPixels(canvas, x, y, width, height) {
  return Buffer.from(canvas.getContext('2d').getImageData(x, y, width, height).data);
}

function hasInkNear(canvas, x, y, radius = 5) {
  const x0 = Math.max(0, Math.round(x) - radius);
  const y0 = Math.max(0, Math.round(y) - radius);
  const width = Math.min(canvas.width - x0, radius * 2 + 1);
  const height = Math.min(canvas.height - y0, radius * 2 + 1);
  const data = canvas.getContext('2d').getImageData(x0, y0, width, height).data;
  for (let index = 3; index < data.length; index += 4) if (data[index] > 0) return true;
  return false;
}

function click(window, selector) {
  const element = window.document.querySelector(selector);
  if (!element) return null;
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  return element;
}

function setControlValue(window, element, value) {
  if (!element) return false;
  const prototype = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(element, String(value));
  element.dispatchEvent(new window.Event('input', { bubbles: true }));
  element.dispatchEvent(new window.Event('change', { bubbles: true }));
  return true;
}

function logicalToClient(window, x, y) {
  const rect = window.__auditCanvasRect ?? { left: 0, top: 0, width: CANVAS_W, height: CANVAS_H };
  const stage = window.document.querySelector('.canvas-stage');
  const zoom = Number(stage?.dataset.viewZoom ?? 1);
  const panX = Number(stage?.dataset.viewPanX ?? 0);
  const panY = Number(stage?.dataset.viewPanY ?? 0);
  return {
    x: rect.left + panX + (x / CANVAS_W) * rect.width * zoom,
    y: rect.top + panY + (y / CANVAS_H) * rect.height * zoom,
  };
}

async function setTextAndConfirm(window, input, value) {
  setControlValue(window, input, value);
  await new Promise((resolve) => setTimeout(resolve, 0));
  input?.dispatchEvent(new window.KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', bubbles: true, cancelable: true,
  }));
}

function countObjects(canvas) {
  return Number(canvas.getAttribute('data-scene-object-count'));
}

function selectedGeometry(document) {
  const svg = document.querySelector('.selection-overlay');
  if (!svg) return null;
  return {
    svg,
    x: Number(svg.dataset.objectX),
    y: Number(svg.dataset.objectY),
    width: Number(svg.dataset.objectWidth),
    height: Number(svg.dataset.objectHeight),
    rotation: Number(svg.dataset.objectRotation),
    flipX: svg.dataset.objectFlipX === 'true',
  };
}

async function main() {
  console.log(`SketchAI app audit${FORCE_FALLBACK ? ' (forced 100-class fallback)' : ''}`);
  console.log('='.repeat(60));
  const dom = createWindow(await bundleApp());
  const { window } = dom;
  const document = window.document;

  let waited = 0;
  while (waited < 60000) {
    const status = document.querySelector('.model-status')?.textContent ?? '';
    if (/AI ready|AI unavailable/.test(status)) break;
    await sleep(250);
    waited += 250;
  }

  section('Model load');
  const statusText = document.querySelector('.model-status')?.textContent?.trim() ?? '';
  check('app reaches a ready state', /AI ready/.test(statusText), statusText);
  const expected = FORCE_FALLBACK ? 'AI ready — 100 objects' : 'AI ready — 345 objects';
  check(`header reports "${expected}"`, statusText.includes(expected), statusText);
  const fallbackNote = document.querySelector('.model-note');
  check(FORCE_FALLBACK ? 'fallback banner is shown' : 'no fallback banner (345 model in use)',
    FORCE_FALLBACK ? Boolean(fallbackNote) : !fallbackNote,
    fallbackNote?.textContent?.trim() ?? 'none');

  section('Layered drawing and prediction');
  const canvas = document.querySelector('.art-canvas');
  const sketch = document.querySelector('.sketch-overlay');
  check('clean-art canvas is mounted', Boolean(canvas), canvas ? `${canvas.width}x${canvas.height}` : 'missing');
  check('temporary sketch canvas is mounted separately', Boolean(sketch), sketch ? `${sketch.width}x${sketch.height}` : 'missing');
  check('clean scene starts blank', inkPixels(canvas) === 0, `${inkPixels(canvas)} ink pixels`);
  check('temporary sketch starts blank', inkPixels(sketch) === 0, `${inkPixels(sketch)} ink pixels`);

  section('Synchronized full-RGB Active Color controls');
  const colorPicker = document.querySelector('input[aria-label="Active color picker"]');
  const hexField = document.querySelector('input[aria-label="Hex color"]');
  const channelFields = ['Red', 'Green', 'Blue'].map((name) => document.querySelector(`input[aria-label="${name}"]`));
  check('shared Active Color includes native picker, HEX and all three labeled channels',
    Boolean(colorPicker && hexField && channelFields.every(Boolean)));
  check('RGB numeric controls are bounded integer 0–255 fields', channelFields.every((field) =>
    field.min === '0' && field.max === '255' && field.step === '1'));
  const activeFromHex = await setActiveHex(window, '#12A4F7');
  check('HEX input accepts an arbitrary exact RGB value and synchronizes the picker/channels',
    activeFromHex === '#12A4F7'
      && colorPicker?.value?.toUpperCase() === '#12A4F7'
      && channelFields.map((field) => field.value).join(',') === '18,164,247',
    `${activeFromHex} / ${channelFields.map((field) => field?.value ?? '?').join(',')}`);
  for (const [field, value] of channelFields.map((field, index) => [field, ['255', '0', '1'][index]])) {
    setControlValue(window, field, value);
    await sleep(15);
  }
  check('RGB fields update the shared HEX value and native picker in real time', activeHex(document) === '#FF0001'
    && colorPicker?.value?.toUpperCase() === '#FF0001'
    && channelFields.map((field) => field.value).join(',') === '255,0,1', activeHex(document));
  setControlValue(window, channelFields[0], '256');
  await sleep(15);
  check('out-of-range RGB input cannot enter active color state', activeHex(document) === '#FF0001');
  setControlValue(window, hexField, '#12GG00');
  await sleep(15);
  check('malformed HEX cannot enter active color state', activeHex(document) === '#FF0001');
  const colorUndo = document.querySelector('button[aria-label="Undo"]');
  check('Active Color tool-setting changes do not create document-history steps', Boolean(colorUndo?.disabled));
  const activeAfterInvalid = await setActiveHex(window, '#12A4F7');
  check('a valid RGB edit recovers cleanly after rejected channel input', activeAfterInvalid === '#12A4F7');
  const brushSizeInput = document.querySelector('input[aria-label="Brush size"]');
  check('brush-size control exposes 1–100 logical-pixel bounds', Boolean(brushSizeInput)
    && brushSizeInput.min === '1' && brushSizeInput.max === '100' && brushSizeInput.step === '1',
  `${brushSizeInput?.min ?? '?'}–${brushSizeInput?.max ?? '?'} px`);

  const bar = document.querySelector('.suggestion-bar');
  check('suggestion bar is mounted', Boolean(bar));
  if (bar) {
    const follows = bar.compareDocumentPosition(canvas) & window.Node.DOCUMENT_POSITION_FOLLOWING;
    check('suggestion bar sits above the canvas', Boolean(follows));
  }
  check('empty suggestion state invites drawing', /start drawing/i.test(document.querySelector('.suggestion-bar-empty')?.textContent ?? ''));

  const cleanBeforeSketch = canvasHash(canvas);
  drawCircle(window, canvas, 600, 360, 150);
  const roughInk = inkPixels(sketch);
  check('pencil draws on the temporary sketch layer', roughInk > 2000, `${roughInk} ink pixels`);
  check('pencil renders the exact arbitrary Active Color on the sketch layer',
    countRgbPixels(sketch, [18, 164, 247]) > 0, `${countRgbPixels(sketch, [18, 164, 247])} exact RGB pixels`);
  check('rough drawing leaves clean scene pixels unchanged', canvasHash(canvas) === cleanBeforeSketch);
  await sleep(2500);

  const guessName = document.querySelector('.primary-name')?.textContent?.trim() ?? '';
  const guessScore = document.querySelector('.primary-score')?.textContent?.trim() ?? '';
  check('AI shows a primary guess', guessName.length > 0, `${guessName} ${guessScore}`);
  const cards = [...document.querySelectorAll('.s-card')];
  const maxCards = Number(process.env.SKETCHAI_MAX_CARDS ?? 12);
  check('suggestions stay within their card ceiling', cards.length > 0 && cards.length <= maxCards, `${cards.length} (ceiling ${maxCards})`);
  const cardNames = cards.map((card) => card.querySelector('.s-card-name')?.textContent?.trim() ?? '');
  check('every suggestion has a readable name', cardNames.every(Boolean), cardNames.slice(0, 4).join(', '));
  check('suggestions are real buttons', cards.length > 0 && cards.every((card) => card.tagName === 'BUTTON'));
  check('suggestions have action-oriented accessible names', cards.length > 0
    && cards.every((card) => /^Insert .+ drawing$/.test(card.getAttribute('aria-label') ?? '')));
  check('leading suggestions cover different classes', new Set(cardNames.slice(0, 5)).size === Math.min(5, cardNames.length));
  const footnote = document.querySelector('.prediction-footnote')?.textContent ?? '';
  check('prediction footnote reports the visible guess count', /Top \d+ guesses/.test(footnote), footnote.trim());
  const classFile = fs.readFileSync(path.join(ROOT, 'src', 'data', 'quickdraw-categories.txt'), 'utf8');
  const canonical = classFile.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const canonicalNames = new Set(canonical.map((label) => label.toLowerCase()));
  check('the canonical 345-class label file remains intact', canonical.length === 345, `${canonical.length} canonical labels`);
  check('suggestion names are drawn from canonical classes', cardNames.every((name) => canonicalNames.has(name.toLowerCase())));
  check('probability percentages remain bounded', [...document.querySelectorAll('.s-card-score')]
    .every((node) => (Number(node.textContent.replace(/[<%]/g, '')) || 0) <= 100));

  section('Suggestion insertion and object history');
  const insertable = cards.find((card) => card.querySelector('.s-card-name')?.textContent.trim().toLowerCase() === 'moon'
    && card.querySelector('.s-card-art svg'));
  check('an asymmetric illustrated Moon suggestion is available', Boolean(insertable));
  if (insertable) {
    insertable.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(250);
  }
  const insertionCanvas = document.querySelector('.art-canvas');
  const geometryAfterInsert = selectedGeometry(document);
  check('accepted suggestion creates one scene object', countObjects(insertionCanvas) === 1,
    `${countObjects(insertionCanvas)} objects`);
  check('clean artwork is rendered from scene state', inkPixels(insertionCanvas) > 0);
  check('acceptance clears only the temporary rough layer', inkPixels(sketch) === 0);
  check('new object is selected and enters select mode', Boolean(geometryAfterInsert)
    && document.querySelector('button[aria-label="Select tool"]')?.getAttribute('aria-pressed') === 'true');
  check('object editor exposes the selected artwork name', Boolean(document.querySelector('.object-toolbar strong')));
  const visibleLayers = ['.canvas-wrap', '.art-canvas', '.sketch-overlay', '.selection-overlay']
    .map((selector) => document.querySelector(selector));
  const layerRects = visibleLayers.map((element) => element?.getBoundingClientRect());
  const sameLayerBounds = layerRects.every(Boolean) && layerRects.every((rect) => {
    const first = layerRects[0];
    return rect.left === first.left && rect.top === first.top
      && rect.width === first.width && rect.height === first.height && rect.bottom === first.bottom;
  });
  check('wrapper, art, sketch and selection DOM bounds match', sameLayerBounds);
  check('user-facing export controls are intentionally absent', ![...document.querySelectorAll('button, a')]
    .some((element) => /download|export|transparent/i.test(element.textContent ?? element.getAttribute('aria-label') ?? '')));

  const undo = document.querySelector('button[aria-label="Undo"]');
  const redo = document.querySelector('button[aria-label="Redo"]');
  check('undo is enabled after insertion', Boolean(undo && !undo.disabled));
  click(window, 'button[aria-label="Undo"]');
  await sleep(120);
  check('undo removes the inserted object', countObjects(canvas) === 0);
  check('undo restores the rough sketch to its own layer', inkPixels(sketch) > 2000);
  check('undo leaves clean art blank', inkPixels(canvas) === 0);
  check('redo is enabled after undo', Boolean(redo && !redo.disabled));
  click(window, 'button[aria-label="Redo"]');
  await sleep(150);
  check('redo restores the scene object', countObjects(canvas) === 1);
  check('redo restores an empty temporary sketch', inkPixels(sketch) === 0);

  section('Object selection and transforms');
  let geometry = selectedGeometry(document);
  check('selected object exposes transform geometry', Boolean(geometry));
  if (geometry) {
    const oldX = geometry.x;
    const oldY = geometry.y;
    const centerX = oldX + geometry.width / 2;
    const centerY = oldY + geometry.height / 2;
    drawLine(window, canvas, centerX, centerY, centerX + 24, centerY + 18);
    await sleep(80);
    geometry = selectedGeometry(document);
    check('dragging a selected object moves it', Boolean(geometry)
      && Math.abs(geometry.x - oldX - 24) < 1 && Math.abs(geometry.y - oldY - 18) < 1,
    geometry ? `${oldX},${oldY} -> ${geometry.x},${geometry.y}` : 'selection lost');
    click(window, 'button[aria-label="Undo"]');
    await sleep(100);
    geometry = selectedGeometry(document);
    check('one undo restores the object before the complete move gesture', Boolean(geometry)
      && Math.abs(geometry.x - oldX) < 1 && Math.abs(geometry.y - oldY) < 1);
    click(window, 'button[aria-label="Redo"]');
    await sleep(100);

    geometry = selectedGeometry(document);
    const resizeHandle = geometry?.svg.querySelector('[data-transform-handle="resize"]');
    const oldWidth = geometry?.width ?? 0;
    const oldHeight = geometry?.height ?? 0;
    const ratio = oldWidth / oldHeight;
    if (geometry && resizeHandle) {
      pointer(window, resizeHandle, 'pointerdown', geometry.x, geometry.y);
      pointer(window, canvas, 'pointermove', geometry.x - 36, geometry.y - 36);
      pointer(window, canvas, 'pointerup', geometry.x - 36, geometry.y - 36);
      await sleep(100);
    }
    geometry = selectedGeometry(document);
    const resizedWidth = geometry?.width ?? 0;
    const resizedHeight = geometry?.height ?? 0;
    check('corner handle resizes the object proportionally', Boolean(geometry)
      && geometry.width > oldWidth && geometry.height > oldHeight
      && Math.abs(geometry.width / geometry.height - ratio) < 0.015,
    geometry ? `${geometry.width.toFixed(1)}×${geometry.height.toFixed(1)}` : 'no geometry');
    click(window, 'button[aria-label="Undo"]');
    await sleep(90);
    geometry = selectedGeometry(document);
    check('one undo reverses the complete corner-resize gesture', Boolean(geometry)
      && Math.abs(geometry.width - oldWidth) < 1 && Math.abs(geometry.height - oldHeight) < 1);
    click(window, 'button[aria-label="Redo"]');
    await sleep(90);
    geometry = selectedGeometry(document);
    check('one redo restores the resized object', Boolean(geometry)
      && Math.abs(geometry.width - resizedWidth) < 1 && Math.abs(geometry.height - resizedHeight) < 1);

    const rotationElement = geometry?.svg.querySelector('[data-transform-handle="rotate"]');
    const oldRotation = geometry?.rotation ?? 0;
    if (geometry && rotationElement) {
      const handleX = Number(rotationElement.getAttribute('cx'));
      const handleY = Number(rotationElement.getAttribute('cy'));
      const centerX2 = geometry.x + geometry.width / 2;
      const centerY2 = geometry.y + geometry.height / 2;
      pointer(window, rotationElement, 'pointerdown', handleX, handleY);
      pointer(window, canvas, 'pointermove', centerX2 + 100, centerY2);
      pointer(window, canvas, 'pointerup', centerX2 + 100, centerY2);
      await sleep(100);
    }
    geometry = selectedGeometry(document);
    const rotatedDegrees = geometry?.rotation ?? oldRotation;
    check('rotation handle rotates the selected object', Boolean(geometry)
      && Math.abs(geometry.rotation - oldRotation) > 20,
    geometry ? `${oldRotation.toFixed(1)}° -> ${geometry.rotation.toFixed(1)}°` : 'no geometry');
    click(window, 'button[aria-label="Undo"]');
    await sleep(90);
    geometry = selectedGeometry(document);
    check('one undo reverses the complete rotation gesture', Boolean(geometry)
      && Math.abs(geometry.rotation - oldRotation) < 1);
    click(window, 'button[aria-label="Redo"]');
    await sleep(90);
    geometry = selectedGeometry(document);
    check('one redo restores the rotated object', Boolean(geometry)
      && Math.abs(geometry.rotation - rotatedDegrees) < 1);
  }

  section('Explicit Active Color application, flip, duplicate and layer order');
  const artworkColorBeforeActiveChange = selectedColor(document);
  const changedActiveForArtwork = await setActiveHex(window, '#18A4F7');
  check('changing Active Color does not recolor the selected artwork', changedActiveForArtwork === '#18A4F7'
    && selectedColor(document) === artworkColorBeforeActiveChange,
  `${artworkColorBeforeActiveChange} remains selected artwork color`);
  check('selected artwork exposes an explicit Apply Active Color action',
    Boolean(document.querySelector('button[aria-label="Apply Active Color"]')));
  click(window, 'button[aria-label="Apply Active Color"]');
  await sleep(180);
  const artworkColorAfterApply = selectedColor(document);
  check('explicit artwork recoloring applies arbitrary Active Color dynamically',
    artworkColorAfterApply === '#18A4F7' && countRgbPixels(canvas, [24, 164, 247]) > 0,
  `${artworkColorAfterApply}; ${countRgbPixels(canvas, [24, 164, 247])} exact RGB pixels`);
  click(window, 'button[aria-label="Undo"]');
  await sleep(90);
  check('one undo restores the selected artwork color', selectedColor(document) === artworkColorBeforeActiveChange);
  click(window, 'button[aria-label="Redo"]');
  await sleep(90);
  check('one redo restores the applied artwork color', selectedColor(document) === '#18A4F7');
  const pixelsBeforeFlip = Buffer.from(pixels(canvas));
  check('flip control toggles the selected object transform', Boolean(click(window, 'button[aria-label="Flip selected object horizontally"]')));
  await sleep(80);
  geometry = selectedGeometry(document);
  const pixelsAfterFlip = Buffer.from(pixels(canvas));
  check('horizontal flip is reflected in the selected object state', geometry?.flipX === true);
  check('flipping asymmetric rotated artwork visibly redraws clean pixels', !pixelsAfterFlip.equals(pixelsBeforeFlip));
  click(window, 'button[aria-label="Undo"]');
  await sleep(90);
  check('one undo restores the prior horizontal flip state', selectedGeometry(document)?.flipX === false);
  check('flip undo restores the original rendered pixels', Buffer.from(pixels(canvas)).equals(pixelsBeforeFlip));
  click(window, 'button[aria-label="Redo"]');
  await sleep(90);
  check('one redo reapplies horizontal flip', selectedGeometry(document)?.flipX === true);
  check('flip redo restores the flipped rendered pixels', Buffer.from(pixels(canvas)).equals(pixelsAfterFlip));

  click(window, 'button[aria-label="Duplicate selected object"]');
  await sleep(100);
  check('duplicate creates a second independently selected object', countObjects(canvas) === 2,
    `${countObjects(canvas)} objects`);
  const duplicateId = document.querySelector('.selection-overlay')?.dataset.selectedObjectId;
  check('duplicate receives its own scene id', Boolean(duplicateId));
  const sendBack = document.querySelector('button[aria-label="Send selected object backward"]');
  check('new duplicate can be sent backward one step', Boolean(sendBack && !sendBack.disabled));
  sendBack?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(80);
  check('one-step send-back enables bring-forward for the selected object',
    document.querySelector('button[aria-label="Bring selected object forward"]')?.disabled === false);
  click(window, 'button[aria-label="Bring selected object forward"]');
  await sleep(80);

  click(window, 'button[aria-label="Delete selected object"]');
  await sleep(100);
  check('delete removes only the selected duplicate', countObjects(canvas) === 1);
  click(window, 'button[aria-label="Undo"]');
  await sleep(100);
  check('undo restores a deleted scene object', countObjects(canvas) === 2);
  click(window, 'button[aria-label="Redo"]');
  await sleep(100);
  check('redo reapplies the object deletion', countObjects(canvas) === 1);

  section('Multiple selection and group editing');
  keyboard(window, window, 'a', { ctrlKey: true });
  await sleep(40);
  click(window, 'button[aria-label="Duplicate selected object"]');
  await sleep(100);
  check('two editable objects are available for multi-selection', countObjects(canvas) === 2);
  let multiGeometry = selectedGeometry(document);
  const selectedBeforeToggle = Number(multiGeometry?.svg.dataset.selectionCount ?? 0);
  const toggleX = multiGeometry ? multiGeometry.x + multiGeometry.width / 2 : 0;
  const toggleY = multiGeometry ? multiGeometry.y + multiGeometry.height / 2 : 0;
  pointer(window, canvas, 'pointerdown', toggleX, toggleY, { shiftKey: true });
  pointer(window, canvas, 'pointerup', toggleX, toggleY, { shiftKey: true });
  await sleep(60);
  check('Shift-click toggles a topmost selected object off', selectedBeforeToggle === 1
    && Number(document.querySelector('.selection-overlay')?.dataset.selectionCount ?? 0) === 0);
  pointer(window, canvas, 'pointerdown', toggleX, toggleY, { shiftKey: true });
  pointer(window, canvas, 'pointerup', toggleX, toggleY, { shiftKey: true });
  await sleep(60);
  keyboard(window, window, 'a', { ctrlKey: true });
  await sleep(60);
  multiGeometry = selectedGeometry(document);
  check('Ctrl+A selects the complete scene and shows the selection-count toolbar',
    Number(multiGeometry?.svg.dataset.selectionCount ?? 0) === 2
      && Boolean(document.querySelector('.multi-object-toolbar[data-selection-count="2"]')));
  check('multi-selection uses one combined group bounding box',
    multiGeometry?.svg.dataset.objectType === 'group'
      && multiGeometry.width > 0 && multiGeometry.height > 0
      && !document.querySelector('button[aria-label="Text font size"]'));

  // A plain empty click clears; a marquee over both objects selects them again.
  pointer(window, canvas, 'pointerdown', 20, 20);
  pointer(window, canvas, 'pointerup', 20, 20);
  await sleep(50);
  check('plain empty-canvas click clears the group selection', !document.querySelector('.selection-overlay'));
  pointer(window, canvas, 'pointerdown', 20, 20);
  pointer(window, canvas, 'pointermove', 1180, 700);
  pointer(window, canvas, 'pointerup', 1180, 700);
  await sleep(60);
  check('marquee selection recovers both object bounds',
    Number(document.querySelector('.selection-overlay')?.dataset.selectionCount ?? 0) === 2);
  keyboard(window, window, 'a', { ctrlKey: true });
  await sleep(40);

  multiGeometry = selectedGeometry(document);
  const beforeGroupMove = { x: multiGeometry.x, y: multiGeometry.y, width: multiGeometry.width, height: multiGeometry.height };
  drawLine(window, canvas, multiGeometry.x + multiGeometry.width / 2, multiGeometry.y + multiGeometry.height / 2,
    multiGeometry.x + multiGeometry.width / 2 + 28, multiGeometry.y + multiGeometry.height / 2 + 16);
  await sleep(70);
  let afterGroupMove = selectedGeometry(document);
  check('dragging the selected set moves both objects together', Number(afterGroupMove?.svg.dataset.selectionCount ?? 0) === 2
    && Math.abs(afterGroupMove.x - beforeGroupMove.x - 28) < 1
    && Math.abs(afterGroupMove.y - beforeGroupMove.y - 16) < 1);
  click(window, 'button[aria-label="Undo"]');
  await sleep(70);
  keyboard(window, window, 'a', { ctrlKey: true });
  await sleep(30);
  multiGeometry = selectedGeometry(document);
  check('one undo reverses the complete group move', Number(multiGeometry?.svg.dataset.selectionCount ?? 0) === 2
    && Math.abs(multiGeometry.x - beforeGroupMove.x) < 1 && Math.abs(multiGeometry.y - beforeGroupMove.y) < 1);
  click(window, 'button[aria-label="Redo"]');
  await sleep(70);
  keyboard(window, window, 'a', { ctrlKey: true });
  await sleep(30);

  multiGeometry = selectedGeometry(document);
  const beforeGroupResize = { x: multiGeometry.x, y: multiGeometry.y, width: multiGeometry.width, height: multiGeometry.height };
  const groupResizeHandle = multiGeometry.svg.querySelector('[data-transform-handle="resize"]');
  pointer(window, groupResizeHandle, 'pointerdown', beforeGroupResize.x, beforeGroupResize.y);
  pointer(window, canvas, 'pointermove', beforeGroupResize.x - 32, beforeGroupResize.y - 24);
  pointer(window, canvas, 'pointerup', beforeGroupResize.x - 32, beforeGroupResize.y - 24);
  await sleep(80);
  let afterGroupResize = selectedGeometry(document);
  check('combined corner handle proportionally resizes the group', Number(afterGroupResize?.svg.dataset.selectionCount ?? 0) === 2
    && afterGroupResize.width > beforeGroupResize.width && afterGroupResize.height > beforeGroupResize.height);
  click(window, 'button[aria-label="Undo"]');
  await sleep(70);
  keyboard(window, window, 'a', { ctrlKey: true });
  await sleep(30);
  multiGeometry = selectedGeometry(document);
  check('one undo reverses the complete group resize', Number(multiGeometry?.svg.dataset.selectionCount ?? 0) === 2
    && Math.abs(multiGeometry.width - beforeGroupResize.width) < 1);
  click(window, 'button[aria-label="Redo"]');
  await sleep(70);
  keyboard(window, window, 'a', { ctrlKey: true });
  await sleep(30);

  multiGeometry = selectedGeometry(document);
  const beforeGroupRotation = { x: multiGeometry.x, y: multiGeometry.y, width: multiGeometry.width, height: multiGeometry.height };
  const groupRotationHandle = multiGeometry.svg.querySelector('[data-transform-handle="rotate"]');
  const handleX = Number(groupRotationHandle.getAttribute('cx'));
  const handleY = Number(groupRotationHandle.getAttribute('cy'));
  const groupCenterX = multiGeometry.x + multiGeometry.width / 2;
  const groupCenterY = multiGeometry.y + multiGeometry.height / 2;
  const groupPixelsBeforeRotation = canvasHash(canvas);
  pointer(window, groupRotationHandle, 'pointerdown', handleX, handleY);
  pointer(window, canvas, 'pointermove', groupCenterX + 96, groupCenterY);
  pointer(window, canvas, 'pointerup', groupCenterX + 96, groupCenterY);
  await sleep(80);
  let afterGroupRotation = selectedGeometry(document);
  check('rotation handle rotates the selected group around its center', Number(afterGroupRotation?.svg.dataset.selectionCount ?? 0) === 2
    && canvasHash(canvas) !== groupPixelsBeforeRotation,
  `${JSON.stringify(beforeGroupRotation)}; hash ${groupPixelsBeforeRotation} -> ${canvasHash(canvas)}`);
  click(window, 'button[aria-label="Undo"]');
  await sleep(70);
  keyboard(window, window, 'a', { ctrlKey: true });
  await sleep(30);
  multiGeometry = selectedGeometry(document);
  check('one undo reverses the complete group rotation', Number(multiGeometry?.svg.dataset.selectionCount ?? 0) === 2
    && Math.abs(multiGeometry.x - beforeGroupRotation.x) < 1);
  click(window, 'button[aria-label="Redo"]');
  await sleep(70);
  keyboard(window, window, 'a', { ctrlKey: true });
  await sleep(30);

  const multiColor = await setActiveHex(window, '#0A77CF');
  click(window, 'button[aria-label="Apply Active Color"]');
  await sleep(180);
  check('Apply Active Color recolors every selected artwork object in one action', multiColor === '#0A77CF'
    && countRgbPixels(canvas, [10, 119, 207]) > 0);
  click(window, 'button[aria-label="Undo"]');
  await sleep(70);
  check('one undo restores pre-group color across the selected artwork', countRgbPixels(canvas, [10, 119, 207]) === 0);
  click(window, 'button[aria-label="Redo"]');
  await sleep(70);

  const groupPixelsBeforeFlip = Buffer.from(pixels(canvas));
  click(window, 'button[aria-label="Flip selected objects horizontally"]');
  await sleep(80);
  check('horizontal flip visibly updates all selected artwork', !Buffer.from(pixels(canvas)).equals(groupPixelsBeforeFlip));
  click(window, 'button[aria-label="Undo"]');
  await sleep(70);
  click(window, 'button[aria-label="Redo"]');
  await sleep(70);

  click(window, 'button[aria-label="Duplicate selected objects"]');
  await sleep(90);
  check('group duplicate creates and selects all copies', countObjects(canvas) === 4
    && Number(document.querySelector('.selection-overlay')?.dataset.selectionCount ?? 0) === 2);
  const groupSendBack = document.querySelector('button[aria-label="Send selected objects backward"]');
  check('selected-set layer order is available for the duplicated group', Boolean(groupSendBack && !groupSendBack.disabled));
  groupSendBack?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(50);
  check('moving the selected set backward preserves group ordering',
    document.querySelector('button[aria-label="Bring selected objects forward"]')?.disabled === false);
  click(window, 'button[aria-label="Bring selected objects forward"]');
  await sleep(50);
  click(window, 'button[aria-label="Delete selected objects"]');
  await sleep(90);
  check('multi-delete removes every selected copy', countObjects(canvas) === 2);
  click(window, 'button[aria-label="Undo"]');
  await sleep(90);
  check('one undo restores the complete duplicated group', countObjects(canvas) === 4);
  click(window, 'button[aria-label="Redo"]');
  await sleep(90);
  check('redo reapplies the complete multi-delete', countObjects(canvas) === 2);

  // Add text and confirm mixed selections use group actions but not text-only settings.
  await setActiveHex(window, '#18A4F7');
  click(window, 'button[aria-label="Text tool"]');
  await sleep(30);
  pointer(window, canvas, 'pointerdown', 1010, 120);
  pointer(window, canvas, 'pointerup', 1010, 120);
  await sleep(60);
  const multiTextInput = document.querySelector('input[aria-label="Enter canvas text"]');
  check('text entry remains available after group operations', Boolean(multiTextInput),
    `tool=${document.querySelector('.canvas-wrap')?.className}; objects=${countObjects(canvas)}`);
  if (multiTextInput) {
    keyboard(window, multiTextInput, 'a', { ctrlKey: true });
    check('Ctrl+A typing guard does not select artwork while editing text', !document.querySelector('.multi-object-toolbar'));
    setControlValue(window, multiTextInput, 'Mixed group');
    keyboard(window, multiTextInput, 'Enter');
  }
  await sleep(90);
  check('text inserts as a third independent scene object', countObjects(canvas) === 3);
  const multiCreatedTextGeometry = selectedGeometry(document);
  keyboard(window, window, 'a', { ctrlKey: true });
  await sleep(60);
  check('Ctrl+A selects mixed artwork and text together without text-specific settings',
    Number(document.querySelector('.selection-overlay')?.dataset.selectionCount ?? 0) === 3
      && Boolean(document.querySelector('.multi-object-toolbar'))
      && !document.querySelector('[aria-label="Text font size"]'));
  if (multiCreatedTextGeometry) {
    keyboard(window, window, 'Escape');
    await sleep(30);
    const textX = multiCreatedTextGeometry.x + multiCreatedTextGeometry.width / 2;
    const textY = multiCreatedTextGeometry.y + multiCreatedTextGeometry.height / 2;
    pointer(window, canvas, 'pointerdown', textX, textY);
    pointer(window, canvas, 'pointerup', textX, textY);
  }
  await sleep(50);
  click(window, 'button[aria-label="Delete selected object"]');
  await sleep(80);
  check('single-text cleanup leaves the artwork objects intact', countObjects(canvas) === 2,
    `objects=${countObjects(canvas)} selection=${document.querySelector('.selection-overlay')?.dataset.objectType ?? 'none'} toolbar=${document.querySelector('.object-toolbar')?.getAttribute('aria-label') ?? 'none'} saved=${JSON.stringify(multiCreatedTextGeometry && { x: multiCreatedTextGeometry.x, y: multiCreatedTextGeometry.y, width: multiCreatedTextGeometry.width, height: multiCreatedTextGeometry.height })}`);
  keyboard(window, window, 'a', { ctrlKey: true });
  await sleep(40);
  const remainingGroup = selectedGeometry(document);
  if (remainingGroup) {
    const onlyOnePoint = { x: remainingGroup.x + remainingGroup.width / 2, y: remainingGroup.y + remainingGroup.height / 2 };
    pointer(window, canvas, 'pointerdown', onlyOnePoint.x, onlyOnePoint.y, { shiftKey: true });
    pointer(window, canvas, 'pointerup', onlyOnePoint.x, onlyOnePoint.y, { shiftKey: true });
  }
  await sleep(40);
  click(window, 'button[aria-label="Delete selected object"]');
  await sleep(80);
  check('multi-select audit restores the one-artwork baseline for later tests', countObjects(canvas) === 1);

  section('Layer safety, multiple objects and eraser');
  click(window, 'button[aria-label="Pencil"]');
  await sleep(50);
  const cleanHashBeforeOverlap = canvasHash(canvas);
  drawCircle(window, canvas, 600, 360, 105);
  check('rough sketch overlaps an accepted object without changing it',
    canvasHash(canvas) === cleanHashBeforeOverlap && inkPixels(sketch) > 1000);
  await sleep(2400);
  const overlappingCard = [...document.querySelectorAll('button.s-card')]
    .find((card) => card.querySelector('.s-card-art svg'));
  overlappingCard?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(180);
  check('overlapping acceptance adds another editable object', countObjects(canvas) === 2);
  check('overlapping acceptance clears rough pixels but keeps clean art', inkPixels(sketch) === 0 && inkPixels(canvas) > 0);

  click(window, 'button[aria-label="Pencil"]');
  await sleep(40);
  const firstObjectRegion = regionPixels(canvas, 550, 310, 100, 100);
  const cleanBeforeSeparateSketch = canvasHash(canvas);
  drawCircle(window, canvas, 300, 200, 70);
  check('separate rough sketch never composites into the scene canvas', canvasHash(canvas) === cleanBeforeSeparateSketch);
  await sleep(2200);
  const separateCard = [...document.querySelectorAll('button.s-card')]
    .find((card) => card.querySelector('.s-card-art svg'));
  separateCard?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(180);
  check('a separate accepted drawing becomes a third object', countObjects(canvas) === 3);
  check('inserting a separate object leaves the first object region unchanged',
    Buffer.compare(firstObjectRegion, regionPixels(canvas, 550, 310, 100, 100)) === 0);

  click(window, 'button[aria-label="Eraser"]');
  await sleep(40);
  drawLine(window, canvas, 230, 200, 370, 200);
  await sleep(120);
  check('eraser removes the object it crosses without drawing onto clean pixels', countObjects(canvas) === 2 && inkPixels(sketch) === 0);
  click(window, 'button[aria-label="Undo"]');
  await sleep(100);
  check('one undo restores the object removed by an eraser gesture', countObjects(canvas) === 3);
  click(window, 'button[aria-label="Redo"]');
  await sleep(100);
  check('one redo reapplies that eraser gesture', countObjects(canvas) === 2);

  section('Clear and export decision');
  const clearButton = [...document.querySelectorAll('button')].find((button) => /Clear canvas/i.test(button.textContent ?? ''));
  check('clear control exists', Boolean(clearButton));
  click(window, 'button[aria-label="Pencil"]');
  await sleep(40);
  drawCircle(window, canvas, 250, 520, 45);
  clearButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(150);
  check('clear removes every scene object', countObjects(canvas) === 0);
  check('clear removes temporary rough pixels', inkPixels(sketch) === 0);
  click(window, 'button[aria-label="Undo"]');
  await sleep(120);
  check('undo restores the complete pre-clear scene and sketch', countObjects(canvas) === 2 && inkPixels(sketch) > 0);
  check('there is no download/export/transparent UI or retry link',
    ![...document.querySelectorAll('button, a')].some((element) => /download|export|transparent|save the png/i.test(
      `${element.textContent ?? ''} ${element.getAttribute('aria-label') ?? ''}`,
    )));

  section('Full-height wrapper pointer input');
  click(window, 'button[aria-label="Pencil"]');
  await sleep(40);
  const wrapper = document.querySelector('.canvas-wrap');
  let displayIndex = 0;
  for (const { width, height, label } of [
    { width: 1000, height: 600, label: '1000×600' },
    { width: 750, height: 450, label: '750×450' },
    { width: 320, height: 192, label: '320×192 narrow' },
  ]) {
    const logicalX = 300 + displayIndex * 300;
    displayIndex += 1;
    window.__auditCanvasRect = { left: 31, top: 47, width, height };
    const bounds = ['.canvas-wrap', '.art-canvas', '.sketch-overlay']
      .map((selector) => document.querySelector(selector).getBoundingClientRect());
    const aligned = bounds.every((rect) => rect.left === bounds[0].left && rect.top === bounds[0].top
      && rect.width === bounds[0].width && rect.height === bounds[0].height && rect.bottom === bounds[0].bottom);
    check(`${label}: pointer viewport, art and sketch DOM rectangles align`, aligned);
    const fractions = [5, 25, 50, 75, 85, 90, 95, 98];
    for (const percent of fractions) {
      const logicalY = CANVAS_H * percent / 100;
      const clientX = 31 + width * logicalX / CANVAS_W;
      const clientY = 47 + height * percent / 100;
      pointer(window, wrapper, 'pointerdown', clientX, clientY);
      pointer(window, wrapper, 'pointerup', clientX, clientY);
      check(`${label}: wrapper accepts ${percent}% bottom-input probe`,
        logicalY >= 0 && logicalY < CANVAS_H && hasInkNear(sketch, logicalX, logicalY),
        `logical (${logicalX},${logicalY.toFixed(1)})`);
    }
    const logicalY = 718;
    const clientX = 31 + width * logicalX / CANVAS_W;
    const clientY = 47 + height * logicalY / CANVAS_H;
    pointer(window, wrapper, 'pointerdown', clientX, clientY);
    pointer(window, wrapper, 'pointerup', clientX, clientY);
    check(`${label}: safe interior y=718 is drawable`, hasInkNear(sketch, logicalX, logicalY),
      `logical y=${logicalY}`);
  }

  section('Editable text-tool interaction');
  clearButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(80);
  click(window, 'button[aria-label="Text tool"]');
  await sleep(30);
  check('Text tool can be selected', document.querySelector('button[aria-label="Text tool"]')?.getAttribute('aria-pressed') === 'true');
  let textClient = logicalToClient(window, 350, 220);
  pointer(window, wrapper, 'pointerdown', textClient.x, textClient.y);
  pointer(window, wrapper, 'pointerup', textClient.x, textClient.y);
  await sleep(30);
  let textInput = document.querySelector('input[aria-label="Enter canvas text"]');
  check('Text mode opens a compact contextual input at the canvas click', Boolean(textInput),
    `tool=${document.querySelector('.canvas-wrap')?.className}; draft=${Boolean(document.querySelector('.text-entry'))}; point=${textClient.x},${textClient.y}`);
  textInput?.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  await sleep(20);
  check('Escape cancels text creation without adding an object', countObjects(canvas) === 0 && !document.querySelector('.text-entry'));

  click(window, 'button[aria-label="Text tool"]');
  await sleep(20);
  textClient = logicalToClient(window, 350, 220);
  pointer(window, wrapper, 'pointerdown', textClient.x, textClient.y);
  pointer(window, wrapper, 'pointerup', textClient.x, textClient.y);
  await sleep(30);
  textInput = document.querySelector('input[aria-label="Enter canvas text"]');
  setControlValue(window, textInput, 'Canvas title');
  await sleep(20);
  check('inline text input updates its draft', document.querySelector('.text-entry')?.dataset.draftValue === 'Canvas title',
    `input=${textInput?.value ?? 'missing'} draft=${document.querySelector('.text-entry')?.dataset.draftValue ?? 'missing'}`);
  textInput?.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  await sleep(60);
  let textGeometry = selectedGeometry(document);
  check('Enter creates a structured text object and selects it', countObjects(canvas) === 1
    && textGeometry?.svg.dataset.objectType === 'text' && textGeometry.svg.getAttribute('aria-label') === 'Selected Canvas title',
    `objects=${countObjects(canvas)} type=${textGeometry?.svg.dataset.objectType ?? 'none'} label=${textGeometry?.svg.getAttribute('aria-label') ?? 'none'} draft=${document.querySelector('.text-entry')?.dataset.draftValue ?? 'closed'}`);
  check('new text starts with the shared Active Color', selectedColor(document) === '#18A4F7', selectedColor(document));
  check('selected text exposes compact editing and style controls', Boolean(document.querySelector('button[aria-label="Edit text content"]'))
    && Boolean(document.querySelector('select[aria-label="Text font size"]'))
    && Boolean(document.querySelector('select[aria-label="Text font family"]')));

  const textColorBeforeActiveChange = selectedColor(document);
  await setActiveHex(window, '#F0D84F');
  check('changing Active Color does not automatically recolor selected text',
    selectedColor(document) === textColorBeforeActiveChange);
  click(window, 'button[aria-label="Apply Active Color"]');
  await sleep(30);
  check('explicit Active Color application recolors selected text', selectedColor(document) === '#F0D84F');
  click(window, 'button[aria-label="Undo"]');
  await sleep(30);
  check('text recolor participates in undo history', selectedColor(document) === textColorBeforeActiveChange);
  click(window, 'button[aria-label="Redo"]');
  await sleep(30);
  check('redo restores the selected text color', selectedColor(document) === '#F0D84F');

  click(window, 'button[aria-label="Toggle bold text"]');
  setControlValue(window, document.querySelector('select[aria-label="Text font family"]'), 'Georgia, serif');
  setControlValue(window, document.querySelector('select[aria-label="Text font size"]'), '64');
  click(window, 'button[aria-label="Align text center"]');
  await sleep(30);
  textGeometry = selectedGeometry(document);
  check('bold, font family, font size and alignment controls update text data',
    textGeometry?.svg.dataset.objectFontWeight === 'bold'
      && textGeometry.svg.dataset.objectFontFamily === 'Georgia, serif'
      && Number(textGeometry.svg.dataset.objectFontSize) >= 64
      && textGeometry.svg.dataset.objectTextAlign === 'center'
      && selectedColor(document) === '#F0D84F');

  if (textGeometry) {
    const centerX = textGeometry.x + textGeometry.width / 2;
    const centerY = textGeometry.y + textGeometry.height / 2;
    const centerClient = logicalToClient(window, centerX, centerY);
    wrapper.dispatchEvent(new window.MouseEvent('dblclick', {
      bubbles: true, cancelable: true, clientX: centerClient.x, clientY: centerClient.y, detail: 2,
    }));
    await sleep(25);
    let editInput = document.querySelector('input[aria-label="Edit text content"]');
    const doubleClickOpened = Boolean(editInput);
    check('double-click opens inline text editing', doubleClickOpened);
    if (!editInput) {
      click(window, 'button[aria-label="Edit text content"]');
      await sleep(20);
      editInput = document.querySelector('input[aria-label="Edit text content"]');
    }
    await setTextAndConfirm(window, editInput, 'Edited title');
    await sleep(40);
    check('inline text editing updates wording without recreating the object', countObjects(canvas) === 1
      && document.querySelector('.object-toolbar strong')?.textContent === 'Edited title',
      `input=${Boolean(editInput)} title=${document.querySelector('.object-toolbar strong')?.textContent ?? 'missing'}`);
  }

  textGeometry = selectedGeometry(document);
  if (textGeometry) {
    const oldX = textGeometry.x;
    const oldY = textGeometry.y;
    const centerClient = logicalToClient(window, textGeometry.x + textGeometry.width / 2, textGeometry.y + textGeometry.height / 2);
    const movedClient = logicalToClient(window, textGeometry.x + textGeometry.width / 2 + 14, textGeometry.y + textGeometry.height / 2 + 9);
    pointer(window, wrapper, 'pointerdown', centerClient.x, centerClient.y);
    pointer(window, wrapper, 'pointermove', movedClient.x, movedClient.y);
    pointer(window, wrapper, 'pointerup', movedClient.x, movedClient.y);
    await sleep(25);
    textGeometry = selectedGeometry(document);
    check('text can be moved with the shared select gesture', Boolean(textGeometry)
      && Math.abs(textGeometry.x - oldX - 14) < 1 && Math.abs(textGeometry.y - oldY - 9) < 1);
  }

  textGeometry = selectedGeometry(document);
  if (textGeometry) {
    const resize = document.querySelector('.resize-hit-area[data-sign-x="1"][data-sign-y="1"]');
    const circle = resize?.querySelector('circle');
    const startX = Number(circle?.getAttribute('cx'));
    const startY = Number(circle?.getAttribute('cy'));
    const startClient = logicalToClient(window, startX, startY);
    const endClient = logicalToClient(window, startX + 36, startY + 24);
    const oldWidth = textGeometry.width;
    pointer(window, resize, 'pointerdown', startClient.x, startClient.y);
    pointer(window, wrapper, 'pointermove', endClient.x, endClient.y);
    pointer(window, wrapper, 'pointerup', endClient.x, endClient.y);
    await sleep(25);
    textGeometry = selectedGeometry(document);
    check('text corner resize scales its editable bounds and font together', Boolean(textGeometry)
      && textGeometry.width > oldWidth && Number(textGeometry.svg.dataset.objectFontSize) >= 10);
  }

  textGeometry = selectedGeometry(document);
  if (textGeometry) {
    const rotate = document.querySelector('.rotation-hit-area');
    const handleX = Number(rotate?.getAttribute('cx'));
    const handleY = Number(rotate?.getAttribute('cy'));
    const centerX = textGeometry.x + textGeometry.width / 2;
    const centerY = textGeometry.y + textGeometry.height / 2;
    const radius = Math.hypot(handleX - centerX, handleY - centerY);
    const startClient = logicalToClient(window, handleX, handleY);
    const endClient = logicalToClient(window, centerX + radius, centerY);
    pointer(window, rotate, 'pointerdown', startClient.x, startClient.y);
    pointer(window, wrapper, 'pointermove', endClient.x, endClient.y);
    pointer(window, wrapper, 'pointerup', endClient.x, endClient.y);
    await sleep(25);
    textGeometry = selectedGeometry(document);
    check('text rotation handle updates scene rotation', Boolean(textGeometry)
      && Math.abs(Number(textGeometry.svg.dataset.objectRotation)) > 5);
  }

  click(window, 'button[aria-label="Duplicate selected object"]');
  await sleep(30);
  check('text duplicates through the shared object toolbar', countObjects(canvas) === 2);
  click(window, 'button[aria-label="Send selected object backward"]');
  await sleep(25);
  check('text layer order uses the shared one-step stack controls',
    Boolean(document.querySelector('button[aria-label="Bring selected object forward"]'))
      && !document.querySelector('button[aria-label="Bring selected object forward"]').disabled);
  click(window, 'button[aria-label="Delete selected object"]');
  await sleep(30);
  check('text delete removes only the selected duplicate', countObjects(canvas) === 1);

  section('Fill layer and canvas background interaction');
  clearButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(80);
  const fillCanvas = document.querySelector('.fill-canvas');
  click(window, 'button[aria-label="Pencil"]');
  await sleep(20);
  const rectangle = [{ x: 200, y: 160 }, { x: 500, y: 160 }, { x: 500, y: 390 }, { x: 200, y: 390 }, { x: 200, y: 160 }]
    .map(({ x, y }) => logicalToClient(window, x, y));
  drawPolyline(window, wrapper, rectangle);
  await sleep(30);
  const closedSketchInk = inkPixels(sketch);
  click(window, 'button[aria-label="Text tool"]');
  await sleep(20);
  textClient = logicalToClient(window, 230, 230);
  pointer(window, wrapper, 'pointerdown', textClient.x, textClient.y);
  pointer(window, wrapper, 'pointerup', textClient.x, textClient.y);
  await sleep(30);
  await setTextAndConfirm(window, document.querySelector('input[aria-label="Enter canvas text"]'), 'Editable');
  await sleep(40);
  click(window, 'button[aria-label="Fill tool"]');
  await sleep(20);
  const bucketActiveColor = await setActiveHex(window, '#7FA3BC');
  check('bucket controls report the shared full-RGB Active Color',
    bucketActiveColor === '#7FA3BC' && document.querySelector('[aria-label="Bucket uses active color"]')?.textContent === '#7FA3BC',
    bucketActiveColor);
  const fillInside = logicalToClient(window, 450, 350);
  const cleanBeforeFill = canvasHash(canvas);
  pointer(window, wrapper, 'pointerdown', fillInside.x, fillInside.y);
  pointer(window, wrapper, 'pointerup', fillInside.x, fillInside.y);
  await sleep(40);
  check('bucket fills the connected interior with exact arbitrary RGB on a dedicated layer', inkPixels(fillCanvas) > 1000
    && pixelAt(fillCanvas, 450, 350).slice(0, 3).join(',') === '127,163,188');
  check('fill leaves rough sketch, editable text and clean-art pixels independent',
    inkPixels(sketch) === closedSketchInk && countObjects(canvas) === 1 && canvasHash(canvas) === cleanBeforeFill,
    `sketch=${inkPixels(sketch)}/${closedSketchInk} objects=${countObjects(canvas)} artStable=${canvasHash(canvas) === cleanBeforeFill}`);
  click(window, 'button[aria-label="Undo"]');
  await sleep(40);
  check('one undo removes the completed bucket operation without deleting text', inkPixels(fillCanvas) === 0 && countObjects(canvas) === 1,
    `fill=${inkPixels(fillCanvas)} objects=${countObjects(canvas)}`);
  click(window, 'button[aria-label="Redo"]');
  await sleep(40);
  check('redo restores the raster fill while the text remains editable', inkPixels(fillCanvas) > 1000 && countObjects(canvas) === 1,
    `fill=${inkPixels(fillCanvas)} objects=${countObjects(canvas)}`);

  await setActiveHex(window, '#18A4F7');
  check('changing Active Color does not immediately recolor an existing bucket fill',
    pixelAt(fillCanvas, 450, 350).slice(0, 3).join(',') === '127,163,188');
  const fillAgain = logicalToClient(window, 450, 350);
  pointer(window, wrapper, 'pointerdown', fillAgain.x, fillAgain.y);
  pointer(window, wrapper, 'pointerup', fillAgain.x, fillAgain.y);
  await sleep(35);
  check('the next bucket action uses the new arbitrary Active Color',
    pixelAt(fillCanvas, 450, 350).slice(0, 3).join(',') === '24,164,247');
  click(window, 'button[aria-label="Undo"]');
  await sleep(25);
  check('undo restores the fill color before the latest bucket operation',
    pixelAt(fillCanvas, 450, 350).slice(0, 3).join(',') === '127,163,188');
  click(window, 'button[aria-label="Redo"]');
  await sleep(25);
  check('redo restores the latest bucket RGB color',
    pixelAt(fillCanvas, 450, 350).slice(0, 3).join(',') === '24,164,247');

  await setActiveHex(window, '#123456');
  check('choosing an Active Color does not alter the background without action',
    document.querySelector('.canvas-stage')?.dataset.backgroundColor === '#FFFFFF');
  click(window, 'button[aria-label="Set background to active color"]');
  await sleep(25);
  check('Set Background to Active Color applies the exact selected RGB value',
    document.querySelector('.canvas-stage')?.dataset.backgroundColor === '#123456');
  click(window, 'button[aria-label="Undo"]');
  await sleep(25);
  check('canvas background change is undoable', document.querySelector('.canvas-stage')?.dataset.backgroundColor === '#FFFFFF');
  click(window, 'button[aria-label="Redo"]');
  await sleep(25);
  check('canvas background change is redoable', document.querySelector('.canvas-stage')?.dataset.backgroundColor === '#123456');
  click(window, 'button[aria-label="Reset canvas background to white"]');
  await sleep(20);
  check('Reset White restores canonical white background', document.querySelector('.canvas-stage')?.dataset.backgroundColor === '#FFFFFF');
  click(window, 'button[aria-label="Undo"]');
  await sleep(25);
  check('Reset White is undoable and restores the previous background', document.querySelector('.canvas-stage')?.dataset.backgroundColor === '#123456');
  click(window, 'button[aria-label="Redo"]');
  await sleep(25);
  check('redo reapplies the Reset White action', document.querySelector('.canvas-stage')?.dataset.backgroundColor === '#FFFFFF');
  click(window, 'button[aria-label="Select tool"]');
  await sleep(25);
  check('scene object remains selected, recolored only by explicit action, and editable after fills',
    countObjects(canvas) === 1 && document.querySelector('.object-toolbar strong')?.textContent === 'Editable'
      && selectedColor(document) === '#F0D84F',
    `objects=${countObjects(canvas)} toolbar=${document.querySelector('.object-toolbar strong')?.textContent ?? 'missing'} color=${selectedColor(document)}`);

  section('Zoom, pan and transformed pointer input');
  clearButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(70);
  click(window, 'button[aria-label="Zoom out"]');
  await sleep(15);
  click(window, 'button[aria-label="Zoom out"]');
  await sleep(15);
  check('zoom controls reach 50%', document.querySelector('[data-zoom-level]')?.textContent === '50%',
    document.querySelector('[data-zoom-level]')?.textContent ?? 'missing');
  click(window, 'button[aria-label="Reset view"]');
  await sleep(15);
  check('reset view returns to 100%', document.querySelector('[data-zoom-level]')?.textContent === '100%'
    && Number(document.querySelector('.canvas-stage')?.dataset.viewPanX) === 0
    && Number(document.querySelector('.canvas-stage')?.dataset.viewPanY) === 0);

  click(window, 'button[aria-label="Pencil"]');
  await sleep(20);
  for (const [logicalX, logicalY, label] of [[600, 80, 'top'], [600, 360, 'center'], [600, 680, 'bottom']]) {
    const pointValue = logicalToClient(window, logicalX, logicalY);
    pointer(window, wrapper, 'pointerdown', pointValue.x, pointValue.y);
    pointer(window, wrapper, 'pointerup', pointValue.x, pointValue.y);
    check(`100% ${label} pointer remains aligned`, hasInkNear(sketch, logicalX, logicalY));
  }
  for (const [expected, increments] of [['100%', 0], ['200%', 3], ['400%', 2]]) {
    for (let step = 0; step < increments; step += 1) {
      click(window, 'button[aria-label="Zoom in"]');
      await sleep(15);
    }
    check(`zoom controls reach ${expected}`, document.querySelector('[data-zoom-level]')?.textContent === expected,
      document.querySelector('[data-zoom-level]')?.textContent ?? 'missing');
    const logicalX = 600;
    const logicalY = 360;
    const pointValue = logicalToClient(window, logicalX, logicalY);
    pointer(window, wrapper, 'pointerdown', pointValue.x, pointValue.y);
    pointer(window, wrapper, 'pointerup', pointValue.x, pointValue.y);
    await sleep(15);
    check(`${expected} center pointer remains aligned`, hasInkNear(sketch, logicalX, logicalY));
  }

  click(window, 'button[aria-label="Reset view"]');
  await sleep(15);
  for (let step = 0; step < 3; step += 1) {
    click(window, 'button[aria-label="Zoom out"]');
    await sleep(10);
  }
  click(window, 'button[aria-label="Text tool"]');
  await sleep(20);
  const outsideCanvas = { x: window.__auditCanvasRect.left + 2, y: window.__auditCanvasRect.top + 2 };
  pointer(window, wrapper, 'pointerdown', outsideCanvas.x, outsideCanvas.y);
  pointer(window, wrapper, 'pointerup', outsideCanvas.x, outsideCanvas.y);
  await sleep(15);
  check('text tool ignores blank viewport margins outside the zoomed document',
    countObjects(canvas) === 0 && !document.querySelector('input[aria-label="Enter canvas text"]'));
  let handleSeed = logicalToClient(window, 550, 330);
  pointer(window, wrapper, 'pointerdown', handleSeed.x, handleSeed.y);
  pointer(window, wrapper, 'pointerup', handleSeed.x, handleSeed.y);
  await sleep(25);
  await setTextAndConfirm(window, document.querySelector('input[aria-label="Enter canvas text"]'), 'Handle');
  await sleep(35);
  check('selection-handle probe creates an editable text object', selectedGeometry(document)?.svg.dataset.objectType === 'text');

  for (const [zoom, direction, steps] of [[0.25, 'out', 3], [0.5, 'out', 2], [1, 'reset', 0], [2, 'in', 3], [4, 'in', 5]]) {
    click(window, 'button[aria-label="Reset view"]');
    await sleep(10);
    if (direction !== 'reset') {
      for (let step = 0; step < steps; step += 1) {
        click(window, `button[aria-label="Zoom ${direction}"]`);
        await sleep(10);
      }
    }
    const stageAtScale = document.querySelector('.canvas-stage');
    const hitCircle = document.querySelector('.resize-hit-area circle:first-child');
    const visibleHandle = document.querySelector('.resize-handle');
    const cssScale = (window.__auditCanvasRect.width / CANVAS_W) * Number(stageAtScale.dataset.viewZoom);
    const hitTargetPixels = Number(hitCircle?.getAttribute('r')) * cssScale;
    const handlePixels = Number(visibleHandle?.getAttribute('r')) * cssScale;
    check(`${zoom * 100}% selection handles retain usable screen size`,
      Number(stageAtScale.dataset.viewZoom) === zoom && Math.abs(hitTargetPixels - 17) < 1e-6
        && Math.abs(handlePixels - 6) < 1e-6,
      `hit radius=${hitTargetPixels.toFixed(1)}px handle radius=${handlePixels.toFixed(1)}px`);

    if (zoom === 0.25 || zoom === 4) {
      const geometryBefore = selectedGeometry(document);
      const resizeHandle = document.querySelector('.resize-hit-area[data-sign-x="1"][data-sign-y="1"]');
      const circle = resizeHandle?.querySelector('circle');
      const startX = Number(circle?.getAttribute('cx'));
      const startY = Number(circle?.getAttribute('cy'));
      const startClient = logicalToClient(window, startX, startY);
      const step = zoom === 0.25 ? 18 : 8;
      const endClient = logicalToClient(window, startX + step, startY + step);
      pointer(window, resizeHandle, 'pointerdown', startClient.x, startClient.y);
      pointer(window, wrapper, 'pointermove', endClient.x, endClient.y);
      pointer(window, wrapper, 'pointerup', endClient.x, endClient.y);
      await sleep(20);
      const geometryAfter = selectedGeometry(document);
      check(`${zoom * 100}% resize handle still transforms the selected text`,
        Boolean(geometryBefore && geometryAfter) && geometryAfter.width > geometryBefore.width);
      if (zoom === 0.25) {
        click(window, 'button[aria-label="Undo"]');
        await sleep(20);
        check('one undo restores text size after low-zoom handle use',
          Math.abs((selectedGeometry(document)?.width ?? 0) - geometryBefore.width) < 1e-6);
      }
    }
  }

  click(window, 'button[aria-label="Reset view"]');
  await sleep(15);
  click(window, 'button[aria-label="Zoom in"]');
  await sleep(15);
  click(window, 'button[aria-label="Zoom in"]');
  await sleep(15);
  const stage = document.querySelector('.canvas-stage');
  const oldPanX = Number(stage.dataset.viewPanX);
  const oldPanY = Number(stage.dataset.viewPanY);
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
  const centerPoint = logicalToClient(window, 600, 360);
  pointer(window, wrapper, 'pointerdown', centerPoint.x, centerPoint.y);
  pointer(window, wrapper, 'pointermove', centerPoint.x + 25, centerPoint.y + 13);
  pointer(window, wrapper, 'pointerup', centerPoint.x + 25, centerPoint.y + 13);
  window.dispatchEvent(new window.KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
  await sleep(20);
  check('Space + drag pans without entering document history',
    Number(stage.dataset.viewPanX) === oldPanX + 25 && Number(stage.dataset.viewPanY) === oldPanY + 13);

  click(window, 'button[aria-label="Pencil"]');
  await sleep(20);
  await setActiveHex(window, '#123456');
  setControlValue(window, document.querySelector('input[aria-label="Brush size"]'), '1');
  await sleep(20);
  const thinStart = logicalToClient(window, 400, 500.5);
  const thinEnd = logicalToClient(window, 800, 500.5);
  drawLine(window, wrapper, thinStart.x, thinStart.y, thinEnd.x, thinEnd.y);
  await sleep(30);
  const thinRows = inkRowsAtX(sketch, 600, 400, 601);
  check('1 px brush remains one logical-pixel thick while drawing under zoom and pan',
    thinRows.length >= 1 && thinRows.length <= 2 && hasInkNear(sketch, 600, 500, 2),
    `${thinRows.length} covered rows; zoom=${stage.dataset.viewZoom}`);
  click(window, 'button[aria-label="Undo"]');
  await sleep(20);
  setControlValue(window, document.querySelector('input[aria-label="Brush size"]'), '100');
  await sleep(20);
  const wideStart = logicalToClient(window, 400, 500.5);
  const wideEnd = logicalToClient(window, 800, 500.5);
  drawLine(window, wrapper, wideStart.x, wideStart.y, wideEnd.x, wideEnd.y);
  await sleep(30);
  const wideRows = inkRowsAtX(sketch, 600, 400, 601);
  check('100 px brush size is measured in logical document pixels',
    wideRows.length >= 95 && wideRows.length <= 102 && countRgbPixels(sketch, [18, 52, 86]) > 0,
    `${wideRows.length} covered rows at ${stage.dataset.viewZoom}× display zoom`);
  click(window, 'button[aria-label="Undo"]');
  await sleep(20);
  setControlValue(window, document.querySelector('input[aria-label="Brush size"]'), '7');
  await sleep(20);

  const wheelAnchor = logicalToClient(window, 600, 360);
  const beforeWheel = Number(stage.dataset.viewZoom);
  const beforeWheelPan = { x: Number(stage.dataset.viewPanX), y: Number(stage.dataset.viewPanY) };
  const wheelRect = window.__auditCanvasRect;
  const expectedWorldPoint = {
    x: ((wheelAnchor.x - wheelRect.left) - beforeWheelPan.x) / beforeWheel * CANVAS_W / wheelRect.width,
    y: ((wheelAnchor.y - wheelRect.top) - beforeWheelPan.y) / beforeWheel * CANVAS_H / wheelRect.height,
  };
  const wheelEvent = new window.WheelEvent('wheel', {
    bubbles: true, cancelable: true, clientX: wheelAnchor.x, clientY: wheelAnchor.y, deltaY: -180,
  });
  wrapper.dispatchEvent(wheelEvent);
  await sleep(20);
  const afterWheel = Number(stage.dataset.viewZoom);
  const stationaryAfterWheel = {
    x: ((wheelAnchor.x - wheelRect.left) - Number(stage.dataset.viewPanX)) / afterWheel * CANVAS_W / wheelRect.width,
    y: ((wheelAnchor.y - wheelRect.top) - Number(stage.dataset.viewPanY)) / afterWheel * CANVAS_H / wheelRect.height,
  };
  check('wheel zoom is non-passive, pointer-anchored and does not change scene coordinates',
    wheelEvent.defaultPrevented && afterWheel > beforeWheel
      && Math.abs(stationaryAfterWheel.x - expectedWorldPoint.x) < 1e-6
      && Math.abs(stationaryAfterWheel.y - expectedWorldPoint.y) < 1e-6,
    `anchored world point ${stationaryAfterWheel.x.toFixed(2)},${stationaryAfterWheel.y.toFixed(2)}`);
  click(window, 'button[aria-label="Reset view"]');
  await sleep(15);
  check('final view reset clears zoom and pan', document.querySelector('[data-zoom-level]')?.textContent === '100%'
    && Number(stage.dataset.viewPanX) === 0 && Number(stage.dataset.viewPanY) === 0);

  dom.window.close();
  console.log('\n' + '='.repeat(60));
  console.log(`${passed} passed, ${failed} failed`);
  if (failed) {
    console.log('Failed: ' + failures.join(' | '));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('\nAudit crashed:', error);
  process.exitCode = 1;
});
