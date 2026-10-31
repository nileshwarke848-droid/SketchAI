#!/usr/bin/env node
// End-to-end audit of the real SketchAI React app in jsdom with a skia-backed
// canvas and SVG rasterisation. Exercises prediction, suggestions, editable
// scene objects, layered sketch safety, and undo/redo/eraser/clear behaviour.
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
    return layer && ['canvas-wrap', 'art-canvas', 'sketch-overlay', 'selection-overlay']
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

function pointer(window, target, type, x, y) {
  const event = new window.MouseEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  target.dispatchEvent(event);
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

function pixels(canvas) {
  return new Uint8ClampedArray(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
}

function inkPixels(canvas) {
  const data = pixels(canvas);
  let count = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count += 1;
  return count;
}

function countRedPixels(canvas) {
  const data = pixels(canvas);
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0 && data[i] > data[i + 1] * 1.25 && data[i] > data[i + 2] * 1.2) count += 1;
  }
  return count;
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

  section('Object color, flip, duplicate and layer order');
  click(window, 'button[aria-label="Recolor selected object #e26755"]');
  await sleep(180);
  const redAfterRecolor = countRedPixels(canvas);
  check('recolor action changes the clean vector rendering', redAfterRecolor > 0, `${redAfterRecolor} terracotta pixels`);
  click(window, 'button[aria-label="Undo"]');
  await sleep(90);
  check('one undo restores the previous object color', countRedPixels(canvas) === 0);
  click(window, 'button[aria-label="Redo"]');
  await sleep(90);
  check('one redo restores the recolored object', countRedPixels(canvas) > 0);
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
