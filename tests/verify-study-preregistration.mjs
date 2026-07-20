import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPreregistrationManifest } from '../scripts/build-study-preregistration.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const first = buildPreregistrationManifest(ROOT, { draft: true });
const second = buildPreregistrationManifest(ROOT, { draft: true });
const paths = new Set(first.files.map((file) => file.path));
const configText = fs.readFileSync(path.join(ROOT, 'research', 'study-config.json'), 'utf8');
const paletteData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'section-palettes.json'), 'utf8'));

assert.deepEqual(first, second);
assert.equal(first.schemaVersion, 1);
assert.equal(first.status, 'draft-not-ready');
assert.equal(first.instrument.confirmatoryReady, false);
assert.equal(first.fileCount, first.files.length);
assert.ok(first.fileCount > 80);
assert.match(first.configSha256, /^[a-f0-9]{64}$/);
assert.match(first.lockedTreeSha256, /^[a-f0-9]{64}$/);
assert.equal(
  first.configSha256,
  crypto.createHash('sha256').update(configText).digest('hex')
);

for (const definition of Object.values(paletteData.sections)) {
  assert.ok(paths.has(definition.page), `${definition.page} must be locked`);
}
for (const required of [
  'data/host-data.json',
  'data/section-palettes.json',
  'research/study-config.json',
  'research/randomization.csv',
  'research/participant-session.js',
  'research/session-recorder.js',
  'scripts/analyze-section-theme-study.mjs',
  'scripts/build-study-preregistration.mjs'
]) {
  assert.ok(paths.has(required), `${required} must be locked`);
}
assert.ok(first.files.some((file) => file.path.startsWith('assets/backgrounds/v1/') && file.path.endsWith('.webp')));
assert.ok(first.files.some((file) => file.path.startsWith('assets/brand/')));
assert.ok(first.files.every((file) => !file.path.includes('.DS_Store')));
assert.throws(
  () => buildPreregistrationManifest(ROOT),
  /Instrument is not ready/
);

console.log(`  PASS (${first.fileCount} locked files, deterministic tree hash and readiness guard)`);
