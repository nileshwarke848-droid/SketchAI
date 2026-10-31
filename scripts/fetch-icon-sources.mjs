#!/usr/bin/env node
// Rebuilds the pinned open-source icon cache that the artwork generators read.
//
//   node scripts/fetch-icon-sources.mjs            # fetch whatever is missing
//   node scripts/fetch-icon-sources.mjs --force     # refetch everything
//   OSS_ICON_ROOT=/some/dir node scripts/fetch-icon-sources.mjs
//
// The libraries are NOT committed (they are ~94 MB of upstream SVGs and this
// repository ships only the extracted, normalised result in src/data/). Until now
// the only copy of that cache was whatever happened to be in /home/user/iconsrc,
// which made src/data/imported-art.js impossible to regenerate — and generated
// files do not survive a workspace reset. This script makes the artwork pipeline
// reproducible again: it pins the exact versions recorded in
// scripts/oss-art-sources.mjs and lays them out the way the generators expect.
//
// Every source is fetched from its official distribution channel: the npm registry
// for the five published packages, and the tagged GitHub archive for Iconoir (which
// publishes no npm package of its own). Nothing is scraped and nothing is invented.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SOURCES } from './oss-art-sources.mjs';

const ROOT = process.env.OSS_ICON_ROOT ?? '/home/user/iconsrc';
const FORCE = process.argv.includes('--force');

const expand = (template, version) => template.replaceAll('${version}', version);

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Materialise one source; returns the number of files placed. */
function fetchSource(id, meta) {
  const spec = meta.fetch ?? {};
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `iconsrc-${id}-`));
  let extracted = path.join(work, 'extract');
  try {
    if (spec.npm) {
      const pkg = `${spec.npm}@${meta.version}`;
      console.log(`  npm pack ${pkg}`);
      run('npm', ['pack', pkg, '--silent'], work);
      const tarball = fs.readdirSync(work).find((f) => f.endsWith('.tgz'));
      if (!tarball) throw new Error(`npm pack produced no tarball for ${pkg}`);
      fs.mkdirSync(extracted, { recursive: true });
      run('tar', ['xzf', path.join(work, tarball), '-C', extracted], work);
    } else if (spec.github) {
      const tag = expand(spec.tag ?? `v${meta.version}`, meta.version);
      const archive = path.join(work, 'source.tar.gz');
      const url = `https://codeload.github.com/${spec.github}/tar.gz/refs/tags/${tag}`;
      console.log(`  github ${spec.github}@${tag}`);
      run('curl', ['-fsSL', '-o', archive, url], work);
      fs.mkdirSync(extracted, { recursive: true });
      run('tar', ['xzf', archive, '-C', extracted], work);
    } else {
      throw new Error('no fetch spec (neither npm nor github)');
    }

    let placed = 0;
    for (const [from, to] of Object.entries(spec.paths ?? {})) {
      const src = path.join(extracted, expand(from, meta.version));
      const dest = path.join(ROOT, expand(to, meta.version));
      if (!fs.existsSync(src)) throw new Error(`${id}: expected ${from} inside the ${meta.version} archive`);
      fs.rmSync(dest, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (fs.statSync(src).isDirectory()) {
        fs.cpSync(src, dest, { recursive: true });
        placed = countFiles(dest);
      } else {
        placed = 1;
        fs.copyFileSync(src, dest);
      }
      console.log(`    -> ${path.relative(ROOT, dest)} (${placed} files)`);
    }
    return placed;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function countFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) n += countFiles(path.join(dir, entry.name));
    else n += 1;
  }
  return n;
}

fs.mkdirSync(ROOT, { recursive: true });
console.log(`Icon sources -> ${ROOT}\n`);
const failed = [];
let total = 0;
for (const [id, meta] of Object.entries(SOURCES)) {
  const present = path.join(ROOT, meta.dir);
  if (!FORCE && fs.existsSync(present)) {
    const n = fs.statSync(present).isDirectory() ? countFiles(present) : 1;
    console.log(`${id.padEnd(12)} ${meta.name} ${meta.version} — already present (${n} files), skipped`);
    total += n;
    continue;
  }
  console.log(`${id.padEnd(12)} ${meta.name} ${meta.version} (${meta.license})`);
  try {
    total += fetchSource(id, meta);
  } catch (error) {
    failed.push(id);
    console.error(`    ✖ ${error.message}`);
  }
}

if (failed.length) {
  console.error(`\n✖ ${failed.length} source(s) failed: ${failed.join(', ')}`);
  console.error('  The generators will refuse to run against a partial cache.');
  process.exit(1);
}
console.log(`\n✔ icon cache ready — ${total} files across ${Object.keys(SOURCES).length} libraries`);
console.log('  Next: node scripts/build-oss-art.mjs && node scripts/build-oss-art-variants.mjs');
