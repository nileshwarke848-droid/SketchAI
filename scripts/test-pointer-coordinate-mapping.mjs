#!/usr/bin/env node
// Regression for the shared CSS-pixel input viewport and 1200x720 scene space.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { clientToCanvasPoint } from '../src/lib/canvas-coordinates.js';

const LOGICAL_WIDTH = 1200;
const LOGICAL_HEIGHT = 720;
const stylesheet = fs.readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

function viewport(left, top, width, height) {
  return { getBoundingClientRect: () => ({ left, top, width, height }) };
}

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(stylesheet);
  assert.ok(match, `missing CSS rule ${selector}`);
  return Object.fromEntries(match[1].split(';').map((declaration) => declaration.trim())
    .filter(Boolean).map((declaration) => {
      const separator = declaration.indexOf(':');
      return [declaration.slice(0, separator).trim(), declaration.slice(separator + 1).trim()];
    }));
}

function assertLayerRule(selector, declarations) {
  const rule = cssRule(selector);
  for (const [property, value] of Object.entries(declarations)) {
    assert.equal(rule[property], value, `${selector} must set ${property}:${value}`);
  }
  return rule;
}

function assertSharedLayerCssContract() {
  assertLayerRule('.drawing-area', {
    position: 'relative',
    display: 'block',
    'padding-left': '58px',
  });
  assertLayerRule('.tool-rail', {
    position: 'absolute',
    left: '0',
    top: '0',
    bottom: '0',
    width: '58px',
    'overflow-y': 'auto',
  });
  const wrapper = assertLayerRule('.canvas-wrap', {
    position: 'relative',
    width: '100%',
    'aspect-ratio': '5/3',
    'touch-action': 'none',
  });
  assert.equal(wrapper['box-sizing'], 'border-box');
  assert.ok(stylesheet.includes('.drawing-area{padding-left:48px}.drawing-area .tool-rail{width:48px'),
    'mobile rail width and viewport padding must remain aligned');
  assertLayerRule('.canvas-wrap canvas', {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    'pointer-events': 'none',
  });
  assertLayerRule('.canvas-wrap canvas.sketch-overlay', {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    'pointer-events': 'none',
  });
  assertLayerRule('.selection-overlay', {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    'pointer-events': 'none',
  });
}

function runGrid(displayWidth, displayHeight) {
  const left = 73;
  const top = 41;
  const view = viewport(left, top, displayWidth, displayHeight);
  const verticalFractions = [0, 0.25, 0.5, 0.75, 1];
  const horizontalFractions = [0, 0.5, 1];
  let checked = 0;
  for (const yFraction of verticalFractions) {
    for (const xFraction of horizontalFractions) {
      const clientX = left + displayWidth * xFraction;
      const clientY = top + displayHeight * yFraction;
      const actual = clientToCanvasPoint(clientX, clientY, view, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      assert.ok(Math.abs(actual.x - LOGICAL_WIDTH * xFraction) < 1e-9,
        `x at ${(xFraction * 100).toFixed(0)}% (${displayWidth}px CSS): ${actual.x}`);
      assert.ok(Math.abs(actual.y - LOGICAL_HEIGHT * yFraction) < 1e-9,
        `y at ${(yFraction * 100).toFixed(0)}% (${displayHeight}px CSS): ${actual.y}`);
      checked += 1;
    }
  }
  return checked;
}

function pixelNear(canvas, x, y, radius = 5) {
  const x0 = Math.max(0, Math.round(x) - radius);
  const y0 = Math.max(0, Math.round(y) - radius);
  const width = Math.min(canvas.width - x0, radius * 2 + 1);
  const height = Math.min(canvas.height - y0, radius * 2 + 1);
  const data = canvas.getContext('2d').getImageData(x0, y0, width, height).data;
  for (let index = 3; index < data.length; index += 4) if (data[index] > 0) return true;
  return false;
}

function runInputRow(displayWidth, displayHeight) {
  const left = 37;
  const top = 29;
  const view = viewport(left, top, displayWidth, displayHeight);
  const canvas = createCanvas(LOGICAL_WIDTH, LOGICAL_HEIGHT);
  const context = canvas.getContext('2d');
  context.fillStyle = '#242422';
  const percentages = [5, 25, 50, 75, 85, 90, 95, 98];
  for (const percentage of percentages) {
    const fraction = percentage / 100;
    const clientX = left + displayWidth / 2;
    const clientY = top + displayHeight * fraction;
    const point = clientToCanvasPoint(clientX, clientY, view, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    const expectedY = LOGICAL_HEIGHT * fraction;
    assert.ok(point.y >= 0 && point.y < LOGICAL_HEIGHT,
      `${percentage}% input must remain within logical canvas: ${point.y}`);
    assert.ok(Math.abs(point.y - expectedY) < 1e-9,
      `${percentage}% mapped to ${point.y}, expected ${expectedY}`);
    context.beginPath();
    context.arc(point.x, point.y, 3, 0, Math.PI * 2);
    context.fill();
    assert.ok(pixelNear(canvas, LOGICAL_WIDTH / 2, expectedY),
      `${percentage}% input must create sketch pixels near logical y=${expectedY}`);
  }

  // The last safe interior coordinate, requested independently of the 98% probe.
  const targetY = 718;
  const point = clientToCanvasPoint(
    left + displayWidth / 2,
    top + displayHeight * targetY / LOGICAL_HEIGHT,
    view,
    LOGICAL_WIDTH,
    LOGICAL_HEIGHT,
  );
  assert.ok(point.y >= 0 && point.y < LOGICAL_HEIGHT, `y=718 must be valid, got ${point.y}`);
  context.beginPath();
  context.arc(point.x, point.y, 3, 0, Math.PI * 2);
  context.fill();
  assert.ok(pixelNear(canvas, LOGICAL_WIDTH / 2, targetY), 'safe interior y=718 must leave sketch pixels');
  return { inputs: percentages.length + 1, lastPercentY: LOGICAL_HEIGHT * 0.98, safeBottomY: point.y };
}

console.log('Pointer-coordinate and canvas-layer regression');
console.log('==============================================');
assertSharedLayerCssContract();
console.log('CSS layer contract: wrapper, art, sketch and selection use one inset-0 viewport; wrapper owns touch input');

for (const [width, height, label] of [
  [1000, 600, '1000×600 responsive display'],
  [750, 450, '750×450 responsive display'],
  [320, 192, '320×192 narrow display'],
  [900, 540, '900×540 scaled display'],
]) {
  const checks = runGrid(width, height);
  console.log(`${label} → 1200×720 logical: ${checks}/15 grid positions`);
  const input = runInputRow(width, height);
  console.log(`  bottom-input probes: ${input.inputs}/9 accepted; 98%→${input.lastPercentY.toFixed(1)}, safe bottom→${input.safeBottomY.toFixed(1)}`);
}

// Prove raw CSS pixels are not used: at the 900×540 center, the logical point is 600×360.
const scaled = viewport(73, 41, 900, 540);
const center = clientToCanvasPoint(73 + 450, 41 + 270, scaled, LOGICAL_WIDTH, LOGICAL_HEIGHT);
assert.deepEqual(center, { x: 600, y: 360 });
assert.notDeepEqual(center, { x: 450, y: 270 }, 'test must fail for raw CSS-pixel mapping');
console.log('raw CSS pixels are rejected at center (expected 600×360, not 450×270)');

const zeroSize = clientToCanvasPoint(100, 100, viewport(0, 0, 0, 0), LOGICAL_WIDTH, LOGICAL_HEIGHT);
assert.deepEqual(zeroSize, { x: 0, y: 0 });
console.log('zero-sized/hidden viewport is handled safely');
console.log('PASS');
