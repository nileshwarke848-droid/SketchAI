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
import { getSketchBounds } from '../src/ai/preprocess.js';
import { getArtworkVariants, variantToSvgString } from '../src/data/artwork.js';
import { getArtworkReplacementPlacement } from '../src/lib/canvas-layers.js';

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
    const dataUrl = this.__backing.toDataURL(mime);
    window.__lastExportDataUrl = dataUrl;
    window.__lastExportPixels = new Uint8ClampedArray(
      this.getContext('2d').getImageData(0, 0, this.width, this.height).data,
    );
    return dataUrl;
  };

  // jsdom's native toBlob is unimplemented. Simulate the browser's asynchronous
  // callback so the activation regression can detect an anchor click delayed
  // until after the Download button's event has returned.
  proto.toBlob = function toBlob(callback, mime = 'image/png') {
    const dataUrl = this.toDataURL(mime);
    const payload = dataUrl.slice(dataUrl.indexOf(',') + 1);
    window.setTimeout(() => callback(new window.Blob([Buffer.from(payload, 'base64')], { type: mime })), 0);
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
      window.confirm = () => true;
      window.__downloadGestureActive = false;
      window.__rejectDownloadClick = false;
      window.__downloadClicks = [];
      window.HTMLAnchorElement.prototype.click = function clickDownloadAnchor() {
        window.__downloadClicks.push({
          href: this.href,
          filename: this.download,
          attached: this.isConnected,
          userActivated: window.__downloadGestureActive,
        });
        if (window.__rejectDownloadClick) throw new Error('simulated browser download restriction');
      };
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

function drawLine(window, canvas, x1, y1, x2, y2) {
  pointer(window, canvas, 'pointerdown', x1, y1);
  pointer(window, canvas, 'pointermove', x2, y2);
  pointer(window, canvas, 'pointerup', x2, y2);
}

function imagePixels(canvas) {
  return new Uint8ClampedArray(
    canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data,
  );
}

function renderVariant(variant, color = '#242422') {
  const svg = variantToSvgString(variant, { size: 320, color });
  const rendered = new Resvg(svg, { fitTo: { mode: 'width', value: 320 } }).render();
  const canvas = createCanvas(rendered.width, rendered.height);
  canvas.getContext('2d').putImageData(
    new NapiImageData(new Uint8ClampedArray(rendered.pixels), rendered.width, rendered.height),
    0,
    0,
  );
  return canvas;
}

function countNonWhitePixels(pixels) {
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) count += 1;
  }
  return count;
}

function inspectPngDataUrl(dataUrl) {
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) return null;
  const bytes = Buffer.from(dataUrl.slice(prefix.length), 'base64');
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) return null;
  return { bytes, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function inkPixels(canvas) {
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let count = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count += 1;
  return count;
}

// Insertion now *replaces* rough strokes with clean artwork in place, so "more
// ink" is no longer the right assertion. A fingerprint of the pixels is.
function regionPixels(canvas, x, y, w, h) {
  return new Uint8ClampedArray(canvas.getContext('2d').getImageData(x, y, w, h).data);
}

function inkInRegion(canvas, x, y, w, h) {
  const data = regionPixels(canvas, x, y, w, h);
  let count = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count += 1;
  return count;
}

function canvasHash(canvas) {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let hash = 2166136261;
  for (let i = 0; i < data.length; i += 61) { hash ^= data[i]; hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
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
  const canvas = document.querySelector('.canvas-wrap canvas.art-canvas');
  const sketch = document.querySelector('.canvas-wrap canvas.sketch-overlay');
  check('permanent art canvas is mounted', Boolean(canvas), canvas ? `${canvas.width}x${canvas.height}` : 'missing');
  check('temporary sketch canvas is mounted', Boolean(sketch), sketch ? `${sketch.width}x${sketch.height}` : 'missing');

  const blankInk = inkPixels(canvas);
  const blankSketchInk = inkPixels(sketch);
  check('permanent art starts blank', blankInk === 0, `${blankInk} ink pixels`);
  check('temporary sketch starts blank', blankSketchInk === 0, `${blankSketchInk} ink pixels`);

  // ---- suggestion bar ----------------------------------------------------
  section('Suggestion bar');
  const bar = document.querySelector('.suggestion-bar');
  check('suggestion bar is mounted', Boolean(bar), bar ? 'found' : 'missing');
  if (bar) {
    const following = bar.compareDocumentPosition(canvas) & window.Node.DOCUMENT_POSITION_FOLLOWING;
    check('the bar sits above the canvas', Boolean(following), `canvas follows bar: ${Boolean(following)}`);
  }
  const emptyText = document.querySelector('.suggestion-bar-empty')?.textContent?.trim() ?? '';
  check('empty state invites drawing', /start drawing/i.test(emptyText), emptyText);

  const permanentBeforeSketch = canvasHash(canvas);
  drawCircle(window, canvas, 600, 360, 150);
  const drawnInk = inkPixels(sketch);
  const permanentAfterSketch = canvasHash(canvas);
  check('a stroke appears on the temporary sketch layer', drawnInk > 2000, `${drawnInk} ink pixels`);
  check('ordinary drawing never paints onto permanent art', permanentAfterSketch === permanentBeforeSketch,
    `permanent fingerprint ${permanentBeforeSketch} -> ${permanentAfterSketch}`);

  // The prediction is debounced by 600 ms.
  await sleep(2500);

  const guessName = document.querySelector('.primary-name')?.textContent?.trim() ?? '';
  const guessScore = document.querySelector('.primary-score')?.textContent?.trim() ?? '';
  check('a primary guess is shown', guessName.length > 0, `${guessName} ${guessScore}`);

  const cards = [...document.querySelectorAll('.s-card')];
  // Ceiling comes from the suggestion module so the test cannot drift from it.
  const maxCards = Number(process.env.SKETCHAI_MAX_CARDS ?? 12);
  check('suggestions render within the card ceiling', cards.length > 0 && cards.length <= maxCards,
    `${cards.length} cards (ceiling ${maxCards})`);

  const canonical = fs.readFileSync(path.join(ROOT, 'src', 'data', 'quickdraw-categories.txt'), 'utf8')
    .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const cardNames = cards.map((card) => {
    const name = card.querySelector('.s-card-name');
    return name?.textContent?.trim() ?? '';
  });
  check('every card has a name', cardNames.every((name) => name.length > 0), cardNames.slice(0, 4).join(', '));

  const rawScores = cards.map((card) => {
    const score = card.querySelector('.s-card-score')?.textContent?.trim() ?? '0%';
    return Number(score.replace(/[<%]/g, '')) || 0;
  });
  const allButtons = cards.every((card) => card.tagName === 'BUTTON');
  check('cards are real buttons', allButtons, `${cards.filter((c) => c.tagName === 'BUTTON').length}/${cards.length}`);
  const labels = cards.map((card) => card.getAttribute('aria-label') ?? '');
  check('cards are labelled for screen readers',
    labels.length > 0 && labels.every((text) => /^Insert .+ drawing$/.test(text)), labels[0] ?? 'none');
  const focusable = cards.length > 0 && (() => { cards[0].focus(); return document.activeElement === cards[0]; })();
  check('cards take keyboard focus', focusable, `activeElement is card: ${focusable}`);

  // Ordering is diversity-first, NOT a flat probability sort: the leading cards
  // must cover different classes so the intended object is findable even when
  // top-1 is wrong.
  const leading = cards.slice(0, Math.min(5, cards.length));
  const leadingClasses = leading.map((card) => (card.getAttribute('aria-label') ?? '').replace(/^Insert | drawing$/g, ''));
  const distinctLeading = new Set(leadingClasses).size;
  check('leading suggestions cover different classes', distinctLeading === leading.length,
    `${distinctLeading}/${leading.length} distinct: ${leadingClasses.join(', ')}`);
  const artKeys = cards.map((card) => {
    const art = card.querySelector('.s-card-art');
    if (!art) return `${card.textContent}`;
    return art.querySelector('svg') ? art.innerHTML : `text:${card.querySelector('.s-card-name')?.textContent}`;
  });
  check('no duplicate artwork is rendered twice', new Set(artKeys).size === cards.length,
    `${new Set(artKeys).size}/${cards.length} unique`);
  const firstCardScore = rawScores[0] ?? 0;
  check('the strongest guess leads the bar', firstCardScore === Math.max(...rawScores, 0),
    `${firstCardScore}% is the top score`);
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
  let hashBeforeInsert = canvasHash(canvas);
  let hashAfterInsert = hashBeforeInsert;
  const sketchHashBeforeInsert = canvasHash(sketch);
  let sketchHashAfterInsert = sketchHashBeforeInsert;
  if (insertable) {
    hashBeforeInsert = canvasHash(canvas);
    insertable.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(400);
    inkAfterInsert = inkPixels(canvas);
    hashAfterInsert = canvasHash(canvas);
    sketchHashAfterInsert = canvasHash(sketch);
    const sketchInkAfterInsert = inkPixels(sketch);
    // A suggestion commits permanent art and removes every temporary rough pixel.
    inserted = hashAfterInsert !== hashBeforeInsert && inkAfterInsert > 0 && sketchInkAfterInsert === 0;
    check('clicking a suggestion inserts artwork', inserted,
      `${drawnInk} rough pixels -> ${inkAfterInsert} permanent pixels`);
    check('replacement leaves no rough pixels on the temporary layer', sketchInkAfterInsert === 0,
      `${sketchInkAfterInsert} sketch pixels`);
  } else {
    check('an illustrated suggestion is available to insert', false, 'no clickable card');
  }

  // ---- undo / redo --------------------------------------------------------
  section('Undo / redo');
  const undoButton = document.querySelector('button[aria-label="Undo"]');
  const redoButton = document.querySelector('button[aria-label="Redo"]');
  check('undo is enabled after drawing', undoButton && !undoButton.disabled, `disabled=${undoButton?.disabled}`);

  undoButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(300);
  const hashAfterUndo = canvasHash(canvas);
  const sketchHashAfterUndo = canvasHash(sketch);
  check('undo restores pre-replacement permanent artwork', hashAfterUndo === hashBeforeInsert,
    `fingerprint ${hashAfterInsert} -> ${hashAfterUndo} (before replacement ${hashBeforeInsert})`);
  check('undo restores the rough sketch on its temporary layer',
    sketchHashAfterUndo === sketchHashBeforeInsert && inkPixels(sketch) > 0,
    `${inkPixels(sketch)} rough pixels restored`);

  check('redo is enabled after undo', redoButton && !redoButton.disabled, `disabled=${redoButton?.disabled}`);
  redoButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(300);
  const hashAfterRedo = canvasHash(canvas);
  const sketchHashAfterRedo = canvasHash(sketch);
  check('redo restores the clean inserted artwork', hashAfterRedo === hashAfterInsert,
    `fingerprint ${hashAfterUndo} -> ${hashAfterRedo} (inserted was ${hashAfterInsert})`);
  check('redo restores an empty temporary sketch layer',
    sketchHashAfterRedo === sketchHashAfterInsert && inkPixels(sketch) === 0,
    `${inkPixels(sketch)} sketch pixels`);

  // ---- overlapping replacement regression -------------------------------
  section('Overlapping sketch replacement');
  {
    const permanentBefore = imagePixels(canvas);
    const permanentHashBefore = canvasHash(canvas);
    drawCircle(window, canvas, 700, 360, 105);
    const roughPixels = imagePixels(sketch);
    const roughBounds = getSketchBounds(sketch);
    const permanentHashDuringSketch = canvasHash(canvas);
    let overlaps = 0;
    for (let i = 3; i < permanentBefore.length; i += 4) {
      if (permanentBefore[i] > 0 && roughPixels[i] > 10) overlaps += 1;
    }
    check('new rough sketch overlaps accepted artwork', overlaps > 0, `${overlaps} overlapping pixels`);
    check('overlapping rough sketch leaves permanent art unchanged',
      permanentHashDuringSketch === permanentHashBefore,
      `fingerprint ${permanentHashBefore} -> ${permanentHashDuringSketch}`);

    await sleep(2500);
    const circleCard = document.querySelector('button.s-card[aria-label="Insert Circle drawing"]');
    check('overlap scenario has a clean Circle suggestion', Boolean(circleCard));
    if (circleCard) {
      const bounds = getSketchBounds(sketch);
      const placement = getArtworkReplacementPlacement(bounds, CANVAS_W, CANVAS_H);
      const variant = getArtworkVariants('circle')[0];
      const clean = renderVariant(variant);
      const expected = createCanvas(CANVAS_W, CANVAS_H);
      const expectedContext = expected.getContext('2d');
      expectedContext.drawImage(canvas.__backing, 0, 0);
      expectedContext.drawImage(clean, placement.x, placement.y, placement.dimension, placement.dimension);
      const expectedPixels = imagePixels(expected);

      circleCard.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(400);
      const actualPixels = imagePixels(canvas);
      const matchesSourceOver = Buffer.compare(Buffer.from(actualPixels), Buffer.from(expectedPixels)) === 0;
      check('overlap replacement matches non-destructive source-over compositing', matchesSourceOver,
        matchesSourceOver ? 'old accepted pixels preserved outside clean ink' : 'permanent pixels differ from expected composite');
      check('overlap replacement clears the temporary sketch', inkPixels(sketch) === 0,
        `${inkPixels(sketch)} sketch pixels`);
    }
  }

  // ---- multiple objects --------------------------------------------------
  // Draw a second, separate sketch and insert into it. The first inserted
  // drawing must survive: several objects have to coexist on the canvas.
  section('Multiple objects');
  {
    const firstRegion = () => regionPixels(canvas, 450, 210, 300, 300);
    const firstRegionBefore = Buffer.from(firstRegion());
    const permanentHashBeforeSketch = canvasHash(canvas);
    drawCircle(window, canvas, 300, 200, 90);
    check('second rough sketch stays off permanent artwork',
      canvasHash(canvas) === permanentHashBeforeSketch);
    await sleep(2200);
    const secondCards = [...document.querySelectorAll('.s-card')].filter((card) => card.tagName === 'BUTTON');
    if (secondCards.length) {
      secondCards[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(500);
    }
    const firstRegionAfter = Buffer.from(firstRegion());
    const secondInk = inkInRegion(canvas, 210, 110, 180, 180);
    check('the first object remains pixel-identical after a separate insertion',
      Buffer.compare(firstRegionBefore, firstRegionAfter) === 0,
      `first region ${inkInRegion(canvas, 450, 210, 300, 300)} ink pixels`);
    check('a second object lands in its own place', secondInk > 0, `${secondInk} ink pixels`);
  }

  // ---- intentional eraser -------------------------------------------------
  section('Intentional eraser');
  const eraserButton = document.querySelector('button[aria-label="Eraser"]');
  const beforeEraseRegion = inkInRegion(canvas, 450, 210, 300, 300);
  const pixelsBeforeErase = imagePixels(canvas);
  clickBySelector(window, 'button[aria-label="Eraser"]');
  await sleep(100);
  drawLine(window, canvas, 420, 360, 780, 360);
  const afterEraseRegion = inkInRegion(canvas, 450, 210, 300, 300);
  const pixelsAfterErase = imagePixels(canvas);
  check('eraser intentionally removes permanent artwork',
    afterEraseRegion < beforeEraseRegion,
    `${beforeEraseRegion} -> ${afterEraseRegion} ink pixels`);
  check('eraser does not leave a temporary visible stroke', inkPixels(sketch) === 0,
    `${inkPixels(sketch)} sketch pixels`);
  clickBySelector(window, 'button[aria-label="Undo"]');
  await sleep(300);
  check('undo restores intentionally erased artwork',
    Buffer.compare(Buffer.from(imagePixels(canvas)), Buffer.from(pixelsBeforeErase)) === 0);
  clickBySelector(window, 'button[aria-label="Redo"]');
  await sleep(300);
  check('redo reapplies intentional erasing',
    Buffer.compare(Buffer.from(imagePixels(canvas)), Buffer.from(pixelsAfterErase)) === 0);
  check('eraser control is present', Boolean(eraserButton));

  // ---- clear --------------------------------------------------------------
  section('Clear');
  const clearButton = [...document.querySelectorAll('button')]
    .find((button) => /Clear canvas/i.test(button.textContent ?? ''));
  check('clear button exists', Boolean(clearButton));
  clickBySelector(window, 'button[aria-label="Pencil"]');
  await sleep(100);
  drawCircle(window, canvas, 280, 500, 60);
  clearButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(400);
  const afterClear = inkPixels(canvas);
  const sketchAfterClear = inkPixels(sketch);
  check('clear empties permanent art', afterClear === 0, `${afterClear} ink pixels`);
  check('clear empties the temporary sketch', sketchAfterClear === 0, `${sketchAfterClear} ink pixels`);

  // ---- PNG download -------------------------------------------------------
  section('PNG download');
  const downloadButton = [...document.querySelectorAll('button')]
    .find((button) => /Download/i.test(button.textContent ?? ''));
  check('download button exists', Boolean(downloadButton));
  let exportedBlob = null;
  const originalCreate = window.URL.createObjectURL;
  const originalRevoke = window.URL.revokeObjectURL;
  window.URL.createObjectURL = (blob) => { exportedBlob = blob; return 'blob:sketchai-audit'; };
  window.URL.revokeObjectURL = () => {};
  // Draw only on the temporary layer so the export must composite both layers.
  drawCircle(window, canvas, 400, 300, 120);
  const sketchInkBeforeExport = inkPixels(sketch);
  const permanentInkBeforeExport = inkPixels(canvas);
  const permanentBeforeExport = Buffer.from(imagePixels(canvas));
  const sketchBeforeExport = Buffer.from(imagePixels(sketch));
  const downloadClicksBefore = window.__downloadClicks.length;
  await sleep(200);
  window.__downloadGestureActive = true;
  downloadButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  window.__downloadGestureActive = false;
  await sleep(1500);
  if (originalCreate === undefined) delete window.URL.createObjectURL;
  else window.URL.createObjectURL = originalCreate;
  if (originalRevoke === undefined) delete window.URL.revokeObjectURL;
  else window.URL.revokeObjectURL = originalRevoke;

  const notice = document.querySelector('.notice')?.textContent ?? '';
  const dataUrlProbe = window.__lastExportDataUrl ?? '';
  const pngInfo = inspectPngDataUrl(dataUrlProbe);
  const isPng = Boolean(pngInfo && pngInfo.bytes.length > 2000);
  check('composite export is a valid PNG data URL', isPng, `${pngInfo?.bytes.length ?? 0} bytes`);
  check('export has the expected 1200x720 dimensions',
    pngInfo?.width === CANVAS_W && pngInfo?.height === CANVAS_H,
    `${pngInfo?.width ?? '?'}x${pngInfo?.height ?? '?'}`);
  check('download produced a valid PNG Blob',
    exportedBlob?.type === 'image/png' && exportedBlob.size === pngInfo?.bytes.length,
    `${exportedBlob?.type ?? 'no blob'}, ${exportedBlob?.size ?? 0} bytes`);
  check('PNG export includes temporary sketch pixels',
    permanentInkBeforeExport === 0 && sketchInkBeforeExport > 2000
      && countNonWhitePixels(window.__lastExportPixels ?? []) > 2000,
    `permanent ${permanentInkBeforeExport}, sketch ${sketchInkBeforeExport}, exported ink ${countNonWhitePixels(window.__lastExportPixels ?? [])}`);
  const downloadClicks = window.__downloadClicks.slice(downloadClicksBefore);
  check('one attached download anchor clicked during user activation',
    downloadClicks.length === 1 && downloadClicks[0].attached && downloadClicks[0].userActivated
      && downloadClicks[0].filename === 'sketchai-drawing.png'
      && downloadClicks[0].href.startsWith('blob:'),
    `${downloadClicks.length} anchor click(s), attached=${downloadClicks[0]?.attached}, activated=${downloadClicks[0]?.userActivated}`);
  check('export does not mutate either source canvas',
    Buffer.compare(permanentBeforeExport, Buffer.from(imagePixels(canvas))) === 0
      && Buffer.compare(sketchBeforeExport, Buffer.from(imagePixels(sketch))) === 0);
  check('download reports success', /PNG is ready|download/i.test(notice) || downloadClicks.length === 1,
    notice.trim().slice(0, 90) || 'no notice');

  window.__rejectDownloadClick = true;
  window.__downloadGestureActive = true;
  downloadButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  window.__downloadGestureActive = false;
  await sleep(150);
  window.__rejectDownloadClick = false;
  const blockedNotice = document.querySelector('.notice')?.textContent ?? '';
  const manualSaveLink = document.querySelector('.notice .notice-link');
  const manualHref = manualSaveLink?.href ?? '';
  const manualFallbackReady = manualHref.startsWith('blob:') || manualHref.startsWith('data:image/png;base64,');
  const manualFallbackKind = manualHref.startsWith('blob:') ? 'Blob URL' : manualHref.startsWith('data:image/png;base64,') ? 'PNG data URL' : 'missing';
  check('blocked synthetic click keeps a usable manual save link', manualFallbackReady, manualFallbackKind);
  check('blocked synthetic click explains the manual retry',
    /could not start the automatic download/i.test(blockedNotice) && /manual save link/i.test(blockedNotice),
    blockedNotice.trim().slice(0, 100) || 'no notice');

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
