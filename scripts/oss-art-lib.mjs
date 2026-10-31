// Shared artwork loading + normalisation for every open-source artwork builder
// in this repository (scripts/build-oss-art.mjs and scripts/build-oss-art-variants.mjs).
//
// This code used to live inside build-oss-art.mjs. It moved here verbatim so the
// variant builder normalises a drawing *exactly* the way the primary builder does
// — one grid, one margin, one stroke weight, one ink measurement. Two copies of
// these rules is how artwork from different libraries stops looking alike.
//
// Source trees live in $OSS_ICON_ROOT (default /home/user/iconsrc) at the versions
// pinned in scripts/oss-art-sources.mjs. See scripts/fetch-icon-sources.mjs for
// how to rebuild that cache; `node scripts/build-oss-art.mjs` must reproduce
// src/data/imported-art.js byte for byte once it is present.
import fs from 'node:fs';
import path from 'node:path';
import { SOURCES, sourcePath } from './oss-art-sources.mjs';
import { Resvg } from '@resvg/resvg-js';

export const GRID = 24;
export const MARGIN = 1.5;
export const STROKE_W = Number(process.env.OSS_STROKE_W ?? 1.3);
// Raster size used for every ink measurement, so builders and scripts/qa-oss-art.mjs agree.
export const MEASURE_PX = 96;

// ---------------------------------------------------------------------------
// Source loading
// ---------------------------------------------------------------------------

function listSvg(libId) {
  const { recursive } = SOURCES[libId];
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
export function elementsFromSvg(src) {
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

let index = null;

/**
 * Every drawable icon in every pinned library, keyed `lib -> name -> source`.
 * Built once per process and cached, because both builders and the candidate
 * searcher want the same index.
 */
export function iconIndex() {
  if (index) return index;
  index = { svg: {}, meta: {} };
  for (const id of Object.keys(SOURCES)) {
    const meta = SOURCES[id];
    if (!meta.jsModule && !meta.jsonSet) index.svg[id] = listSvg(id);
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
  index.svg.fontawesome = faIndex;

  // IconifyJSON sets (Game Icons) keep every icon in one icons.json.
  for (const id of Object.keys(SOURCES)) {
    if (!SOURCES[id].jsonSet) continue;
    const data = JSON.parse(fs.readFileSync(path.join(sourcePath(id), 'icons.json'), 'utf8'));
    const byName = new Map();
    for (const [name, icon] of Object.entries(data.icons)) {
      byName.set(name, {
        w: data.width ?? icon.width ?? 512,
        h: data.height ?? icon.height ?? 512,
        els: elementsFromSvg(icon.body),
      });
    }
    index.svg[id] = byName;
  }
  return index;
}

/** True when the pinned source cache is present (it is not a repository file). */
export function sourcesAvailable() {
  try {
    return Object.keys(SOURCES).every((id) => fs.existsSync(sourcePath(id)));
  } catch {
    return false;
  }
}

export function loadSource(libId, key) {
  const idx = iconIndex();
  if (libId === 'fontawesome') return idx.svg.fontawesome.get(key) ?? null;
  const byName = idx.svg[libId];
  if (!byName) return null;
  const file = byName.get(key);
  if (!file) return null;
  if (typeof file === 'string') {
    const src = fs.readFileSync(file, 'utf8');
    const vb = (/viewBox="([^"]+)"/.exec(src)?.[1] ?? '0 0 24 24').split(/[\s,]+/).map(Number);
    return { w: vb[2], h: vb[3], els: elementsFromSvg(src) };
  }
  return file;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/** Rewrites source elements into one pen style. Removes invisible helpers. */
export function normaliseElements(els, mode) {
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

export function wrapSvg(body, vb, strokeWidth) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb.w} ${vb.h}" `
    + `width="${vb.w * 10}" height="${vb.h * 10}">`
    + `<g fill="none" stroke="#000" stroke-width="${strokeWidth}" `
    + `stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`
  );
}

/** Fraction of the raster that has any ink on it, 0..1. */
export function inkFraction(body, vb, strokeWidth) {
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
export function fitToGridFilled(body, vb, extraBody = '') {
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
export function inkBox(body, vb) {
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
export function fitToGrid(body, vb, extraBody = '') {
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
export function finalInk(body24) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}">`
    + `${body24.replaceAll('STROKE', '#000')}</svg>`;
  const { pixels, width: W, height: H } =
    new Resvg(svg, { fitTo: { mode: 'width', value: MEASURE_PX } }).render();
  let n = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 24) n++;
  return n / (W * H);
}

export const PEN = (w) =>
  `<g fill="none" stroke="STROKE" stroke-width="${w.toFixed(3)}" `
  + 'stroke-linecap="round" stroke-linejoin="round">';

/**
 * Turns one library icon into a finished SketchAI drawing.
 *
 * Same decision tree the primary builder uses: normalise the elements, fit and
 * centre into the shared 24x24 grid, compensate the stroke width for the fit
 * scale, and for solid libraries fall back from "outline" to "filled" when
 * outlining would blob the internal cutouts — dropping the drawing entirely when
 * even the silhouette is too dense to read.
 *
 * @param {[libId: string, key: string, modeOverride?: string, extraBody?: string]} spec
 * @returns {{svg: string, mode: string, scale: number, lib: string, key: string}|null}
 */
export function buildDrawing(spec) {
  const [libId, key, modeOverride, extraBody = ''] = spec;
  const meta = SOURCES[libId];
  if (!meta) return { error: `unknown library ${libId}` };
  const src = loadSource(libId, key);
  if (!src?.els?.length) return { error: `${libId}/${key} not found` };

  const mode = modeOverride ?? meta.mode;
  const vb = { w: src.w, h: src.h };
  const body = normaliseElements(src.els, mode);
  if (!body) return { error: `${libId}/${key} has no drawable geometry` };

  let chosen = mode;
  let fitted = fitToGrid(body, vb, extraBody);
  if (!fitted) return { error: `${libId}/${key} renders no ink` };
  const width = STROKE_W / fitted.scale;

  if (mode === 'outline') {
    const outlined = PEN(width) + fitted.body + '</g>';
    if (finalInk(outlined) > 0.36) {
      const filled = fitToGridFilled(body, vb, extraBody);
      const filledInk = filled ? finalInk(filled.body) : 1;
      if (filledInk > 0.62) return { error: `${libId}/${key} too dense to render cleanly (skipped)` };
      chosen = 'filled';
      fitted = filled;
    }
  }

  return {
    svg: chosen === 'filled' ? fitted.body : PEN(width) + fitted.body + '</g>',
    mode: chosen,
    scale: fitted.scale,
    lib: libId,
    key,
  };
}

// ---------------------------------------------------------------------------
// Visual comparison
// ---------------------------------------------------------------------------

/** Rasterises a finished {w,h,b} entry and returns ink fraction, ink box and a mask. */
export function raster(art, px = MEASURE_PX) {
  const body = (art.b ?? '').replaceAll('STROKE', '#000');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${art.w ?? GRID} ${art.h ?? GRID}">${body}</svg>`;
  const { pixels, width: W, height: H } = new Resvg(svg, { fitTo: { mode: 'width', value: px } }).render();
  let ink = 0, minX = W, minY = H, maxX = -1, maxY = -1;
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (pixels[(y * W + x) * 4 + 3] > 24) {
        ink++;
        mask[y * W + x] = 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return {
    ink: ink / (W * H),
    box: maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    mask,
    W,
    H,
  };
}

function dilate(mask, W, H, r = 1) {
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H) out[ny * W + nx] = 1;
        }
      }
    }
  }
  return out;
}

/**
 * How much two drawings look the same, 0..1.
 *
 * Intersection-over-union of the ink masks, each dilated by one pixel so a
 * hairline shift or a slightly different stroke weight does not read as a new
 * drawing. Two genuinely different depictions of one object land far below
 * NEAR_DUPLICATE; a library shipping the same silhouette twice lands far above.
 */
export function visualOverlap(a, b) {
  const A = dilate(a.mask, a.W, a.H);
  const B = dilate(b.mask ?? a.mask, b.W ?? a.W, b.H ?? a.H);
  let inter = 0, union = 0;
  for (let i = 0; i < A.length; i++) {
    if (A[i] | B[i]) union++;
    if (A[i] & B[i]) inter++;
  }
  return union ? inter / union : 0;
}

/** Threshold above which two options are the same picture, not a variant. */
export const NEAR_DUPLICATE = 0.62;

/**
 * Rejects artwork that cannot read as a clean drawing at card size.
 * Mirrors the limits scripts/qa-oss-art.mjs measures with.
 */
export function qualityIssues(art) {
  const problems = [];
  const m = raster(art);
  if (!m.box) return ['renders no ink at all'];
  if (/NaN|Infinity|undefined/.test(art.b ?? '')) problems.push('contains non-finite geometry');
  if (art.b && /STROKE/.test(art.b) === false && art.origin !== 'icon' && /stroke="STROKE"/.test(art.b) === false
    && /fill="STROKE"/.test(art.b) === false) problems.push('no STROKE token (would not take the brush colour)');
  if (m.ink > 0.42) problems.push(`too dense to read (ink ${(m.ink * 100).toFixed(0)}%)`);
  const fill = Math.max(m.box.w, m.box.h) / m.W;
  if (fill < 0.6) problems.push(`too small in its frame (fills ${(fill * 100).toFixed(0)}%)`);
  if (m.box.x <= 0 || m.box.y <= 0 || m.box.x + m.box.w >= m.W || m.box.y + m.box.h >= m.H) {
    problems.push('ink touches the frame edge');
  }
  return problems;
}
