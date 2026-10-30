#!/usr/bin/env node
// Programmatic QA for the imported line art.
//
// I cannot eyeball 285 drawings, so measure them instead. Every drawing is
// rasterised and checked for:
//   * ink coverage  - a drawing that is nearly blank, or a solid blob, is broken
//   * fill of grid  - it should use the 24x24 canvas, not float tiny in it
//   * centring      - the fit should have centred it
//   * geometry      - no NaN/Infinity, no unclosed tokens left over
//
//   node scripts/qa-oss-art.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { IMPORTED_ART } from '../src/data/imported-art.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CREDITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/oss-art-credits.json'), 'utf8'));
// Which rendering was chosen per label: 'stroke' | 'outline' | 'filled'.
const MODE_BY_LABEL = {};
for (const c of Object.values(CREDITS)) {
  for (const e of c.categories) MODE_BY_LABEL[e.label] = e.mode;
}

const R = 96; // rasterise at 4x the 24 grid

function measure(label) {
  const art = IMPORTED_ART[label];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${art.w} ${art.h}">`
    + `${art.b.replaceAll('STROKE', '#000')}</svg>`;
  let png;
  try {
    png = new Resvg(svg, { fitTo: { mode: 'width', value: R } }).render();
  } catch (err) {
    return { label, fatal: `render failed: ${err.message}` };
  }
  const { pixels, width: W, height: H } = png;
  let ink = 0, minX = W, minY = H, maxX = -1, maxY = -1;
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
  if (maxX < 0) return { label, fatal: 'no ink at all' };
  const s = 24 / R; // pixels -> grid units
  return {
    label,
    inkPct: (ink / (W * H)) * 100,
    w: (maxX - minX + 1) * s,
    h: (maxY - minY + 1) * s,
    cx: ((minX + maxX + 1) / 2) * s,
    cy: ((minY + maxY + 1) / 2) * s,
  };
}

const rows = Object.keys(IMPORTED_ART).map(measure);
const fatal = rows.filter((r) => r.fatal);
const ok = rows.filter((r) => !r.fatal);

const checks = {
  'renders no ink': fatal.map((r) => `${r.label}: ${r.fatal}`),
  'almost blank (ink < 1.5%)': ok.filter((r) => r.inkPct < 1.5).map((r) => `${r.label} ${r.inkPct.toFixed(1)}%`),
  'outline too dense (> 42%)': ok.filter((r) => r.inkPct > 42 && MODE_BY_LABEL[r.label] !== 'filled').map((r) => `${r.label} ${r.inkPct.toFixed(1)}% (${MODE_BY_LABEL[r.label]})`),
  'filled silhouette is a block (> 88%)': ok.filter((r) => r.inkPct > 88 && MODE_BY_LABEL[r.label] === 'filled').map((r) => `${r.label} ${r.inkPct.toFixed(1)}%`),
  'too small (fits < 12u)': ok.filter((r) => Math.max(r.w, r.h) < 12).map((r) => `${r.label} ${r.w.toFixed(1)}x${r.h.toFixed(1)}`),
  'overflows grid (> 24u)': ok.filter((r) => Math.max(r.w, r.h) > 24.5).map((r) => `${r.label} ${r.w.toFixed(1)}x${r.h.toFixed(1)}`),
  'off centre (> 1u)': ok.filter((r) => Math.abs(r.cx - 12) > 1 || Math.abs(r.cy - 12) > 1)
    .map((r) => `${r.label} c=(${r.cx.toFixed(1)},${r.cy.toFixed(1)})`),
};

// Leftover template tokens would render as literal text / break colouring.
const token = Object.entries(IMPORTED_ART)
  .filter(([, art]) => /NaN|Infinity|undefined/.test(art.b))
  .map(([l]) => l);
if (token.length) checks['bad numbers in path'] = token;

console.log(`checked ${rows.length} imported drawings\n`);
let failed = 0;
for (const [name, list] of Object.entries(checks)) {
  const bad = list.length;
  failed += bad;
  console.log(`${bad === 0 ? 'PASS' : 'FAIL'}  ${name.padEnd(26)} ${bad}`);
  for (const item of list.slice(0, 24)) console.log(`         ${item}`);
  if (list.length > 24) console.log(`         ... +${list.length - 24} more`);
}

const inks = ok.map((r) => r.inkPct).sort((a, b) => a - b);
const sizes = ok.map((r) => Math.max(r.w, r.h)).sort((a, b) => a - b);
const pct = (arr, p) => arr[Math.floor((arr.length - 1) * p)];
console.log(`\nink coverage %   min ${inks[0].toFixed(1)}  p50 ${pct(inks, 0.5).toFixed(1)}  p90 ${pct(inks, 0.9).toFixed(1)}  max ${inks.at(-1).toFixed(1)}`);
console.log(`drawing size u   min ${sizes[0].toFixed(1)}  p50 ${pct(sizes, 0.5).toFixed(1)}  max ${sizes.at(-1).toFixed(1)}`);
console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} PROBLEM(S)`}`);
process.exit(failed === 0 ? 0 : 1);
