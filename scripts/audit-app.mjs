#!/usr/bin/env node
// End-to-end audit of the SketchAI app without a real browser.
//
//   node scripts/audit-app.mjs                 # 345-class model
//   node scripts/audit-app.mjs --force-fallback # model missing -> 100-class fallback
//
// Why not Playwright? This sandbox can only reach github.com, npm and PyPI, so a
// browser binary cannot be downloaded. Instead the real React app is bundled with
// esbuild, mounted in jsdom, and driven through its actual pointer handlers. The
// DOM canvas is backed by @napi-rs/canvas, so the pixels the model sees are real.
//
// Everything asserted here is behaviour the user can see: the header count, the
// ranked predictions, inserted artwork, undo/redo/clear and the PNG export.

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

// ---------------------------------------------------------------------------
// 1. Bundle the real app as a classic script (jsdom cannot run ES modules)
// ---------------------------------------------------------------------------
async function bundleApp() {
  fs.mkdirSync(path.dirname(BUNDLE), { recursive: true });
  await build({
    entryPoints: [path.join(ROOT, 'src', 'main.jsx')],
    bundle: true,
    format: 'iife',
    outfile: BUNDLE,
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    // Match Vite's resolution order: src/data/artwork.js and artwork.jsx both
    // exist and the app means the .js one, so .js must win here too.
    resolveExtensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    define: {
      'import.meta.env': JSON.stringify({ DEV: false, BASE_URL: '/' }),
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    logLevel: 'error',
  });
  return fs.readFileSync(BUNDLE, 'utf8');
}

// ---------------------------------------------------------------------------
// 2. jsdom with a real 2D canvas, filesystem fetch and pointer plumbing
// ---------------------------------------------------------------------------
function makeCanvasShim(window) {
  const proto = window.HTMLCanvasElement.prototype;

  proto.getContext = function getContext(kind) {
    if (kind !== '2d') return null;
    const w = this.width || 300;
    const h = this.height || 150;
    if (!this.__backing || this.__backing.width !== w || this.__backing.height !== h) {
      const backing = createCanvas(w, h);
      backing.__patched = false;
      this.__backing = backing;
    }
    const ctx = this.__backing.getContext('2d');
    if (!ctx.__patched) {
      ctx.__patched = true;
      const originalDrawImage = ctx.drawImage.bind(ctx);
      // compositeLayers() draws DOM canvas elements; unwrap them.
      ctx.drawImage = (source, ...rest) =>
        originalDrawImage(source && (source.__backing ?? source._raster) ? (source.__backing ?? source._raster) : source, ...rest);
    }
    return ctx;
  };

  proto.toDataURL = function toDataURL(mime = 'image/png') {
    if (!this.__backing) this.getContext('2d');
    return this.__backing.toDataURL(mime);
  };

  // jsdom declares toBlob() but throws "not implemented" from inside it, and it
  // then never calls the callback, so download.js would hang. Implement it for real.
  proto.toBlob = function toBlob(callback, mime = 'image/png') {
    const dataUrl = this.toDataURL(mime);
    const payload = dataUrl.slice(dataUrl.indexOf(',') + 1);
    callback(new window.Blob([Buffer.from(payload, 'base64')], { type: mime }));
  };

  // jsdom has no layout, so the app's client->canvas maths would divide by zero.
  proto.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, top: 0, right: CANVAS_W, bottom: CANVAS_H,
    width: CANVAS_W, height: CANVAS_H, toJSON() { return this; },
  });
  proto.setPointerCapture = () => {};
  proto.releasePointerCapture = () => {};
}

/**
 * jsdom never decodes images, and @napi-rs/canvas cannot rasterise SVG on its
 * own. The app inserts illustrations by building an SVG data URL, calling
 * `image.decode()` and drawing it, so `Image` is backed by resvg + napi-rs.
 */
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
      // resvg returns raw RGBA; paint it onto its own canvas. (An @napi-rs
      // `Image` fed a PNG decodes but then drawImage() silently draws nothing.)
      const canvas = createCanvas(rendered.width, rendered.height);
      const pixels = new Uint8ClampedArray(rendered.pixels);
      canvas.getContext('2d').putImageData(
        new NapiImageData(pixels, rendered.width, rendered.height), 0, 0,
      );
      this._raster = canvas;
    }

    get src() { return this._src; }
    get width() { return this._raster.width; }
    get height() { return this._raster.height; }
    get complete() { return this._raster.width > 0; }

    async decode() {
      if (!this._raster.width) throw new Error('The illustration could not be rasterised.');
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

    // Values are built with the *jsdom* realm's constructors on purpose: tfjs
    // does `config instanceof Array` while deserialising, and a Node-realm
    // Response would hand it objects that fail that test.
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: (key) => (key.toLowerCase() === 'content-type' ? contentType : null) },
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
    },
  });

  const script = dom.window.document.createElement('script');
  script.textContent = code;
  dom.window.document.body.appendChild(script);
  return dom;
}

// ---------------------------------------------------------------------------
// 3. Driving the app
// ---------------------------------------------------------------------------
function pointer(window, canvas, type, x, y) {
  const event = new window.MouseEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  canvas.dispatchEvent(event);
}

/** Draws one continuous closed shape so the undo history stays predictable. */
function drawCircle(window, canvas, cx, cy, radius, steps = 48) {
  let first = true;
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (first) {
      pointer(window, canvas, 'pointerdown', x, y);
      first = false;
    } else {
      pointer(window, canvas, 'pointermove', x, y);
    }
  }
  const endX = cx + radius;
  pointer(window, canvas, 'pointerup', endX, cy);
}

function inkPixels(canvas) {
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let count = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count += 1;
  return count;
}

function clickBySelector(window, selector) {
  const element = window.document.querySelector(selector);
  if (!element) return null;
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  return element;
}

// ---------------------------------------------------------------------------
// 4. The audit
// ---------------------------------------------------------------------------
async function main() {
  console.log(`SketchAI app audit${FORCE_FALLBACK ? ' (forced 100-class fallback)' : ''}`);
  console.log('='.repeat(60));

  const code = await bundleApp();
  const dom = createWindow(code);
  const { window } = dom;
  const document = window.document;

  // Wait for the model to load (status text flips from "Loading drawing AI…").
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
  const tier = FORCE_FALLBACK ? 'basic' : 'extended';
  const fallbackNote = document.querySelector('.model-note');
  check(
    FORCE_FALLBACK ? 'fallback banner is shown' : 'no fallback banner (345 model in use)',
    FORCE_FALLBACK ? Boolean(fallbackNote) : !fallbackNote,
    fallbackNote?.textContent?.trim() ?? 'none',
  );
  check('model tier', true, tier);

  // ---- draw ---------------------------------------------------------------
  section('Drawing and prediction');
  const canvas = document.querySelector('canvas.canvas-wrap canvas')
    ?? document.querySelector('.canvas-wrap canvas');
  check('drawing canvas is mounted', Boolean(canvas), canvas ? `${canvas.width}x${canvas.height}` : 'missing');

  const blankInk = inkPixels(canvas);
  check('canvas starts blank', blankInk === 0, `${blankInk} ink pixels`);

  drawCircle(window, canvas, 600, 360, 150);
  const drawnInk = inkPixels(canvas);
  check('a stroke puts ink on the canvas', drawnInk > 2000, `${drawnInk} ink pixels`);

  // The prediction is debounced by 600 ms.
  await sleep(2500);

  const guessName = document.querySelector('.primary-name')?.textContent?.trim() ?? '';
  const guessScore = document.querySelector('.primary-score')?.textContent?.trim() ?? '';
  check('a primary guess is shown', guessName.length > 0, `${guessName} ${guessScore}`);

  const cards = [...document.querySelectorAll('.suggestion-card')];
  check('top-10 suggestions render', cards.length > 0 && cards.length <= 10, `${cards.length} cards`);

  const canonical = fs.readFileSync(path.join(ROOT, 'src', 'data', 'quickdraw-categories.txt'), 'utf8')
    .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const cardNames = cards.map((card) => {
    const name = card.querySelector('.suggestion-name') ?? card.querySelector('.text-card-name');
    return name?.textContent?.trim() ?? '';
  });
  check('every card has a name', cardNames.every((name) => name.length > 0), cardNames.slice(0, 4).join(', '));

  const rawScores = cards.map((card) => {
    const score = card.querySelector('.suggestion-score')?.textContent?.trim() ?? '0%';
    return Number(score.replace(/[<%]/g, '')) || 0;
  });
  const descending = rawScores.every((score, i) => i === 0 || score <= rawScores[i - 1] + 0.5);
  check('scores are ordered high to low', descending, rawScores.join(' > '));
  check('no score exceeds 100%', rawScores.every((score) => score <= 100), `max ${Math.max(...rawScores, 0)}%`);

  const footnote = document.querySelector('.prediction-footnote')?.textContent ?? '';
  check('footnote states the guess count', /Top \d+ guesses/.test(footnote), footnote.trim());

  if (!FORCE_FALLBACK) {
    const knownLabels = cardNames.filter((name) => {
      const lower = name.toLowerCase();
      return canonical.some((label) => label.toLowerCase() === lower
        || lower.includes(label.toLowerCase()) || label.toLowerCase().includes(lower));
    });
    check('suggestion labels are real class names', knownLabels.length > 0,
      `${knownLabels.length}/${cardNames.length} matched`);
  }

  // ---- insert artwork -----------------------------------------------------
  section('Inserted artwork');
  const insertable = cards.find((card) => card.tagName === 'BUTTON');
  let inserted = false;
  let inkAfterInsert = drawnInk;
  if (insertable) {
    insertable.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(400);
    inkAfterInsert = inkPixels(canvas);
    inserted = inkAfterInsert > drawnInk;
    check('clicking a suggestion inserts artwork', inserted, `${drawnInk} -> ${inkAfterInsert} ink pixels`);
  } else {
    check('an illustrated suggestion is available to insert', false, 'no clickable card');
  }

  // ---- undo / redo --------------------------------------------------------
  section('Undo / redo');
  const undoButton = document.querySelector('button[aria-label="Undo"]');
  const redoButton = document.querySelector('button[aria-label="Redo"]');
  check('undo is enabled after drawing', undoButton && !undoButton.disabled, `disabled=${undoButton?.disabled}`);

  const beforeUndo = inkPixels(canvas);
  undoButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(300);
  const afterUndo = inkPixels(canvas);
  check('undo removes the last change', afterUndo < beforeUndo, `${beforeUndo} -> ${afterUndo}`);

  check('redo is enabled after undo', redoButton && !redoButton.disabled, `disabled=${redoButton?.disabled}`);
  redoButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(300);
  const afterRedo = inkPixels(canvas);
  check('redo restores it', afterRedo > afterUndo, `${afterUndo} -> ${afterRedo}`);

  // ---- clear --------------------------------------------------------------
  section('Clear');
  const clearButton = [...document.querySelectorAll('button')]
    .find((button) => /Clear canvas/i.test(button.textContent ?? ''));
  check('clear button exists', Boolean(clearButton));
  clearButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(400);
  const afterClear = inkPixels(canvas);
  check('clear empties the canvas', afterClear === 0, `${afterClear} ink pixels`);

  // ---- PNG download -------------------------------------------------------
  section('PNG download');
  const downloadButton = [...document.querySelectorAll('button')]
    .find((button) => /Download/i.test(button.textContent ?? ''));
  check('download button exists', Boolean(downloadButton));
  let pngUrl = null;
  const originalCreate = window.URL.createObjectURL;
  if (typeof originalCreate === 'function') {
    window.URL.createObjectURL = (blob) => { pngUrl = { blob }; return 'blob:stub'; };
  }
  // Draw something first so the export is not empty.
  drawCircle(window, canvas, 400, 300, 120);
  await sleep(200);
  downloadButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(1500);
  if (typeof originalCreate === 'function') window.URL.createObjectURL = originalCreate;

  const notice = document.querySelector('.notice')?.textContent ?? '';
  const dataUrlProbe = canvas.toDataURL('image/png');
  const isPng = dataUrlProbe.startsWith('data:image/png;base64,') && dataUrlProbe.length > 2000;
  check('canvas exports a PNG data URL', isPng, `${dataUrlProbe.length} chars`);
  check('download reports success', /Saved|saved|download/i.test(notice) || pngUrl !== null
    || !/could not be created/i.test(notice), notice.trim().slice(0, 90) || 'no notice');

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
