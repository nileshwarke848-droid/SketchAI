// Builds src/data/imported-art.js from the open-source icon libraries in
// /home/user/iconsrc.
//
// Run: node scripts/build-oss-art.mjs
//
// For every Quick, Draw! category it finds a source drawing, normalises it into
// SketchAI's visual system and writes it out in the same {w, h, b} shape as
// src/data/line-art.js, using the literal token STROKE for the pen colour.
//
// Normalisation:
//   * every drawing is fitted to the ink it actually puts on the page, then
//     centred and scaled into one 24x24 grid with a 1.5 unit margin, so a small
//     icon and a large one sit at the same optical size
//   * stroke libraries keep their outlines; solid silhouettes are drawn as
//     outlines so nothing is "heavily filled"
//   * stroke width is compensated for the fit scale, so every drawing ends up
//     with the same apparent line weight
import fs from 'node:fs';
import path from 'node:path';
import { SOURCES, MAP, sourcePath } from './oss-art-sources.mjs';
import { Resvg } from '@resvg/resvg-js';

const ROOT = process.cwd();
const GRID = 24;
const MARGIN = 1.5;
const STROKE_W = Number(process.env.OSS_STROKE_W ?? 1.3);
// Raster size used for every ink measurement, so the builder's choice and
// scripts/qa-oss-art.mjs agree.
const MEASURE_PX = 96;

// ---------------------------------------------------------------------------
// Source loading
// ---------------------------------------------------------------------------

function listSvg(libId) {
  const { dir, recursive } = SOURCES[libId];
  const base = sourcePath(libId);
  const out = new Map();
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) { if (recursive) walk(full); }
      else if (entry.name.endsWith('.svg')) out.set(entry.name.slice(0, -4), full);
    }
  };
  walk(base);
  return out;
}

const svgIndex = {};
for (const id of Object.keys(SOURCES)) {
  if (!SOURCES[id].jsModule && !SOURCES[id].jsonSet) svgIndex[id] = listSvg(id);
}

// Font Awesome ships one ES module per icon containing the path data.
const faIndex = new Map();
{
  const dir = sourcePath('fontawesome');
  for (const file of fs.readdirSync(dir)) {
    const m = /^fa([A-Z].*)\.js$/.exec(file);
    if (!m) continue;
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    const d = /var svgPathData = '([^']+)'/.exec(src)?.[1];
    if (!d) continue;
    const key = m[1].replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    faIndex.set(key, {
      w: Number(/var width = (\d+)/.exec(src)?.[1] ?? 512),
      h: Number(/var height = (\d+)/.exec(src)?.[2] ?? 512),
      els: [{ tag: 'path', svg: `<path d="${d}"/>`, fill: null, stroke: null }],
    });
  }
}

const GEOM = /<(path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*)\/?>/g;
const KEEP = {
  path: ['d'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  rect: ['x', 'y', 'width', 'height', 'rx'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points'],
};

function attr(tagAttrs, name) {
  const m = new RegExp(`${name}="([^"]*)"`).exec(tagAttrs);
  return m ? m[1] : null;
}

/** Pulls the drawable elements out of a source SVG. */
function elementsFromSvg(src) {
  const els = [];
  for (const m of src.matchAll(GEOM)) {
    const [full, tag, tagAttrs] = m;
    const d = attr(tagAttrs, 'd');
    if (tag === 'path' && !d) continue;
    const fill = attr(tagAttrs, 'fill');
    const stroke = attr(tagAttrs, 'stroke');
    const parts = [`<${tag}`];
    for (const k of KEEP[tag]) {
      const v = attr(tagAttrs, k);
      if (v != null) parts.push(`${k}="${v}"`);
    }
    parts.push('/>');
    els.push({ tag, svg: parts.join(' '), fill, stroke });
  }
  return els;
}

// IconifyJSON sets (Game Icons) keep every icon in one icons.json.
const jsonIndex = {};
for (const id of Object.keys(SOURCES)) {
  if (!SOURCES[id].jsonSet) continue;
  const data = JSON.parse(fs.readFileSync(path.join(sourcePath(id), 'icons.json'), 'utf8'));
  const index = new Map();
  for (const [name, icon] of Object.entries(data.icons)) {
    index.set(name, {
      w: data.width ?? icon.width ?? 512,
      h: data.height ?? icon.height ?? 512,
      els: elementsFromSvg(icon.body),
    });
  }
  jsonIndex[id] = index;
}

function loadSource(libId, key) {
  if (libId === 'fontawesome') return faIndex.get(key) ?? null;
  if (SOURCES[libId].jsonSet) return jsonIndex[libId].get(key) ?? null;
  const file = svgIndex[libId]?.get(key);
  if (!file) return null;
  const src = fs.readFileSync(file, 'utf8');
  const vb = (/viewBox="([^"]+)"/.exec(src)?.[1] ?? '0 0 24 24').split(/[\s,]+/).map(Number);
  return { w: vb[2], h: vb[3], els: elementsFromSvg(src) };
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/** Rewrites source elements into one pen style. Removes invisible helpers. */
function normaliseElements(els, mode) {
  const out = [];
  for (const el of els) {
    const isInvisible = el.fill === 'none' && el.stroke === 'none';
    if (isInvisible) continue; // Tabler/Lucide spacer rects
    if (mode === 'stroke' && el.fill && el.fill !== 'none' && el.fill !== 'transparent') {
      // A solid dot (an eye, a pupil) inside a line drawing.
      out.push(el.svg.replace(/\/$/, ' fill="STROKE" stroke="none"/>'));
    } else {
      out.push(el.svg);
    }
  }
  return out.join('');
}

function wrapSvg(body, vb, strokeWidth) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb.w} ${vb.h}" `
    + `width="${vb.w * 10}" height="${vb.h * 10}">`
    + `<g fill="none" stroke="#000" stroke-width="${strokeWidth}" `
    + `stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`
  );
}

/** Fraction of the raster that has any ink on it, 0..1. */
function inkFraction(body, vb, strokeWidth) {
  const svg = wrapSvg(body, vb, strokeWidth ?? STROKE_W);
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: MEASURE_PX } }).render();
  const { pixels } = png;
  let ink = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 24) ink++;
  return ink / (png.width * png.height);
}

/**
 * A solid silhouette drawn filled rather than outlined. Used when outlining
 * would turn internal cutouts into an unreadable blob.
 */
function fitToGridFilled(body, vb, extraBody = '') {
  const all = body + extraBody;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb.w} ${vb.h}">`
    + `<g fill="#000" stroke="none">${all}</g></svg>`;
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: MEASURE_PX } }).render();
  const { pixels, width: W, height: H } = png;
  let minX = W, minY = H, maxX = -1, maxY = -1, ink = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (pixels[(y * W + x) * 4 + 3] > 24) {
        ink++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const box = {
    x: (minX * vb.w) / W, y: (minY * vb.h) / H,
    w: ((maxX - minX + 1) * vb.w) / W, h: ((maxY - minY + 1) * vb.h) / H,
  };
  const target = GRID - MARGIN * 2;
  const scale = Math.min(target / box.w, target / box.h);
  const tx = MARGIN + (target - box.w * scale) / 2 - box.x * scale;
  const ty = MARGIN + (target - box.h * scale) / 2 - box.y * scale;
  return {
    body:
      `<g fill="STROKE" stroke="none">`
      + `<g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale.toFixed(4)})">`
      + all + '</g></g>',
    scale,
    ink: ink / (W * H),
  };
}

/** Real ink bounds of `body` in viewBox units, measured by rasterising it. */
function inkBox(body, vb) {
  const svg = wrapSvg(body, vb, STROKE_W);
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 240 } }).render();
  const { pixels, width: W, height: H } = png;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (pixels[(y * W + x) * 4 + 3] > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const sx = vb.w / W;
  const sy = vb.h / H;
  return { x: minX * sx, y: minY * sy, w: (maxX - minX + 1) * sx, h: (maxY - minY + 1) * sy };
}

/**
 * Fits `body` into the 24x24 grid.
 * @returns {{body: string, scale: number}|null}
 */
function fitToGrid(body, vb, extraBody = '') {
  const all = body + extraBody;
  const box = inkBox(all, vb);
  if (!box) return null;
  const target = GRID - MARGIN * 2;
  const scale = Math.min(target / box.w, target / box.h);
  const tx = MARGIN + (target - box.w * scale) / 2 - box.x * scale;
  const ty = MARGIN + (target - box.h * scale) / 2 - box.y * scale;
  const fitted =
    `<g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale.toFixed(4)})">`
    + all
    + '</g>';
  return { body: fitted, scale };
}

/** Ink fraction of a finished entry, measured exactly as the QA script does. */
function finalInk(body24) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}">`
    + `${body24.replaceAll('STROKE', '#000')}</svg>`;
  const { pixels, width: W, height: H } =
    new Resvg(svg, { fitTo: { mode: 'width', value: MEASURE_PX } }).render();
  let n = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 24) n++;
  return n / (W * H);
}

const PEN = (w) =>
  `<g fill="none" stroke="STROKE" stroke-width="${w.toFixed(3)}" `
  + 'stroke-linecap="round" stroke-linejoin="round">';

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const labels = fs
  .readFileSync(path.join(ROOT, 'src/data/quickdraw-categories.txt'), 'utf8')
  .split(/\r?\n/)
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const STROKE_LIBS = ['tabler', 'lucide', 'iconoir'];
const FILL_LIBS = ['mdi', 'fontawesome'];

/** Auto candidate: exact name match, stroke libraries first. */
function autoCandidate(label) {
  const slug = label.replace(/[^a-z0-9]+/g, '-');
  for (const lib of STROKE_LIBS) if (svgIndex[lib]?.has(slug)) return [lib, slug];
  for (const lib of FILL_LIBS) {
    if (lib === 'fontawesome') { if (faIndex.has(slug)) return [lib, slug]; }
    else if (svgIndex[lib]?.has(slug)) return [lib, slug];
  }
  // Game Icons is the last resort: game-asset styling, used only when nothing
  // cleaner ships the object.
  if (jsonIndex.gameicons?.has(slug)) return ['gameicons', slug];
  return null;
}

const entries = [];
const credits = {};
const problems = [];

for (const label of labels) {
  const spec = MAP[label] ?? autoCandidate(label);
  if (!spec) continue;
  const [libId, key, modeOverride, extraBody = ''] = spec;
  const meta = SOURCES[libId];
  if (!meta) { problems.push(`${label}: unknown library ${libId}`); continue; }

  const src = loadSource(libId, key);
  if (!src?.els?.length) { problems.push(`${label}: ${libId}/${key} not found`); continue; }

  const mode = modeOverride ?? meta.mode;
  const vb = { w: src.w, h: src.h };
  const body = normaliseElements(src.els, mode);
  if (!body) { problems.push(`${label}: ${libId}/${key} has no drawable geometry`); continue; }

  // Solid silhouettes: draw them as outlines when that reads as line art, but
  // fall back to the original filled glyph when the outline turns the internal
  // cutouts into an unreadable blob. Choose by measuring the ink.
  let chosen = mode;
  let fitted = fitToGrid(body, vb, extraBody);
  if (!fitted) { problems.push(`${label}: ${libId}/${key} renders no ink`); continue; }

  // Compensate the fit scale so every drawing keeps one apparent line weight.
  const width = STROKE_W / fitted.scale;

  if (mode === 'outline') {
    // Measure the FINISHED drawing: outlining a detailed silhouette cuts every
    // internal cutout into an extra contour and turns it into a blob. When that
    // happens fall back to the plain silhouette, and when even that is a solid
    // block, drop the category rather than ship something unreadable.
    const outlined = PEN(width) + fitted.body + '</g>';
    if (finalInk(outlined) > 0.36) {
      const filled = fitToGridFilled(body, vb, extraBody);
      const filledInk = filled ? finalInk(filled.body) : 1;
      if (filledInk > 0.62) {
        problems.push(`${label}: ${libId}/${key} too dense to render cleanly (skipped)`);
        continue;
      }
      chosen = 'filled';
      fitted = filled;
    }
  }

  entries.push({
    label,
    lib: libId,
    key,
    mode: chosen,
    scale: fitted.scale,
    svg: chosen === 'filled' ? fitted.body : PEN(width) + fitted.body + '</g>',
  });

  (credits[libId] ??= { ...meta, icons: [] }).icons.push({ label, icon: key, mode: chosen });
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const banner = `// Clean line drawings imported from openly licensed icon libraries —
// the primary artwork SketchAI suggests.
//
// GENERATED FILE — do not edit by hand.
// Rebuild with: node scripts/build-oss-art.mjs
//
// SketchAI is "rough sketch -> cleaner drawing of the same object", so these
// are whole objects drawn as outlines: one 24x24 grid, one stroke weight, no
// heavy fills. The literal token STROKE is replaced with currentColor (card
// preview) or the brush colour (inserted artwork) at render time.
//
// Sources (see scripts/oss-art-sources.mjs for the full registry):
`;
const creditLines = Object.entries(credits)
  .map(([id, c]) => ` *   ${c.name} ${c.version} — ${c.license} — ${c.url} (${c.icons.length})`)
  .join('\n');

const body = entries
  .map((e) => `  ${JSON.stringify(e.label)}: {\n    w: 24,\n    h: 24,\n    b: ${JSON.stringify(e.svg)},\n  },`)
  .join('\n');

const out = `${banner}/*\n${creditLines}
 */
//
// Keyed by the canonical Quick, Draw! label (lower case).

export const IMPORTED_ART = {
${body}
};

export const IMPORTED_ART_LABELS = Object.keys(IMPORTED_ART);
export const IMPORTED_ART_COUNT = IMPORTED_ART_LABELS.length;
`;

fs.writeFileSync(path.join(ROOT, 'src/data/imported-art.js'), out);

const registry = {};
for (const [id, c] of Object.entries(credits)) {
  registry[id] = {
    name: c.name,
    version: c.version,
    license: c.license,
    copyright: c.copyright,
    url: c.url,
    categories: c.icons.map(({ label, icon, mode }) => ({ label, icon, mode })),
  };
}
fs.writeFileSync(
  path.join(ROOT, 'scripts/oss-art-credits.json'),
  `${JSON.stringify(registry, null, 2)}\n`,
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log(`imported drawings: ${entries.length} / ${labels.length} categories`);
console.log('');
for (const [id, c] of Object.entries(credits).sort((a, b) => b[1].icons.length - a[1].icons.length)) {
  console.log(`  ${c.name.padEnd(24)} ${c.license.padEnd(12)} ${String(c.icons.length).padStart(4)} categories`);
}
console.log('');
const byMode = entries.reduce((acc, e) => ((acc[e.mode] = (acc[e.mode] ?? 0) + 1), acc), {});
console.log(`  kept as outlines: ${byMode.stroke ?? 0}   converted silhouettes: ${byMode.outline ?? 0}`);
if (problems.length) {
  console.log(`\nproblems (${problems.length}):`);
  for (const p of problems) console.log(`  - ${p}`);
}
const missing = labels.filter((l) => !entries.some((e) => e.label === l));
console.log(`\nno imported drawing: ${missing.length}`);
console.log(`  ${missing.join(', ')}`);
