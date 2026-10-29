import * as tf from '@tensorflow/tfjs';
import { INPUT_SIZE, preprocessSketch } from './preprocess.js';

// The classifier is a pretrained Keras CNN converted to TensorFlow.js
// (see README for the source and licence). Input: 28x28x1 white ink on black,
// values 0..1. Output: 100 softmax probabilities in the order of classes.txt.
export const MODEL_PATH = 'model/model.json';
export const LABELS_PATH = 'model/classes.txt';

/**
 * Picks the best available backend. WebGL is much faster, but a browser may be
 * missing it (blocked GPU, old device, headless). Falling back to CPU keeps the
 * app usable instead of failing to load the model.
 */
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

export async function loadModel({ base = import.meta.env?.BASE_URL ?? './', onBackend } = {}) {
  const backend = await ensureBackend();
  onBackend?.(backend);
  const [model, response] = await Promise.all([
    tf.loadLayersModel(`${base}${MODEL_PATH}`),
    fetch(`${base}${LABELS_PATH}`),
  ]);
  if (!response.ok) {
    model.dispose();
    throw new Error('The class list for the recognition model could not be loaded.');
  }
  const labels = (await response.text()).trim().split(/\r?\n/).map((label) => label.trim()).filter(Boolean);
  const outputs = model.outputs[0].shape;
  const classCount = outputs[outputs.length - 1];
  if (classCount !== labels.length) {
    model.dispose();
    throw new Error(`The model predicts ${classCount} classes but ${labels.length} labels were loaded.`);
  }
  return { model, labels, backend };
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
 */
export function predict(model, labels, sketch, { topK = 3 } = {}) {
  const pre = preprocessSketch(sketch, { size: INPUT_SIZE });
  if (!pre.ok) return { status: pre.reason, predictions: [], debug: pre };
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
export function preprocessForDebug(sketch) {
  return preprocessSketch(sketch, { size: INPUT_SIZE });
}
