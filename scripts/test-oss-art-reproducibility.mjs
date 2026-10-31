#!/usr/bin/env node
// Reconstruct the pinned artwork generators from a fresh cache, then require
// byte-identical primary/credit and Batch-2/3 variant outputs.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = fs.mkdtempSync(path.join(os.tmpdir(), 'sketchai-cold-iconsrc-'));
const FILES = [
  'src/data/imported-art.js',
  'scripts/oss-art-credits.json',
  'src/data/imported-art-variants-batch2.js',
  'scripts/oss-art-variant-credits-batch2.json',
  'src/data/imported-art-variants-batch3.js',
  'scripts/oss-art-variant-credits-batch3.json',
];
const before = new Map(FILES.map((file) => [file, fs.readFileSync(path.join(ROOT, file))]));
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const env = { ...process.env, OSS_ICON_ROOT: CACHE };

function run(args) {
  const output = execFileSync(process.execPath, args, { cwd: ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const lines = output.trim().split(/\r?\n/);
  console.log(lines.slice(-5).join('\n'));
}

try {
  console.log(`Fresh pinned-source cache: ${CACHE}`);
  if (fs.readdirSync(CACHE).length) throw new Error('Cold cache directory was not empty.');
  run(['scripts/fetch-icon-sources.mjs', '--force']);
  run(['scripts/build-oss-art.mjs']);
  run(['scripts/build-oss-art-variants-batch.mjs', '--batch=2']);
  run(['scripts/build-oss-art-variants-batch.mjs', '--batch=3']);

  const mismatches = [];
  for (const file of FILES) {
    const current = fs.readFileSync(path.join(ROOT, file));
    const expected = before.get(file);
    const expectedHash = digest(expected);
    const actualHash = digest(current);
    const same = expectedHash === actualHash;
    console.log(`${same ? 'PASS' : 'FAIL'} ${file} ${actualHash}`);
    if (!same) mismatches.push({ file, expected, expectedHash, actualHash });
  }
  if (mismatches.length) {
    for (const { file, expected } of mismatches) fs.writeFileSync(path.join(ROOT, file), expected);
    throw new Error(`${mismatches.length} generated output(s) were not byte-identical; originals restored.`);
  }
  console.log('Cold-cache source reconstruction and import/variant reproducibility: PASS');
} finally {
  fs.rmSync(CACHE, { recursive: true, force: true });
}
