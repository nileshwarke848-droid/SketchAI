#!/usr/bin/env node
// Drives the hand-made doodles in training/doodles.json through the app's
// currently preferred model (the supplied 333-class model) and reports ranks.
//
//   node scripts/demo-test.mjs                  # default 345-class model
//   node scripts/demo-test.mjs --experimental-333 # explicitly test supplied model
//   node scripts/demo-test.mjs --force-fallback # force the original 100-class fallback
//
// This answers the question that matters for a suggestion bar — "could the user
// find the intended object among the suggestions?" — rather than "was top-1
// right?". For every doodle it also checks that buildSuggestions() really
// produces a card for the intended class when that class is predicted at all.
//
// No browser is involved: @napi-rs/canvas rasterises the strokes and tfjs runs
// on the CPU backend, but the model, preprocessing and suggestion logic are the
// exact modules the app ships.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { loadModel, predict } from '../src/ai/model.js';
import { buildSuggestions } from '../src/lib/suggestions.js';
import { getArtworkVariants } from '../src/data/artwork.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const FORCE_FALLBACK = process.argv.includes('--force-fallback');
const EXPERIMENTAL_333 = process.argv.includes('--experimental-333');

const CANVAS_W = 1200;
const CANVAS_H = 720;

// --- filesystem fetch -------------------------------------------------------
globalThis.fetch = async (input) => {
  const raw = typeof input === 'string' ? input : String(input?.url ?? input);
  const clean = raw.replace(/^\.\//, '').replace(/^https?:\/\/[^/]+\//, '').split('?')[0];
  if (FORCE_FALLBACK && (clean.startsWith('model-333/') || clean.startsWith('model-345/'))) {
    return { ok: false, status: 404, statusText: 'Not Found', headers: { get: () => null }, text: async () => '', json: async () => { throw new Error('404'); }, arrayBuffer: async () => new ArrayBuffer(0) };
  }
  const file = path.join(PUBLIC_DIR, clean);
  if (!fs.existsSync(file)) {
    return { ok: false, status: 404, statusText: 'Not Found', headers: { get: () => null }, text: async () => '', json: async () => { throw new Error('404'); }, arrayBuffer: async () => new ArrayBuffer(0) };
  }
  const body = fs.readFileSync(file);
  const contentType = clean.endsWith('.json') ? 'application/json' : 'application/octet-stream';
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: (key) => (key.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => body.toString('utf8'),
    json: async () => JSON.parse(body.toString('utf8')),
    arrayBuffer: async () => new Uint8Array(body).buffer,
  };
};

/** Rasterises normalised polylines the same way the Python doodle test does. */
function renderDoodle(strokes, { span = 300, lineWidth = 7 } = {}) {
  const canvas = createCanvas(CANVAS_W, CANVAS_H);
  const ctx = canvas.getContext('2d');
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    ctx.beginPath();
    stroke.forEach(([x, y], index) => {
      const px = cx + x * span;
      const py = cy + y * span;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }
  return canvas;
}

const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'training', 'doodles.json'), 'utf8'));
const span = Number(payload.span ?? 300);
const lineWidth = Number(payload.lineWidth ?? 7);

const loaded = await loadModel({ allowUnverified333: EXPERIMENTAL_333 && !FORCE_FALLBACK });
const { model, labels, profile, tier } = loaded;
console.log(`Demo test · ${tier} model · ${labels.length} classes · profile ${profile}\n`);

const rows = [];
let hits = { 1: 0, 3: 0, 5: 0, 10: 0 };
let onBar = 0;

for (const [intended, strokes] of Object.entries(payload.doodles)) {
  const canvas = renderDoodle(strokes, { span, lineWidth });
  const result = predict(model, labels, canvas, { profile });
  if (result.status !== 'ok') {
    rows.push({ intended, rank: null, top1: `(${result.status})`, score: 0, onBar: false });
    continue;
  }
  const order = result.predictions;
  const rank = order.findIndex((p) => p.label === intended) + 1; // 0 = absent
  const cards = buildSuggestions(order);
  const cardIndex = cards.findIndex((card) => card.label === intended);
  const hasArt = getArtworkVariants(intended).length > 0;

  if (rank > 0) {
    if (rank <= 1) hits[1] += 1;
    if (rank <= 3) hits[3] += 1;
    if (rank <= 5) hits[5] += 1;
    if (rank <= 10) hits[10] += 1;
    if (cardIndex >= 0) onBar += 1;
  }

  rows.push({
    intended,
    rank: rank || null,
    top1: order[0]?.label ?? '—',
    score: rank ? order[rank - 1].score : 0,
    cardIndex: cardIndex >= 0 ? cardIndex + 1 : null,
    hasArt,
    variants: getArtworkVariants(intended).length,
  });
}

const pad = (value, width) => String(value).padEnd(width);
console.log(`${pad('doodle', 12)} ${pad('rank', 6)} ${pad('top-1 guess', 20)} ${pad('conf', 7)} ${pad('card#', 7)} art`);
console.log('-'.repeat(72));
for (const row of rows) {
  console.log(
    `${pad(row.intended, 12)} ${pad(row.rank ?? '—', 6)} ${pad(row.top1, 20)} `
    + `${pad(row.rank ? `${(row.score * 100).toFixed(1)}%` : '—', 7)} `
    + `${pad(row.cardIndex ?? '—', 7)} ${row.variants} option${row.variants === 1 ? '' : 's'}`,
  );
}

const total = rows.length;
console.log('-'.repeat(72));
console.log(`intended class inside top-1 : ${hits[1]}/${total}`);
console.log(`intended class inside top-3 : ${hits[3]}/${total}`);
console.log(`intended class inside top-5 : ${hits[5]}/${total}`);
console.log(`intended class inside top-10: ${hits[10]}/${total}`);
console.log(`predicted AND shown on bar  : ${onBar}/${hits[10]} (of the ones inside top-10)`);

model.dispose();
