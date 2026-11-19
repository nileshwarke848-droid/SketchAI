#!/usr/bin/env node
// Model output/probability safety checks, including malformed scores.
import assert from 'node:assert/strict';
import * as tf from '@tensorflow/tfjs';
import { createCanvas } from '@napi-rs/canvas';
import { predict, toProbabilities } from '../src/ai/model.js';

const logits = toProbabilities([2, 1, 0]);
assert.ok(Math.abs(logits.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
assert.ok(logits[0] > logits[1] && logits[1] > logits[2]);
const probabilities = [0.7, 0.2, 0.1];
assert.equal(toProbabilities(probabilities), probabilities, 'already-normalized probabilities remain unchanged');

await tf.setBackend('cpu');
await tf.ready();
const canvas = createCanvas(1200, 720);
const context = canvas.getContext('2d');
context.strokeStyle = '#000';
context.lineWidth = 8;
context.beginPath();
context.moveTo(250, 350);
context.lineTo(900, 350);
context.stroke();
const labels = Array.from({ length: 345 }, (_, index) => `class-${index}`);
const malformedModel = {
  outputs: [{ shape: [null, labels.length] }],
  predict: () => tf.tensor2d([[...new Array(labels.length - 1).fill(0), Number.NaN]]),
};
const result = predict(malformedModel, labels, canvas, { profile: '345' });
assert.equal(result.status, 'error');
assert.match(result.error?.message ?? '', /non-finite/);
console.log('Model inference guards passed.');
