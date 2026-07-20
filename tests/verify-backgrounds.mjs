import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_ROOT = path.join(ROOT, 'assets/backgrounds/v1');
const script = fs.readFileSync(path.join(ROOT, 'js/backgrounds.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(script, context);
const catalog = context.CordalSurBackgrounds;

function uint32(buffer, offset, littleEndian = false) {
  return littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
}

function jpegDimensions(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    const size = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return [buffer.readUInt16BE(offset + 7), buffer.readUInt16BE(offset + 5)];
    }
    offset += 2 + size;
  }
  throw new Error('JPEG dimensions not found');
}

function webpDimensions(buffer) {
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8X') {
    return [1 + buffer.readUIntLE(24, 3), 1 + buffer.readUIntLE(27, 3)];
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  throw new Error(`unsupported WebP chunk ${chunk}`);
}

function avifDimensions(buffer) {
  const marker = buffer.indexOf(Buffer.from('ispe'));
  if (marker < 0) throw new Error('AVIF ispe box not found');
  return [uint32(buffer, marker + 8), uint32(buffer, marker + 12)];
}

function dimensions(buffer, extension) {
  if (extension === 'jpg') return jpegDimensions(buffer);
  if (extension === 'webp') return webpDimensions(buffer);
  return avifDimensions(buffer);
}

const budgets = {
  desktop: { jpg: 550 * 1024, webp: 380 * 1024, avif: 260 * 1024 },
  mobile: { jpg: 450 * 1024, webp: 320 * 1024, avif: 220 * 1024 }
};
const expectedDimensions = { desktop: [1600, 1000], mobile: [900, 1600] };

assert.equal(Object.keys(catalog.SCENES).length, 12, 'catalog must contain twelve scenes');
for (const scene of Object.values(catalog.SCENES)) {
  for (const viewport of ['desktop', 'mobile']) {
    for (const extension of ['avif', 'webp', 'jpg']) {
      const file = path.join(ASSET_ROOT, `${scene.stem}-${viewport}.${extension}`);
      assert.ok(fs.existsSync(file), `missing ${path.basename(file)}`);
      const buffer = fs.readFileSync(file);
      assert.ok(buffer.length <= budgets[viewport][extension], `${path.basename(file)} exceeds its weight budget`);
      assert.deepEqual(dimensions(buffer, extension), expectedDimensions[viewport], `${path.basename(file)} dimensions`);
      if (extension === 'jpg') assert.equal(buffer.subarray(0, 3).toString('hex'), 'ffd8ff');
      if (extension === 'webp') assert.equal(buffer.toString('ascii', 0, 4) + buffer.toString('ascii', 8, 12), 'RIFFWEBP');
      if (extension === 'avif') assert.equal(buffer.toString('ascii', 4, 12), 'ftypavif');
    }
  }
}

const publishedAssets = fs.readdirSync(ASSET_ROOT).filter((file) => /\.(?:avif|webp|jpg)$/.test(file));
assert.equal(publishedAssets.length, 72, 'collection must publish exactly 72 optimized assets');

const guestPages = [
  'index.html', 'check-in.html', 'check-out.html', 'restaurantes.html', 'actividades.html',
  'clima.html', 'tickets.html', 'instrucciones.html', 'botiquin.html', 'buggy.html', 'cerca-de-mi.html'
];
for (const page of guestPages) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  assert.ok(html.includes('css/backgrounds.css?v=1'), `${page} missing background styles`);
  assert.ok(html.includes('js/backgrounds.js?v=3'), `${page} missing background controller`);
  assert.ok(html.indexOf('js/access.js?v=4') < html.indexOf('js/backgrounds.js?v=3'), `${page} must load access before backgrounds`);
  assert.doesNotMatch(html, /<link[^>]+rel="preload"[^>]+as="image"/i, `${page} must not fetch a photo before access`);
  assert.doesNotMatch(html, /css\/bg|\bbg-(?:home|checkin|checkout|clima|tickets|instrucciones|restaurantes|actividades)\b/);
}
const admin = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
assert.ok(!admin.includes('backgrounds.css') && !admin.includes('backgrounds.js'), 'admin access must stay neutral');

console.log('  PASS (12 scenes, 72 responsive assets, budgets and access-gated loading)');

