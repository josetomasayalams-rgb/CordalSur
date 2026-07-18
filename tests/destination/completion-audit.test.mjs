import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { LANDING_ROOT, WORKER_ROOT } from '../../scripts/destination/paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SITE = LANDING_ROOT;
const guide = JSON.parse(fs.readFileSync(path.join(SITE, 'data/destination-guide.json'), 'utf8'));
const nearbyHtml = fs.readFileSync(path.join(SITE, 'cerca-de-mi.html'), 'utf8');
const nearbyJs = fs.readFileSync(path.join(SITE, 'js/nearby.js'), 'utf8');
const locationController = fs.readFileSync(path.join(SITE, 'js/location-controller.js'), 'utf8');
const worker = fs.readFileSync(path.join(WORKER_ROOT, 'src/index.js'), 'utf8');
const report = fs.readFileSync(path.join(ROOT, 'docs/reports/destination-guide-coverage-2026-07-17.md'), 'utf8');

test('completion audit: all geographic discovery modes have authoritative evidence', () => {
  assert.equal(guide.geometry.apartment.radiusMethod, 'haversine-wgs84');
  assert.equal(guide.geometry.apartment.anchorInsideBoundary, true);
  assert.ok(guide.geometry.apartment.radiusMeters > 22_000);
  assert.equal(guide.geometry.corridor.routeRef, 'N-55');
  assert.ok(guide.geometry.corridor.geometry.coordinates.length > 20);
  assert.ok(guide.geometry.corridor.bufferGeometry.coordinates[0].length > 40);
  assert.ok(guide.geometry.tiles.apartment.length > 20);
  assert.ok(guide.geometry.tiles.corridor.length > 20);
  assert.ok(guide.places.some((place) => place.legacyId === 'los-pincheiras-restaurant' && place.discovery.apartment));
  assert.ok(guide.places.some((place) => place.discovery.apartment));
  assert.ok(guide.places.some((place) => place.discovery.corridor));
  for (const mode of ['apartment', 'nearby', 'route']) assert.ok(nearbyHtml.includes(`data-guide-mode="${mode}"`));
  assert.ok(nearbyHtml.includes('id="guide-route-featured"'));
});

test('completion audit: discovery, enrichment and deduplication meet the production contract', () => {
  assert.ok(guide.places.length >= 200);
  assert.ok(guide.meta.statistics.rawRecords > guide.places.length);
  assert.ok(guide.meta.statistics.duplicatesMerged > 0);
  assert.ok(guide.mergeAudit.length > 0);
  for (const provider of ['manual', 'editorial', 'osm', 'google', 'tripadvisor']) assert.ok(guide.providers.some((item) => item.id === provider));
  assert.ok(guide.providers.find((item) => item.id === 'osm').enabled);
  assert.ok(guide.places.some((place) => new Set(place.sources.map((source) => source.provider)).size > 1));
  for (const place of guide.places) {
    assert.ok(place.navigationUrl, `${place.id} lacks navigation`);
    assert.ok(place.googleMapsUrl, `${place.id} lacks Google Maps`);
    assert.ok(place.sources.length, `${place.id} lacks provenance`);
    if (place.instagram) assert.ok(['osm_contact_tag', 'manual_verified_override'].includes(place.instagram.verifiedBy), `${place.id} has unverified Instagram`);
    if (place.googleRating) assert.equal(place.googleRating.provider, 'google');
    if (place.tripadvisorRating) assert.equal(place.tripadvisorRating.provider, 'tripadvisor');
  }
  assert.ok(guide.categories.some((category) => category.id === 'other' && category.count > 0));
  assert.ok(guide.offerings.length >= 50);
  assert.ok(guide.routes.length >= 50);
  assert.ok(guide.routes.every((route) => route.navigationAvailable === false && route.navigationUrl == null));
});

test('completion audit: map, search, privacy and administration surfaces are implemented', () => {
  for (const token of ['lineProjection', 'markerCluster', "sort.value === 'rating'", "sort.value === 'popularity'", 'CordalLocationController.create', 'applyDirectDistances', 'manualSelecting']) assert.ok(nearbyJs.includes(token));
  for (const token of ['geolocation.watchPosition', 'geolocation.clearWatch', 'ONCE_DEADLINE_MS = 20000', 'REROUTE_DISTANCE_METERS = 25']) assert.ok(locationController.includes(token));
  assert.ok(!/localStorage\.(?:getItem|setItem)/.test(nearbyJs + locationController));
  assert.ok(nearbyJs.includes("mode === 'nearby' || mode === 'route') return userPosition"));
  assert.ok(!nearbyJs.includes('ruralStart'));
  assert.ok(nearbyJs.includes('showBehind.checked'));
  assert.ok(nearbyHtml.includes('id="guide-map-canvas"'));
  assert.ok(nearbyHtml.includes('leaflet.markercluster.js'));
  for (const choice of ['once', 'session', 'manual', 'none']) assert.ok(nearbyHtml.includes(`data-location-choice="${choice}"`));
  const publicApartment = guide.places.filter((place) => place.discovery.apartment && !['hotel', 'cabin'].includes(place.category));
  const activityCategories = new Set(['tourism', 'thermal_baths', 'ski', 'trail', 'adventure']);
  const activityCount = publicApartment.filter((place) => activityCategories.has(place.category)).length;
  const provisionCount = publicApartment.filter((place) => !activityCategories.has(place.category)).length;
  assert.ok(publicApartment.length >= 110);
  assert.equal(activityCount + provisionCount, publicApartment.length);
  for (const action of ['category', 'location', 'website', 'instagram', 'closed', 'merge', 'add']) assert.ok(worker.includes(`'${action}'`));
  assert.ok(worker.includes('/admin/place-overrides'));
  assert.ok(fs.existsSync(path.join(WORKER_ROOT, 'migrations/0002_place_overrides.sql')));
});

test('completion audit: final report includes required coverage evidence', () => {
  for (const heading of ['Cobertura por proveedor', 'Cobertura por categoría', 'Rendimiento de la sincronización', 'Limitaciones', 'Inventario completo publicado']) assert.ok(report.includes(heading));
  assert.ok(report.includes(`**${guide.meta.statistics.rawRecords} registros brutos**`));
  assert.ok(report.includes(`**${guide.meta.statistics.duplicatesMerged} duplicados fusionados**`));
});
