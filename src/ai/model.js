import * as tf from '@tensorflow/tfjs';
import { INPUT_SIZE, preprocessForModel } from './preprocess.js';

// The verified 345-class project model is preferred by default, followed by
// the original 100-class fallback. The supplied 333-class GraphModel (96x96x1)
// remains available only as an explicit evaluation opt-in until its output
// labels are verified. Each profile has its own preprocessing; see preprocess.js.

export const MODEL_PROFILES = Object.freeze({
  kaggle333: Object.freeze({
    id: '333',
    tier: 'extended',
    modelType: 'graph',
    classes: 333,
    inputSize: 96,
    modelPath: 'model-333/model.json',
    labelsPath: 'model-333/classes.txt',
    label: '333 objects',
  }),
  // Previous, project-trained 345-class model is retained as the first fallback.
  extended: Object.freeze({
    id: '345',
    tier: 'legacy',
    modelType: 'layers',
    classes: 345,
    inputSize: INPUT_SIZE,
    modelPath: 'model-345/model.json',
    labelsPath: 'model-345/classes.txt',
    label: '345 objects',
  }),
  basic: Object.freeze({
    id: '100',
    tier: 'basic',
    modelType: 'layers',
    classes: 100,
    inputSize: INPUT_SIZE,
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
  const modelLoader = profile.modelType === 'graph' ? tf.loadGraphModel : tf.loadLayersModel;
  const [model, labels] = await Promise.all([
    modelLoader(`${base}${profile.modelPath}`),
    readLabels(profile.labelsPath, base),
  ]);

  const reject = (message) => {
    model.dispose();
    throw new Error(message);
  };

  const inputShape = model.inputs?.[0]?.shape ?? [];
  const [, height, width, channels] = inputShape;
  const expectedSize = profile.inputSize ?? INPUT_SIZE;
  if (height !== expectedSize || width !== expectedSize || channels !== 1) {
    reject(
      `The ${profile.label} model expects ${JSON.stringify(inputShape)} input, but SketchAI feeds ${expectedSize}x${expectedSize}x1.`,
    );
  }

  if (profile.modelType === 'graph') {
    // GraphModel output signatures do not consistently expose shape metadata
    // across converter versions, so verify one real forward pass instead.
    const probe = tf.zeros([1, expectedSize, expectedSize, 1]);
    let result;
    try {
      result = model.execute(probe);
      const output = Array.isArray(result)
        ? result[0]
        : result instanceof tf.Tensor
          ? result
          : Object.values(result ?? {})[0];
      const classCount = output?.shape?.at(-1);
      if (classCount !== labels.length) {
        reject(`The ${profile.label} model predicts ${classCount} classes but ${labels.length} labels were loaded.`);
      }
    } catch (error) {
      model.dispose();
      throw new Error(`The ${profile.label} graph model failed its output check: ${error.message}`);
    } finally {
      probe.dispose();
      if (Array.isArray(result)) result.forEach((tensor) => tensor?.dispose?.());
      else if (result instanceof tf.Tensor) result.dispose();
      else if (result && typeof result === 'object') Object.values(result).forEach((tensor) => tensor?.dispose?.());
    }
  } else {
    const outputs = model.outputs[0].shape;
    const classCount = outputs[outputs.length - 1];
    if (classCount !== labels.length) {
      reject(`The ${profile.label} model predicts ${classCount} classes but ${labels.length} labels were loaded.`);
    }
  }
  if (profile.classes && labels.length !== profile.classes) {
    reject(`Expected ${profile.classes} labels for the ${profile.label} model but found ${labels.length}.`);
  }

  return { model, labels, profile: profile.id, tier: profile.tier, modelType: profile.modelType ?? 'layers', modelPath: profile.modelPath };
}

/**
 * Uses the verified 345-class project model by default, then the original
 * 100-class fallback. The supplied 333-class model can be enabled explicitly
 * for evaluation, but its attached output-label ordering is not yet verified.
 */
export async function loadModel({
  base = import.meta.env?.BASE_URL ?? './',
  onBackend,
  onProfile,
  allowUnverified333 = import.meta.env?.VITE_ENABLE_UNVERIFIED_333_MODEL === 'true',
} = {}) {
  const backend = await ensureBackend();
  onBackend?.(backend);

  const failures = [];
  const candidates = allowUnverified333
    ? [MODEL_PROFILES.kaggle333, MODEL_PROFILES.extended]
    : [MODEL_PROFILES.extended];
  for (const profile of candidates) {
    try {
      const loaded = await loadProfile(profile, { base });
      const fallbackReason = failures.length ? failures.join(' | ') : null;
      onProfile?.({ tier: loaded.tier, classes: loaded.labels.length, fallbackReason });
      return { ...loaded, backend, fallbackReason };
    } catch (error) {
      failures.push(`${profile.label}: ${error?.message ?? String(error)}`);
      console.info(`${profile.label} unavailable; trying the next model:`, error);
    }
  }

  const fallbackReason = failures.join(' | ');
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
  const isGraphModel = profile === '333';
  if (!isGraphModel && labels.length !== model.outputs[0].shape.at(-1)) {
    return { status: 'error', predictions: [], debug: pre, error: new Error('Model and labels disagree.') };
  }
  let scores;
  try {
    scores = tf.tidy(() => {
      const input = tf.tensor4d(pre.ink, [1, pre.size, pre.size, 1], 'float32');
      const result = isGraphModel ? model.execute(input) : model.predict(input);
      const output = Array.isArray(result)
        ? result[0]
        : result instanceof tf.Tensor
          ? result
          : Object.values(result ?? {})[0];
      if (!output || output.shape.at(-1) !== labels.length) {
        throw new Error(`Model output and labels disagree (${output?.shape?.at(-1)} outputs, ${labels.length} labels).`);
      }
      return Array.from(output.dataSync());
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
