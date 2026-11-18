#!/usr/bin/env node
// Paired, stratified held-out comparison of the project's 345-class model and
// the supplied 333-class model on the frozen 400-image manifest.
//
// Usage:
//   node scripts/evaluate-quickdraw-400.mjs \
//     --data-dir /path/to/quickdraw.js/drawings \
//     --manifest training/evaluation-400-manifest.json
//
// The script replays the app's preprocessing and prediction code for both
// models. The 333-class label map and training-data overlap remain unverified.

import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { loadModel, predict } from '../src/ai/model.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const args = process.argv.slice(2);
function arg(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}
const DATA_DIR = path.resolve(arg('--data-dir', '/tmp/sketchai-quickdraw-test-data/drawings'));
const MANIFEST_PATH = path.resolve(arg('--manifest', path.join(ROOT, 'training/evaluation-400-manifest.json')));
const OUT_PATH = arg('--out', null);
const WIDTH = 1200;
const HEIGHT = 720;
const DRAW_SIZE = 364; // Quick, Draw!'s 28px bitmap bbox (~23px) maps to ~300px on the app canvas.

if (!fs.existsSync(MANIFEST_PATH)) throw new Error(`Missing test manifest: ${MANIFEST_PATH}`);
if (!fs.existsSync(DATA_DIR)) throw new Error(`Missing drawing data: ${DATA_DIR}`);
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
if (manifest.total_drawings !== 400 || manifest.records.length !== 400) {
  throw new Error(`Expected exactly 400 records; got ${manifest.records?.length}`);
}

// TensorFlow.js model loaders use fetch; serve bundled model files from disk.
globalThis.fetch = async (input) => {
  const raw = typeof input === 'string' ? input : String(input?.url ?? input);
  const clean = raw.replace(/^\.\//, '').replace(/^https?:\/\/[^/]+\//, '').split('?')[0];
  const file = path.join(PUBLIC_DIR, clean);
  if (!fs.existsSync(file)) {
    return { ok: false, status: 404, statusText: 'Not Found', headers: { get: () => null }, text: async () => '', json: async () => { throw new Error('404'); }, arrayBuffer: async () => new ArrayBuffer(0) };
  }
  const body = fs.readFileSync(file);
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: (key) => (key.toLowerCase() === 'content-type' ? (clean.endsWith('.json') ? 'application/json' : 'application/octet-stream') : null) },
    text: async () => body.toString('utf8'),
    json: async () => JSON.parse(body.toString('utf8')),
    arrayBuffer: async () => new Uint8Array(body).buffer,
  };
};

const classRows = new Map();
for (const label of new Set(manifest.records.map((record) => record.label))) {
  const file = path.join(DATA_DIR, `${label}.ndjson.gz`);
  if (!fs.existsSync(file)) throw new Error(`Missing Quick, Draw! source file: ${file}`);
  const lines = gunzipSync(fs.readFileSync(file)).toString('utf8').trim().split('\n');
  classRows.set(label, lines.map((line) => JSON.parse(line)));
}

function makeCanvas(values) {
  if (values.length !== 28 * 28) throw new Error(`Expected 784 bitmap pixels, got ${values.length}`);
  const canvas = createCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');
  const source = createCanvas(28, 28);
  const sourceContext = source.getContext('2d');
  const image = sourceContext.createImageData(28, 28);
  for (let pixel = 0; pixel < values.length; pixel += 1) {
    const alpha = Math.round(Math.max(0, Math.min(1, values[pixel])) * 255);
    const offset = pixel * 4;
    image.data[offset] = 255;
    image.data[offset + 1] = 255;
    image.data[offset + 2] = 255;
    image.data[offset + 3] = alpha;
  }
  sourceContext.putImageData(image, 0, 0);
  context.drawImage(source, (WIDTH - DRAW_SIZE) / 2, (HEIGHT - DRAW_SIZE) / 2, DRAW_SIZE, DRAW_SIZE);
  return canvas;
}

console.log(`Loading 333-class evaluation model and verified 345-class model…`);
const supplied = await loadModel({ allowUnverified333: true });
const existing = await loadModel({ allowUnverified333: false });
if (supplied.profile !== '333' || existing.profile !== '345') {
  throw new Error(`Unexpected profiles selected: 333=${supplied.profile}, 345=${existing.profile}`);
}
console.log(`Models ready (${supplied.backend}); scoring ${manifest.total_drawings} images across ${manifest.selection.class_count} classes.`);

const counts = {
  '333': { 1: 0, 3: 0, 5: 0, 10: 0 },
  '345': { 1: 0, 3: 0, 5: 0, 10: 0 },
};
const byClass = new Map();
const cases = [];

for (let index = 0; index < manifest.records.length; index += 1) {
  const { label, source_row: sourceRow } = manifest.records[index];
  const values = classRows.get(label)[sourceRow];
  if (!values) throw new Error(`Missing row ${sourceRow} for ${label}`);
  const canvas = makeCanvas(values);
  const scores = {};
  for (const [key, loaded] of [['333', supplied], ['345', existing]]) {
    const result = predict(loaded.model, loaded.labels, canvas, { topK: 10, profile: loaded.profile });
    if (result.status !== 'ok') throw new Error(`${key} preprocessing/inference failed for ${label} row ${sourceRow}: ${result.status}`);
    const rank = result.predictions.findIndex((item) => item.label === label) + 1;
    scores[key] = {
      rank: rank || null,
      top1: result.predictions[0]?.label ?? null,
      top1Confidence: result.predictions[0]?.score ?? null,
      top10: result.predictions.map((item) => item.label),
    };
    for (const k of [1, 3, 5, 10]) if (rank > 0 && rank <= k) counts[key][k] += 1;
  }
  if (!byClass.has(label)) byClass.set(label, { '333': { 1: 0, 3: 0, 5: 0, 10: 0 }, '345': { 1: 0, 3: 0, 5: 0, 10: 0 } });
  for (const key of ['333', '345']) {
    for (const k of [1, 3, 5, 10]) if (scores[key].rank && scores[key].rank <= k) byClass.get(label)[key][k] += 1;
  }
  cases.push({ label, sourceRow, ...scores });
  // @napi-rs/canvas allocates native backing stores; release them eagerly so a
  // few hundred large test canvases do not accumulate before V8's next GC.
  canvas.width = 1;
  canvas.height = 1;
  if ((index + 1) % 25 === 0) globalThis.gc?.();
  if ((index + 1) % 100 === 0) console.log(`Scored ${index + 1}/${manifest.total_drawings}`);
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function quantile(sorted, p) { return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]; }
function pairedClusterBootstrap(k, repetitions = 10000, seed = 572901) {
  const clusters = [...byClass.values()];
  const random = seededRandom(seed + k);
  const deltas = new Array(repetitions);
  for (let r = 0; r < repetitions; r += 1) {
    let d = 0;
    for (let c = 0; c < clusters.length; c += 1) {
      const cluster = clusters[Math.floor(random() * clusters.length)];
      d += cluster['333'][k] - cluster['345'][k];
    }
    deltas[r] = d / (clusters.length * manifest.selection.drawings_per_class);
  }
  deltas.sort((a, b) => a - b);
  return [quantile(deltas, 0.025), quantile(deltas, 0.975)];
}
function wilson(successes, n, z = 1.96) {
  const p = successes / n;
  const denom = 1 + z * z / n;
  const centre = (p + z * z / (2 * n)) / denom;
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n) / denom;
  return [centre - margin, centre + margin];
}

const rates = {};
const deltas = {};
for (const key of ['333', '345']) {
  rates[key] = {};
  for (const k of [1, 3, 5, 10]) rates[key][k] = {
    correct: counts[key][k],
    total: manifest.total_drawings,
    accuracy: counts[key][k] / manifest.total_drawings,
    wilson95: wilson(counts[key][k], manifest.total_drawings),
  };
}
for (const k of [1, 3, 5, 10]) deltas[k] = {
  difference_333_minus_345: (counts['333'][k] - counts['345'][k]) / manifest.total_drawings,
  paired_class_cluster_bootstrap95: pairedClusterBootstrap(k),
};

const report = {
  title: '400-drawing paired Quick, Draw! model evaluation',
  generated_at: new Date().toISOString(),
  dataset: manifest,
  protocol: {
    model_profiles: { '333': 'supplied GraphModel, current provisional app preprocessing', '345': 'project model, current app preprocessing' },
    same_images_for_both_models: true,
    metrics: 'Top-k accuracy against the official class label; predictions from the app inference/preprocessing modules',
    uncertainties: [
      'The 333-class model source did not include training-data provenance, so overlap with this evaluation set cannot be ruled out.',
      'The attached 333-class output-label map is used provisionally; its alignment with learned output neurons is unverified.',
      'The supplied model training normalization was not documented; its app preprocessing remains provisional.',
      'The 400 images are stratified over 40 randomly sampled categories, not a uniform sample over all Quick, Draw! examples.',
    ],
  },
  summary: { counts, rates, paired_class_cluster_bootstrap_delta: deltas },
  per_class: Object.fromEntries(byClass),
  cases,
};

if (OUT_PATH) fs.writeFileSync(path.resolve(OUT_PATH), `${JSON.stringify(report, null, 2)}\n`);
console.log('\nTop-k results (Wilson 95% CI):');
for (const k of [1, 3, 5, 10]) {
  const a = rates['333'][k];
  const b = rates['345'][k];
  const delta = deltas[k];
  console.log(`top-${k}: 333 ${a.correct}/400 ${(a.accuracy * 100).toFixed(1)}% [${(a.wilson95[0] * 100).toFixed(1)}, ${(a.wilson95[1] * 100).toFixed(1)}] | 345 ${b.correct}/400 ${(b.accuracy * 100).toFixed(1)}% [${(b.wilson95[0] * 100).toFixed(1)}, ${(b.wilson95[1] * 100).toFixed(1)}] | delta ${(delta.difference_333_minus_345 * 100).toFixed(1)} pp; cluster bootstrap delta 95% [${(delta.paired_class_cluster_bootstrap95[0] * 100).toFixed(1)}, ${(delta.paired_class_cluster_bootstrap95[1] * 100).toFixed(1)}]`);
}
if (OUT_PATH) console.log(`\nFull predictions and reproducibility details written to ${path.resolve(OUT_PATH)}`);

supplied.model.dispose();
existing.model.dispose();
