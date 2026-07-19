import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { LANDING_ROOT } from '../../scripts/destination/paths.mjs';

const SITE = LANDING_ROOT;
const read = (name) => fs.readFileSync(path.join(SITE, name));

function webpInfo(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP');
  assert.equal(buffer.toString('ascii', 12, 16), 'VP8X');
  const uint24 = (offset) => buffer[offset] | buffer[offset + 1] << 8 | buffer[offset + 2] << 16;
  return { alpha: Boolean(buffer[20] & 0x10), width: uint24(24) + 1, height: uint24(27) + 1 };
}

test('Instagram theme variants are distinct transparent 384px WebP assets', () => {
  const light = read('assets/home-icons/instagram-light.webp');
  const dark = read('assets/home-icons/instagram-dark.webp');
  assert.deepEqual(webpInfo(light), { alpha: true, width: 384, height: 384 });
  assert.deepEqual(webpInfo(dark), { alpha: true, width: 384, height: 384 });
  assert.notDeepEqual(light, dark);
  const home = read('index.html').toString();
  assert.match(home, /data-src-light="assets\/home-icons\/instagram-light\.webp"/);
  assert.match(home, /data-src-dark="assets\/home-icons\/instagram-dark\.webp"/);
});

test('guest pages use shared GPS and expose a truthful direct-distance fallback', () => {
  const pages = ['cerca-de-mi.html', 'restaurantes.html', 'actividades.html'];
  for (const page of pages) {
    assert.match(read(page).toString(), /js\/road-distance\.js/);
    assert.match(read(page).toString(), /js\/location-controller\.js/);
  }
  assert.match(read('js/nearby.js').toString(), /direct-current/);
  assert.match(read('js/catalog-guide.js').toString(), /direct-current/);
  assert.match(read('js/lang.js').toString(), /en línea recta/);
  const catalog = read('js/catalog-guide.js').toString();
  assert.match(catalog, /data-apartment-distance/);
  assert.match(catalog, /routeFrom/);
  assert.match(catalog, /outside-network/);
  assert.match(catalog, /pagehide/);
});

test('unverified locality centers remain visible without masquerading as road destinations', () => {
  const generator = read('scripts/apply-host-data.mjs').toString();
  const catalog = read('js/catalog-guide.js').toString();
  const nearby = read('js/nearby.js').toString();
  const hostData = JSON.parse(read('data/host-data.json').toString());
  const pending = hostData.scalar['guide.coordinate.pendingLocation'];

  assert.deepEqual(pending, {
    es: 'Ubicación exacta por confirmar',
    pt: 'Localização exata por confirmar',
    en: 'Exact location to be confirmed'
  });
  assert.match(generator, /data-routing-eligible=/);
  assert.match(generator, /data-coordinate-precision=/);
  assert.match(generator, /sortableRoadDistance/);
  assert.match(catalog, /function isRoutingEligible\(card\)/);
  assert.match(catalog, /data-apartment-distance-source/);
  assert.match(catalog, /sector-current/);
  assert.match(catalog, /guide\.distance\.sector/);
  assert.match(catalog, /if \(!isRoutingEligible\(card\)\) \{\s*setDistance\(card, \{ meters: null, source: 'unknown'/);
  assert.match(catalog, /if \(!Number\.isFinite\(meters\)\) \{[\s\S]*?guide\.road\.unavailable/);
  assert.match(nearby, /function isRoutingEligible\(place\)/);
  assert.match(nearby, /filteredPlaces\.filter\(isRoutingEligible\)/);
  assert.match(nearby, /if \(!isRoutingEligible\(place\)\) \{[\s\S]*?_roadDistanceMeters = NaN/);
});

test('preference surface and public controls remain rounded and mobile-safe', () => {
  const css = read('css/styles.css').toString();
  assert.match(css, /\.preference-bar,[\s\S]*?border-radius:\s*999px;[\s\S]*?clip-path:\s*inset\(0 round 999px\)/);
  assert.match(css, /\.theme-selector button,[\s\S]*?display:\s*grid;[\s\S]*?place-items:\s*center;[\s\S]*?padding:\s*0/);
  assert.match(css, /\.catalog-filters::\-webkit-scrollbar\s*\{\s*display:\s*none/);
  assert.match(css, /\.catalog-origin__button[\s\S]*?min-height:\s*44px/);
});

test('latest route request invalidates older Worker responses', () => {
  const source = read('js/road-distance.js').toString();
  assert.match(source, /var request = \+\+latestRouteRequest/);
  assert.match(source, /request !== latestRouteRequest/);
  assert.match(source, /stale:\s*true/);
});
