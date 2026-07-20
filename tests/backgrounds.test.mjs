import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'js/backgrounds.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context);
const backgrounds = context.CordalSurBackgrounds;

test('publishes the approved twelve-scene collection', () => {
  assert.equal(Object.keys(backgrounds.SCENES).length, 12);
  assert.deepEqual(
    Array.from(backgrounds.SECTION_SCENES.home),
    ['home-nevados', 'home-paine', 'home-osorno']
  );
  assert.equal(backgrounds.ROTATION_MS, 25000);
});

test('assigns one fixed scene to every internal section', () => {
  for (const section of ['checkin', 'checkout', 'clima', 'tickets', 'buggy', 'manual', 'botiquin', 'restaurantes', 'actividades', 'nearby']) {
    assert.equal(backgrounds.resolveScenes(section).length, 1, section);
  }
  assert.equal(backgrounds.SECTION_SCENES.manual[0], backgrounds.SECTION_SCENES.botiquin[0]);
  assert.equal(backgrounds.resolveScenes('unknown').length, 0);
});

test('stops rotation for reduced motion or Save-Data', () => {
  assert.equal(backgrounds.shouldAnimate({ reduceMotion: false, saveData: false }), true);
  assert.equal(backgrounds.shouldAnimate({ reduceMotion: true, saveData: false }), false);
  assert.equal(backgrounds.shouldAnimate({ reduceMotion: false, saveData: true }), false);
});

test('keeps image startup behind the access-granted contract', () => {
  assert.match(source, /classList\.contains\('access-granted'\)/);
  assert.match(source, /addEventListener\('cordal:access-granted', start\)/);
  assert.match(source, /addEventListener\('cordal:access-ended', stop\)/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /waitForImage\(prepared\.image\)/);
});

