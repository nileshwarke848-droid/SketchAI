#!/usr/bin/env node
// Runs every unit suite in scripts/test-*.mjs plus the end-to-end app audit.
//
//   npm test
//
// Why this exists: the suites were only ever run by hand, one file at a time, so a
// regression in a single behaviour (the lasso closure bug, for example) could sit
// unnoticed until someone tried it in the browser. Wiring them into `npm test`
// means one command, one exit code.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_DIR = path.join(ROOT, 'scripts');

const unitSuites = fs
  .readdirSync(SCRIPT_DIR)
  .filter((name) => name.startsWith('test-') && name.endsWith('.mjs'))
  .sort()
  .map((name) => path.join('scripts', name));

const suites = [...unitSuites, path.join('scripts', 'audit-app.mjs')];
const only = process.argv[2] ? suites.filter((suite) => suite.includes(process.argv[2])) : suites;

if (!only.length) {
  console.error(`No suite matches "${process.argv[2]}".`);
  process.exit(1);
}

console.log(`Running ${only.length} suites\n`);
let failed = 0;

for (const suite of only) {
  const started = Date.now();
  const result = spawnSync(process.execPath, [suite], { cwd: ROOT, encoding: 'utf8' });
  const elapsed = String(Date.now() - started).padStart(6);
  const ok = result.status === 0;
  if (!ok) failed += 1;

  const stdout = (result.stdout ?? '').trim();
  const stderr = (result.stderr ?? '').trim();
  const lastLine = ok
    ? stdout.split('\n').filter(Boolean).pop() ?? 'ok'
    : stderr.split('\n').slice(-8).join('\n');

  console.log(`${ok ? '✔' : '✘'} ${suite.padEnd(42)} ${elapsed} ms  ${ok ? lastLine.slice(0, 90) : ''}`);
  if (!ok) console.log(`\n${lastLine}\n`);
}

console.log(`\n${only.length - failed}/${only.length} suites passed`);
process.exit(failed ? 1 : 0);
