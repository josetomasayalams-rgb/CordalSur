import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(SITE, name));
const info = (buffer) => {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP');
  assert.equal(buffer.toString('ascii', 12, 16), 'VP8X');
  const uint24 = (offset) => buffer[offset] | buffer[offset + 1] << 8 | buffer[offset + 2] << 16;
  return { alpha: Boolean(buffer[20] & 0x10), width: uint24(24) + 1, height: uint24(27) + 1 };
};

const light = read('assets/home-icons/instagram-light.webp');
const dark = read('assets/home-icons/instagram-dark.webp');
assert.deepEqual(info(light), { alpha: true, width: 384, height: 384 });
assert.deepEqual(info(dark), { alpha: true, width: 384, height: 384 });
assert.notDeepEqual(light, dark);

for (const page of ['cerca-de-mi.html', 'restaurantes.html', 'actividades.html']) {
  assert.match(read(page).toString(), /js\/road-distance\.js/);
}
for (const file of ['js/nearby.js', 'js/catalog-guide.js', 'js/lang.js']) {
  assert.doesNotMatch(read(file).toString(), /straightLine|en línea recta|em linha reta|straight line/i);
}
const styles = read('css/styles.css').toString();
assert.match(styles, /\.preference-bar,[\s\S]*?border-radius:\s*30px;[\s\S]*?clip-path:\s*inset\(0 round 30px\)/);
assert.match(styles, /\.catalog-filters::\-webkit-scrollbar\s*\{\s*display:\s*none/);
console.log('  PASS (local road UI, transparent Instagram themes and rounded preference surface)');
