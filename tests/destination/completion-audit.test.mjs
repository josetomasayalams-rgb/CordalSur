import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { LANDING_ROOT, WORKER_ROOT } from '../../scripts/destination/paths.mjs';
import { isDirectRouteUrl } from '../../scripts/destination/providers/editorial.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SITE = LANDING_ROOT;
const guide = JSON.parse(fs.readFileSync(path.join(SITE, 'data/destination-guide.json'), 'utf8'));
const nearbyHtml = fs.readFileSync(path.join(SITE, 'cerca-de-mi.html'), 'utf8');
const nearbyJs = fs.readFileSync(path.join(SITE, 'js/nearby.js'), 'utf8');
const activitiesHtml = fs.readFileSync(path.join(SITE, 'actividades.html'), 'utf8');
const provisionsHtml = fs.readFileSync(path.join(SITE, 'restaurantes.html'), 'utf8');
const locationController = fs.readFileSync(path.join(SITE, 'js/location-controller.js'), 'utf8');
const worker = fs.readFileSync(path.join(WORKER_ROOT, 'src/index.js'), 'utf8');
const report = fs.readFileSync(path.join(ROOT, 'docs/reports/destination-guide-coverage-2026-07-17.md'), 'utf8');

const LODGING_CATEGORIES = new Set(['hotel', 'cabin']);
const ACTIVITY_CATEGORIES = new Set(['tourism', 'thermal_baths', 'ski', 'trail', 'adventure']);
const EXPLORE_QUICK_CATEGORIES = new Set([
  'restaurant', 'coffee', 'fast_food', 'bakery', 'supermarket', 'convenience', 'hardware',
  'home_improvement', 'pharmacy', 'medical', 'veterinary', 'gas_station', 'bank', 'atm',
  'laundry', 'shopping', 'vehicle_service', 'emergency'
]);

function catalogCardIds(html) {
  return [...html.matchAll(/<article\b[^>]*class="[^"]*\bcatalog-card\b[^"]*"[^>]*>/g)]
    .map((match) => match[0].match(/data-id="([^"]+)"/)?.[1])
    .filter(Boolean);
}

function assertSameIds(actual, expected, label) {
  assert.equal(new Set(actual).size, actual.length, `${label} repeats card ids`);
  assert.deepEqual([...actual].sort(), [...expected].sort(), `${label} does not match its source catalog`);
}

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
    if (place.instagram) assert.ok(['osm_contact_tag', 'manual_verified_override', 'editorial_verified_profile'].includes(place.instagram.verifiedBy), `${place.id} has unverified Instagram`);
    if (place.googleRating) assert.equal(place.googleRating.provider, 'google');
    if (place.tripadvisorRating) assert.equal(place.tripadvisorRating.provider, 'tripadvisor');
  }
  assert.ok(guide.categories.some((category) => category.id === 'other' && category.count > 0));
  assert.ok(guide.offerings.length >= 50);
  assert.ok(guide.routes.length >= 50);
  assert.ok(guide.routes.every((route) => route.navigationAvailable === false && route.navigationUrl == null));
  const directOfferings = guide.offerings.filter((offering) => offering.routeUrl);
  const directRoutes = guide.routes.filter((route) => route.routeUrl);
  assert.ok(directOfferings.length >= 10);
  assert.ok(directRoutes.length >= 10);
  for (const item of [...directOfferings, ...directRoutes]) {
    assert.equal(item.routeAccess?.status, 'verified-direct', `${item.id} has a route URL without verified direct access`);
    assert.equal(item.routeAccess?.url, item.routeUrl, `${item.id} has mixed route URLs`);
    assert.ok(isDirectRouteUrl(item.routeUrl), `${item.id} points to a generic route page`);
  }
  assert.ok(Array.isArray(guide.catalogEntries) && guide.catalogEntries.length >= 17);
  const knownIds = new Set(guide.places.map((place) => place.id));
  for (const entry of guide.catalogEntries) {
    assert.ok(entry.id && !knownIds.has(entry.id), `${entry.id} collides with a place id`);
    knownIds.add(entry.id);
    assert.ok(['activities', 'provisions'].includes(entry.catalog), `${entry.id} has an invalid catalog`);
    assert.equal(entry.routingEligible, false, `${entry.id} must not imply a verified location`);
    assert.ok(entry.sources?.length, `${entry.id} lacks research provenance`);
    if (entry.routeAccess?.url) {
      assert.equal(entry.routeAccess.status, 'verified-direct', `${entry.id} has an unverified route action`);
      assert.ok(isDirectRouteUrl(entry.routeAccess.url), `${entry.id} points to a generic route page`);
    }
  }
});

test('completion audit: Explora and the broad catalogs have distinct, complete source sets', () => {
  for (const category of EXPLORE_QUICK_CATEGORIES) assert.ok(nearbyJs.includes(`${category}: true`), `Explora omits ${category}`);
  for (const category of [...ACTIVITY_CATEGORIES, ...LODGING_CATEGORIES]) assert.ok(!EXPLORE_QUICK_CATEGORIES.has(category));
  assert.ok(nearbyJs.includes('Boolean(EXPLORE_QUICK_CATEGORIES[place.category])'));
  assert.ok(nearbyJs.includes("place.routingEligible !== false && place.status !== 'candidate_coordinate'"));

  const nonLodgingPlaces = guide.places.filter((place) => !LODGING_CATEGORIES.has(place.category));
  const quickPlaces = nonLodgingPlaces.filter((place) => EXPLORE_QUICK_CATEGORIES.has(place.category) && place.routingEligible !== false && place.status !== 'candidate_coordinate');
  const provisionPlaces = nonLodgingPlaces.filter((place) => !ACTIVITY_CATEGORIES.has(place.category));
  const activityOfferings = guide.offerings.filter((offering) => offering.status === 'published');
  const provisionEntries = guide.catalogEntries.filter((entry) => entry.catalog === 'provisions');
  const activityEntries = guide.catalogEntries.filter((entry) => entry.catalog === 'activities');

  assert.ok(quickPlaces.length >= 60);
  assert.ok(quickPlaces.every((place) => !ACTIVITY_CATEGORIES.has(place.category) && !LODGING_CATEGORIES.has(place.category)));
  assert.ok(provisionPlaces.some((place) => place.routingEligible === false), 'the broad provisions catalog lost pending-location entries');
  assert.ok(activityOfferings.length >= 50);
  assert.ok(activityEntries.length >= 10);
  assert.ok(provisionEntries.length >= 3);
  assertSameIds(catalogCardIds(provisionsHtml), [...provisionPlaces.map((place) => place.id), ...provisionEntries.map((entry) => entry.id)], 'Comida y provisiones');
  assertSameIds(catalogCardIds(activitiesHtml), [...activityOfferings.map((offering) => `offering-${offering.id}`), ...activityEntries.map((entry) => entry.id)], 'Actividades');
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
  for (const action of ['category', 'location', 'website', 'instagram', 'closed', 'merge', 'add']) assert.ok(worker.includes(`'${action}'`));
  assert.ok(worker.includes('/admin/place-overrides'));
  assert.ok(fs.existsSync(path.join(WORKER_ROOT, 'migrations/0002_place_overrides.sql')));
});

test('completion audit: final report includes required coverage evidence', () => {
  for (const heading of ['Cobertura por proveedor', 'Cobertura por categoría', 'Catálogos para huéspedes', 'Rendimiento de la sincronización', 'Limitaciones', 'Inventario completo publicado']) assert.ok(report.includes(heading));
  assert.ok(report.includes(`**${guide.meta.statistics.rawRecords} registros brutos**`));
  assert.ok(report.includes(`**${guide.meta.statistics.duplicatesMerged} duplicados fusionados**`));
  assert.ok(report.includes(`**${guide.catalogEntries.length} entradas investigadas**`));
});
