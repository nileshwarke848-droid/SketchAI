#!/usr/bin/env node
// Manual smoke test for the 345-class model that runs the *browser* code path.
//
// It loads the exported TensorFlow.js model with tf.loadLayersModel(), renders the
// sixteen doodles from training/doodles.json, pushes them through the real
// preprocessFor345Model() from src/ai/preprocess.js, and prints the top ten guesses.
//
// Because it uses the same files and the same preprocessing the app uses, a green
// result here means the export is loadable in a browser and the label order matches.
//
//   node scripts/manual-test-345.mjs                       # public/model-345
//   node scripts/manual-test-345.mjs --dir training/export/model-345
//   node scripts/manual-test-345.mjs --thickness 12
//
// It needs @tensorflow/tfjs to be installed (it already is, as an app dependency).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A canvas-shaped shim: preprocess.js only needs getImageData() alpha bytes. */
function alphaCanvas(alpha, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < alpha.length; i += 1) data[i * 4 + 3] = alpha[i];
  return {
    width,
    height,
    getContext: () => ({ getImageData: () => ({ data, width, height }) }),
  };
}

/** Rasterise normalised polylines exactly like a thin antialiased canvas stroke. */
function renderDoodle(strokes, { canvas = 320, span = 300, lineWidth = 7 } = {}) {
  const alpha = new Float32Array(canvas * canvas);
  const centre = canvas / 2;
  const radius = lineWidth / 2;
  for (const stroke of strokes) {
    const pts = stroke.map(([x, y]) => [centre + x * span, centre + y * span]);
    const segments = pts.length > 1 ? pts.slice(1).map((p, i) => [pts[i], p]) : [[pts[0], pts[0]]];
    for (const [[x0, y0], [x1, y1]] of segments) {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const lengthSq = dx * dx + dy * dy;
      const minX = Math.max(0, Math.floor(Math.min(x0, x1) - radius - 1));
      const maxX = Math.min(canvas - 1, Math.ceil(Math.max(x0, x1) + radius + 1));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1) - radius - 1));
      const maxY = Math.min(canvas - 1, Math.ceil(Math.max(y0, y1) + radius + 1));
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          let t = 0;
          if (lengthSq > 0) {
            t = Math.min(1, Math.max(0, ((x - x0) * dx + (y - y0) * dy) / lengthSq));
          }
          const distance = Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy));
          const coverage = Math.min(1, Math.max(0, radius + 0.5 - distance));
          const index = y * canvas + x;
          if (coverage * 255 > alpha[index]) alpha[index] = coverage * 255;
        }
      }
    }
  }
  return alphaCanvas(Uint8Array.from(alpha, (v) => Math.round(v)), canvas, canvas);
}

/** Load a Layers model straight from disk, with no HTTP server involved. */
async function loadFromDisk(tf, dir) {
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf8'));
  const groups = spec.weightsManifest;
  const weightSpecs = groups.flatMap((group) => group.weights);
  const buffers = groups
    .flatMap((group) => group.paths)
    .map((file) => fs.readFileSync(path.join(dir, file)));
  const total = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const buffer of buffers) {
    merged.set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength), offset);
    offset += buffer.byteLength;
  }
  const handler = {
    load: async () => ({
      modelTopology: spec.modelTopology,
      weightSpecs,
      weightData: merged.buffer,
      format: spec.format,
      generatedBy: spec.generatedBy,
      convertedBy: spec.convertedBy,
    }),
  };
  return tf.loadLayersModel(handler);
}

function parseArgs(argv) {
  const options = { dir: path.join(ROOT, 'public', 'model-345'), thickness: 7, topK: 10 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dir') options.dir = path.resolve(argv[(i += 1)]);
    else if (arg === '--thickness') options.thickness = Number(argv[(i += 1)]);
    else if (arg === '--top') options.topK = Number(argv[(i += 1)]);
    else if (arg === '--help' || arg === '-h') options.help = true;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/manual-test-345.mjs [--dir public/model-345] [--thickness 7] [--top 10]');
    return 0;
  }
  const modelJson = path.join(options.dir, 'model.json');
  const classesFile = path.join(options.dir, 'classes.txt');
  if (!fs.existsSync(modelJson)) {
    console.error(`No 345-class model at ${path.relative(ROOT, modelJson) || modelJson}.`);
    console.error('Train one in Colab, then run: node scripts/install-model-345.mjs <export folder>');
    return 2;
  }

  const tf = await import('@tensorflow/tfjs');
  await tf.setBackend('cpu'); // identical maths to the browser's CPU fallback
  await tf.ready();

  const model = await loadFromDisk(tf, options.dir);
  const labels = fs.readFileSync(classesFile, 'utf8').trim().split(/\r?\n/).map((l) => l.trim());
  const outputs = model.outputs[0].shape;
  const units = outputs[outputs.length - 1];
  console.log(`Model: ${path.relative(ROOT, options.dir)} · ${units} outputs · ${labels.length} labels`);
  if (units !== labels.length) {
    console.error('The model and classes.txt disagree. Refusing to print guesses that would be mislabelled.');
    return 1;
  }

  const { preprocessFor345Model } = await import(path.join(ROOT, 'src', 'ai', 'preprocess.js'));
  const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'training', 'doodles.json'), 'utf8'));
  const lineWidth = (payload.lineWidth ?? 7) * (options.thickness / 7);

  let top1 = 0;
  let top3 = 0;
  let top10 = 0;
  const total = Object.keys(payload.doodles).length;
  console.log(`\nPen ${lineWidth.toFixed(1)}px in the ${payload.span}px doodle box · profile "345"\n`);

  for (const [name, strokes] of Object.entries(payload.doodles)) {
    const canvas = renderDoodle(strokes, { span: payload.span ?? 300, lineWidth });
    const pre = preprocessFor345Model(canvas);
    if (!pre.ok) {
      console.log(`${name.padStart(10)}: skipped (${pre.reason})`);
      continue;
    }
    const scores = tf.tidy(() => {
      const input = tf.tensor4d(pre.ink, [1, 28, 28, 1], 'float32');
      return Array.from(model.predict(input).dataSync());
    });
    const ranked = scores
      .map((score, index) => ({ label: labels[index], score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, options.topK);
    const labelsTop = ranked.map((entry) => entry.label);
    if (labelsTop[0] === name) top1 += 1;
    if (labelsTop.slice(0, 3).includes(name)) top3 += 1;
    if (labelsTop.includes(name)) top10 += 1;
    const detail = ranked.map((entry) => `${entry.label} ${(entry.score * 100).toFixed(1)}%`).join(' | ');
    console.log(`${labelsTop[0] === name ? 'OK ' : '   '}${name.padStart(10)}: ${detail}`);
  }

  console.log(`\ntop-1 ${top1}/${total} · top-3 ${top3}/${total} · top-10 ${top10}/${total}`);
  console.log('Sixteen quick hand-drawn doodles, not a test split — read the confidence values, not just the misses.');
  return 0;
}

main().then((code) => process.exit(code)).catch((error) => {
  console.error('Manual test failed:', error.message);
  process.exit(1);
});
