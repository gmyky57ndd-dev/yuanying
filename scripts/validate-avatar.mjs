#!/usr/bin/env node
/**
 * Validate a Live2D runtime package against the delivery contract.
 *
 *   npm run avatar:validate -- /path/to/xiaowu.zip
 *   npm run avatar:validate -- /path/to/extracted/xiaowu
 *
 * Read-only: extracts a zip to a temp dir, checks structure and budgets, prints
 * PASS/FAIL lines, exits non-zero on any failure. No third-party dependencies.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REQUIRED = ['model3.json', 'moc3'];
const MOTION_GROUPS = ['idle', 'talk'];
const MAX_TEXTURE = 2048;
const MAX_TEXTURES = 4;
const MAX_TEXTURE_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 30;

const failures = [];
const notes = [];
const ok = (m) => console.log(`PASS  ${m}`);
const bad = (m) => { failures.push(m); console.log(`FAIL  ${m}`); };
const note = (m) => { notes.push(m); console.log(`NOTE  ${m}`); };

function pngSize(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const b = Buffer.alloc(24);
    fs.readSync(fd, b, 0, 24, 0);
    if (b.toString('ascii', 1, 4) !== 'PNG') return null;
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  } finally { fs.closeSync(fd); }
}

function relativeSafe(p) {
  return typeof p === 'string' && p.length > 0 &&
    !p.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(p) && !p.split(/[\\/]/).includes('..');
}

const arg = process.argv[2];
if (!arg) {
  console.error('usage: npm run avatar:validate -- <zip-or-directory>');
  process.exit(2);
}

let root = arg;
let tmp = null;
if (fs.statSync(arg).isFile()) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yy-avatar-'));
  try {
    execFileSync('unzip', ['-q', '-o', arg, '-d', tmp]);
  } catch (e) {
    console.error('could not unzip the archive:', e.message);
    process.exit(2);
  }
  const dirs = fs.readdirSync(tmp, { withFileTypes: true }).filter(d => d.isDirectory());
  root = dirs.length === 1 ? path.join(tmp, dirs[0].name) : tmp;
}

const all = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else all.push(full);
  }
})(root);

const rel = (f) => path.relative(root, f).split(path.sep).join('/');
const name = path.basename(root);
console.log(`package: ${name}  (${root})`);
console.log(`files: ${all.length}`);

if (name === '' || name === path.basename(os.tmpdir())) note('top-level folder should be the fenshen id, e.g. xiaowu/');
if (all.length > MAX_FILES) bad(`file count ${all.length} > ${MAX_FILES}`); else ok(`file count ${all.length} ≤ ${MAX_FILES}`);

const modelFile = all.find(f => f.endsWith('.model3.json'));
if (!modelFile) {
  bad('missing *.model3.json');
} else {
  ok(`manifest: ${rel(modelFile)}`);
  const manifest = JSON.parse(fs.readFileSync(modelFile, 'utf8'));
  const refs = manifest?.FileReferences ?? {};
  if (!refs.Moc) bad('FileReferences.Moc missing');
  if (!Array.isArray(refs.Textures) || refs.Textures.length === 0) bad('FileReferences.Textures missing');
  else if (refs.Textures.length > MAX_TEXTURES) bad(`texture count ${refs.Textures.length} > ${MAX_TEXTURES}`);
  const motionKeys = Object.keys(refs.Motions ?? {});
  for (const g of MOTION_GROUPS) {
    if (!motionKeys.includes(g)) bad(`motion group '${g}' missing (found: ${motionKeys.join(', ') || 'none'})`);
  }
  for (const [group, list] of Object.entries(refs.Motions ?? {})) {
    if (!Array.isArray(list) || list.length === 0) bad(`motion group '${group}' is empty`);
  }

  const referenced = [
    refs.Moc,
    ...(refs.Textures ?? []),
    ...(refs.Physics ? [refs.Physics] : []),
    ...(refs.Pose ? [refs.Pose] : []),
    ...(refs.Expressions ? Object.values(refs.Expressions).map(e => e?.File) : []),
    ...Object.values(refs.Motions ?? {}).flat().map(m => m?.File),
  ].filter(Boolean);

  for (const r of referenced) {
    if (!relativeSafe(r)) bad(`unsafe/absolute path in manifest: ${r}`);
    const target = path.join(path.dirname(modelFile), r);
    if (!fs.existsSync(target)) bad(`referenced file missing: ${r}`);
  }
  if (!failures.some(f => f.startsWith('unsafe') || f.startsWith('referenced'))) {
    ok(`all ${referenced.length} manifest references resolve with relative paths`);
  }

  const textureBytes = (refs.Textures ?? [])
    .map(t => path.join(path.dirname(modelFile), t))
    .filter(f => fs.existsSync(f))
    .reduce((n, f) => n + fs.statSync(f).size, 0);
  if (textureBytes > MAX_TEXTURE_BYTES) bad(`texture bytes ${(textureBytes / 1048576).toFixed(1)} MB > 8 MB`);
  else ok(`texture bytes ${(textureBytes / 1048576).toFixed(1)} MB ≤ 8 MB`);

  for (const t of refs.Textures ?? []) {
    const f = path.join(path.dirname(modelFile), t);
    if (!fs.existsSync(f)) continue;
    const size = pngSize(f);
    if (!size) { bad(`not a PNG: ${t}`); continue; }
    if (size.width > MAX_TEXTURE || size.height > MAX_TEXTURE) {
      bad(`${t} is ${size.width}×${size.height}, max ${MAX_TEXTURE}`);
    }
  }
}

for (const ext of REQUIRED) {
  if (ext === 'model3.json') continue;
  if (!all.some(f => f.endsWith(`.${ext}`))) bad(`missing *.${ext}`);
}

const metaCandidates = ['release.json', 'version.txt'].map(f => path.join(root, f)).filter(fs.existsSync);
if (metaCandidates.length === 0) {
  bad('missing release metadata (release.json or version.txt)');
} else {
  const raw = fs.readFileSync(metaCandidates[0], 'utf8');
  const json = metaCandidates[0].endsWith('.json') ? JSON.parse(raw) : null;
  const has = (k) => json ? Object.prototype.hasOwnProperty.call(json, k) : new RegExp(`^${k}\\s*:`, 'mi').test(raw);
  const wanted = ['editor', 'moc3', 'core', 'sdk', 'sha256'];
  const missing = wanted.filter(k => !has(k));
  if (missing.length) bad(`release metadata missing: ${missing.join(', ')}`);
  else ok('release metadata present (editor / moc3 / core / sdk / sha256)');
}

console.log('');
if (failures.length) {
  console.log(`RESULT: FAIL (${failures.length} problem${failures.length === 1 ? '' : 's'})`);
  process.exit(1);
}
console.log('RESULT: PASS — package satisfies the delivery contract.');
