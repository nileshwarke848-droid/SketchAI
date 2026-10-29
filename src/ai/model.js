import * as tf from '@tensorflow/tfjs';
import { INPUT_SIZE, preprocessForModel } from './preprocess.js';

// SketchAI can run two classifiers:
//
//   extended  345 classes — trained for this project on Google's Quick, Draw!
//             28x28 numpy bitmaps (see training/README.md). Ships in
//             public/model-345/ and is the primary model.
//   basic     100 classes — the original fallback model. It stays in
//             public/model/ and is used automatically whenever the extended
//             model is missing, incomplete or fails validation.
//
// Both read 28x28x1 white-ink-on-black images with values 0..1, but each one uses
// its own pixel profile (see preprocess.js) because they were trained differently.

export const MODEL_PROFILES = Object.freeze({
  extended: Object.freeze({
    id: '345',
    tier: 'extended',
    classes: 345,
    modelPath: 'model-345/model.json',
    labelsPath: 'model-345/classes.txt',
    label: '345 objects',
  }),
  basic: Object.freeze({
    id: '100',
    tier: 'basic',
    classes: 100,
    modelPath: 'model/model.json',
    labelsPath: 'model/classes.txt',
    label: '100 objects',
  }),
});

// Kept for anything that still imports the old names; they now point at the
// fallback model, which is the one guaranteed to be present in the repository.
export const MODEL_PATH = MODEL_PROFILES.basic.modelPath;
export const LABELS_PATH = MODEL_PROFILES.basic.labelsPath;
export const MAX_PREDICTIONS = 10;

/** Cheap capability probe so unsupported browsers never reach a failing setBackend. */
function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export async function ensureBackend() {
  if (supportsWebGL()) {
    try {
      await tf.setBackend('webgl');
      await tf.ready();
    } catch {
      /* fall through to CPU */
    }
  }
  if (tf.getBackend() !== 'webgl') {
    try {
      await tf.setBackend('cpu');
      await tf.ready();
    } catch {
      /* keep whatever backend tfjs managed to start */
    }
  }
  return tf.getBackend();
}

async function readLabels(path, base) {
  const response = await fetch(`${base}${path}`);
  if (!response.ok) throw new Error(`The class list ${path} could not be loaded.`);
  return (await response.text())
    .trim()
    .split(/\r?\n/)
    .map((label) => label.trim())
    .filter(Boolean);
}

/**
 * Loads one profile and checks it is safe to use *before* the UI touches it.
 *
 * A model that predicts a different number of values than there are labels would
 * silently show the wrong object names, so it is rejected instead.
 */
export async function loadProfile(profile, { base = '' } = {}) {
  const [model, labels] = await Promise.all([
    tf.loadLayersModel(`${base}${profile.modelPath}`),
    readLabels(profile.labelsPath, base),
  ]);

  const reject = (message) => {
    model.dispose();
    throw new Error(message);
  };

  const inputShape = model.inputs?.[0]?.shape ?? [];
  const [, height, width, channels] = inputShape;
  if (height !== INPUT_SIZE || width !== INPUT_SIZE || channels !== 1) {
    reject(
      `The ${profile.label} model expects ${JSON.stringify(inputShape)} input, but SketchAI feeds ${INPUT_SIZE}x${INPUT_SIZE}x1.`,
    );
  }

  const outputs = model.outputs[0].shape;
  const classCount = outputs[outputs.length - 1];
  if (classCount !== labels.length) {
    reject(`The ${profile.label} model predicts ${classCount} classes but ${labels.length} labels were loaded.`);
  }
  if (profile.classes && labels.length !== profile.classes) {
    reject(`Expected ${profile.classes} labels for the ${profile.label} model but found ${labels.length}.`);
  }

  return { model, labels, profile: profile.id, tier: profile.tier, modelPath: profile.modelPath };
}

/**
 * Loads the best available model.
 *
 * The 345-class model is tried first. If its files are absent (a plain checkout of
 * this repository with no trained model yet), unreadable or inconsistent, the
 * 100-class model is loaded instead and `fallbackReason` explains why — the app
 * keeps working instead of breaking.
 */
export async function loadModel({ base = import.meta.env?.BASE_URL ?? './', onBackend, onProfile } = {}) {
  const backend = await ensureBackend();
  onBackend?.(backend);

  let fallbackReason = null;
  try {
    const loaded = await loadProfile(MODEL_PROFILES.extended, { base });
    onProfile?.({ tier: loaded.tier, classes: loaded.labels.length, fallbackReason: null });
    return { ...loaded, backend, fallbackReason: null };
  } catch (error) {
    // Not an application error: the extended model is optional by design.
    fallbackReason = error?.message ?? String(error);
    console.info('Extended 345-class model unavailable, using the 100-class model:', fallbackReason);
    onProfile?.({ tier: 'basic', fallbackReason });
  }

  const loaded = await loadProfile(MODEL_PROFILES.basic, { base });
  onProfile?.({ tier: loaded.tier, classes: loaded.labels.length, fallbackReason });
  return { ...loaded, backend, fallbackReason };
}

/**
 * The final Dense layer already applies softmax, so its outputs are honest
 * probabilities. This guard converts raw logits if a future model ships them
 * without a softmax layer instead of displaying meaningless numbers.
 */
export function toProbabilities(scores) {
  let total = 0;
  for (let i = 0; i < scores.length; i += 1) total += scores[i];
  const looksNormalised = Math.abs(total - 1) < 0.02 && scores.every((score) => score >= 0 && score <= 1);
  if (looksNormalised) return scores;
  const max = Math.max(...scores);
  const exps = scores.map((score) => Math.exp(score - max));
  const denom = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => value / denom);
}

/**
 * Runs the real network on the current sketch canvas.
 * Returns a status so the UI can explain *why* there is nothing to show.
 *
 * `profile` picks the matching preprocessing: pass the `profile` returned by
 * loadModel() ('345' for the extended model, '100' for the fallback).
 */
export function predict(model, labels, sketch, { topK = MAX_PREDICTIONS, profile = '100' } = {}) {
  const pre = preprocessForModel(sketch, profile);
  if (!pre.ok) return { status: pre.reason, predictions: [], debug: pre };
  if (labels.length !== model.outputs[0].shape.at(-1)) {
    return { status: 'error', predictions: [], debug: pre, error: new Error('Model and labels disagree.') };
  }
  let scores;
  try {
    scores = tf.tidy(() => {
      const input = tf.tensor4d(pre.ink, [1, INPUT_SIZE, INPUT_SIZE, 1], 'float32');
      return Array.from(model.predict(input).dataSync());
    });
  } catch (error) {
    return { status: 'error', predictions: [], debug: pre, error };
  }
  const probabilities = toProbabilities(scores);
  const predictions = probabilities
    .map((score, index) => ({ label: labels[index], index, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return { status: 'ok', predictions, debug: pre, scores: probabilities };
}

/** For the developer panel: the exact 28x28 values handed to tf.tensor4d. */
export function preprocessForDebug(sketch, profile = '100') {
  return preprocessForModel(sketch, profile);
}
