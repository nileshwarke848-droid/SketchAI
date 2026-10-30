#!/usr/bin/env node
// Install a trained 345-class model into the app.
//
//   node scripts/install-model-345.mjs                      # from training/export/model-345
//   node scripts/install-model-345.mjs ~/Downloads/model-345
//   node scripts/install-model-345.mjs --check              # validate only, copy nothing
//
// The script refuses to copy anything it cannot verify: every weight shard must be
// present, the network must output 345 classes, the input must be 28x28x1, and the
// label file must be exactly the canonical Quick, Draw! list in the canonical order.
// Getting any of those wrong would silently mislabel every prediction.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL = path.join(ROOT, 'src', 'data', 'quickdraw-categories.txt');
const TARGET = path.join(ROOT, 'public', 'model-345');
const FILES = ['model.json', 'classes.txt'];

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function readLines(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Layer list from a model.json, for both writer flavours:
 *   - tensorflowjs_converter: modelTopology.model_config.config.layers
 *   - tfjs model.save():      modelTopology.config.layers
 */
function layerList(spec) {
  const topology = spec?.modelTopology ?? {};
  return topology?.model_config?.config?.layers ?? topology?.config?.layers ?? [];
}

/** Final Dense layer with a softmax activation, i.e. the class count. */
function outputUnits(spec) {
  let units = null;
  for (const layer of layerList(spec)) {
    if (layer.class_name === 'Dense' && layer.config?.activation === 'softmax') {
      units = layer.config.units;
    }
  }
  return units;
}

/** Input shape of the first layer, batch dimension included (may be null). */
function inputShape(spec) {
  const first = layerList(spec)[0] ?? {};
  return (
    first.config?.batch_input_shape ??
    first.config?.batch_shape ??
    first.config?.input_shape ??
    null
  );
}

function validate(sourceDir) {
  const missing = FILES.filter((file) => !fs.existsSync(path.join(sourceDir, file)));
  if (missing.length) {
    fail(`${sourceDir} is missing ${missing.join(', ')}. Run the training notebook's export step first.`);
  }

  const spec = JSON.parse(fs.readFileSync(path.join(sourceDir, 'model.json'), 'utf8'));
  const groups = spec.weightsManifest ?? [];
  const shards = groups.flatMap((group) => group.paths ?? []);
  if (!shards.length) fail('model.json lists no weight shards.');
  const missingShards = shards.filter((shard) => !fs.existsSync(path.join(sourceDir, shard)));
  if (missingShards.length) fail(`Missing weight shard(s): ${missingShards.join(', ')}`);

  const labels = readLines(path.join(sourceDir, 'classes.txt'));
  if (labels.length !== 345) fail(`classes.txt has ${labels.length} labels; the model needs 345.`);
  if (new Set(labels).size !== labels.length) fail('classes.txt contains duplicate labels.');

  const canonical = readLines(CANONICAL);
  const mismatched = labels.findIndex((label, index) => label !== canonical[index]);
  if (mismatched !== -1) {
    fail(
      `Label ${mismatched + 1} is "${labels[mismatched]}" but the canonical list says "${canonical[mismatched]}".\n` +
        '  The label file must be a copy of src/data/quickdraw-categories.txt, in that exact order,\n' +
        '  because output neuron N is displayed as line N.',
    );
  }

  const units = outputUnits(spec);
  if (units === null) {
    fail('model.json has no final Dense layer with a softmax activation, so the class count cannot be checked.');
  }
  if (units !== 345) fail(`The network outputs ${units} classes, not 345.`);

  const shape = inputShape(spec);
  if (shape && !(shape.length === 4 && shape[1] === 28 && shape[2] === 28 && shape[3] === 1)) {
    fail(`The network expects input ${JSON.stringify(shape)}; SketchAI feeds [1,28,28,1].`);
  }

  const manifestPath = path.join(sourceDir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : null;
  if (manifest?.is_self_test_only) {
    fail(
      'This export is marked is_self_test_only (it was produced from synthetic offline shapes, not Quick, Draw!).\n' +
        '  Installing it would ship a model that cannot recognise anything. Train on --dataset quickdraw first.',
    );
  }

  const bytes =
    fs.statSync(path.join(sourceDir, 'model.json')).size +
    shards.reduce((sum, shard) => sum + fs.statSync(path.join(sourceDir, shard)).size, 0);

  return { spec, labels, shards, manifest, bytes };
}

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--check');
  const checkOnly = process.argv.includes('--check');
  const sourceDir = path.resolve(args[0] ?? path.join(ROOT, 'training', 'export', 'model-345'));

  if (!fs.existsSync(sourceDir)) {
    fail(`No export folder at ${sourceDir}.`);
  }

  console.log(`Checking ${path.relative(ROOT, sourceDir) || sourceDir} …`);
  const { labels, shards, manifest, bytes } = validate(sourceDir);
  console.log(`✔ ${labels.length} labels match src/data/quickdraw-categories.txt exactly`);
  console.log(`✔ network outputs 345 classes, input 28x28x1`);
  console.log(`✔ ${shards.length} weight shard${shards.length === 1 ? '' : 's'} · ${human(bytes)} total`);
  if (manifest) {
    const metrics = manifest.metrics ?? {};
    console.log(
      `  trained on ${manifest.dataset} · ${manifest.train_samples?.toLocaleString?.() ?? '?'} train / ` +
        `${manifest.test_samples?.toLocaleString?.() ?? '?'} test · ` +
        `top-1 ${((metrics.test_accuracy ?? 0) * 100).toFixed(1)}% · ` +
        `top-3 ${((metrics.test_top3_accuracy ?? 0) * 100).toFixed(1)}% · ` +
        `top-10 ${((metrics.test_top10_accuracy ?? 0) * 100).toFixed(1)}%`,
    );
  }

  if (checkOnly) {
    console.log('\n--check: nothing copied.');
    return;
  }

  fs.mkdirSync(TARGET, { recursive: true });
  for (const file of FILES) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(TARGET, file));
  }
  for (const shard of shards) {
    fs.copyFileSync(path.join(sourceDir, shard), path.join(TARGET, shard));
  }
  for (const extra of ['manifest.json', 'LICENSE.txt']) {
    if (fs.existsSync(path.join(sourceDir, extra))) {
      fs.copyFileSync(path.join(sourceDir, extra), path.join(TARGET, extra));
    }
  }

  console.log(`\n✔ Installed into ${path.relative(ROOT, TARGET)}/`);
  console.log('  Files: ' + [...FILES, ...shards].join(', '));
  console.log('\nNext: npm run build (or npm run dev) and check the header says "AI ready — 345 objects".');
  console.log('Then: node scripts/manual-test-345.mjs');
}

main();
