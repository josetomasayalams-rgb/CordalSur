import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalCategory, categoryEntries } from '../../scripts/destination/taxonomy.mjs';
import { matchReason, mergePlaces, normalizeName, normalizePhone } from '../../scripts/destination/dedupe.mjs';
import { overpassTileQuery, OSM_USEFUL_TAGS } from '../../scripts/destination/providers/osm.mjs';
import { safeInstagram } from '../../scripts/destination/providers/common.mjs';
import { GOOGLE_FIELD_MASK, GOOGLE_NEARBY_TYPES, GOOGLE_TEXT_QUERIES } from '../../scripts/destination/providers/google.mjs';
import { TRIPADVISOR_API_ROOT } from '../../scripts/destination/providers/tripadvisor.mjs';
import { applyResearchedProfiles, isDirectRouteUrl, loadEditorialCatalog } from '../../scripts/destination/providers/editorial.mjs';
import { loadManualPlaces } from '../../scripts/destination/providers/manual.mjs';
import { applyPlaceOverrides, mergeOverrides, recordsFromAddOverrides } from '../../scripts/destination/overrides.mjs';
import path from 'node:path';
import { GOOGLE_DETAILS_FIELD_MASK } from '../../scripts/destination/providers/google.mjs';
import { directionFlags, impedanceRange, overpassQuery as drivingOverpassQuery, validateNetworkCandidate, validateOverpassPayload, wayProfile } from '../../scripts/destination/fetch-driving-network.mjs';
import { LANDING_ROOT } from '../../scripts/destination/paths.mjs';

const HOST_DATA = path.join(LANDING_ROOT, 'data/host-data.json');
const RESEARCH_CATALOG = path.join(LANDING_ROOT, 'data/researched-catalog.json');

test('canonical taxonomy covers required and unknown place types', () => {
  assert.equal(canonicalCategory({ amenity: 'restaurant' }), 'restaurant');
  assert.equal(canonicalCategory({ shop: 'hardware' }), 'hardware');
  assert.equal(canonicalCategory({ natural: 'hot_spring' }), 'thermal_baths');
  assert.equal(canonicalCategory({ leisure: 'sports_centre', sport: 'skiing' }), 'ski');
  assert.equal(canonicalCategory({ amenity: 'unknown_future_value' }), 'other');
  assert.ok(categoryEntries().length >= 25);
});

test('normalization handles Chilean phones, accents and generic words', () => {
  assert.equal(normalizeName('Restaurante Cabañas Los Hualles'), 'los hualles');
  assert.equal(normalizePhone('+56 9 1234 5678'), '56912345678');
  assert.equal(normalizePhone('9 1234 5678'), '56912345678');
});

test('deduplication merges strong identifiers and preserves provenance', () => {
  const records = [
    {
      id: 'osm-node-1', name: 'Café Valle', category: 'coffee', location: { lat: -36.8, lon: -71.6 }, coordinateKind: 'node',
      providerRefs: { osm: ['node/1'] }, phone: { value: '+56911112222', provider: 'osm' },
      sources: [{ provider: 'osm', id: 'node/1' }]
    },
    {
      id: 'google-place-1', name: 'Cafe Valle', category: 'coffee', location: { lat: -36.8001, lon: -71.6001 }, coordinateKind: 'entrance',
      providerRefs: { googlePlaceId: 'abc' }, phone: { value: '+56 9 1111 2222', provider: 'google' },
      website: { value: 'https://cafevalle.example', provider: 'google' }, sources: [{ provider: 'google', id: 'abc' }]
    }
  ];
  const merged = mergePlaces(records);
  assert.equal(merged.places.length, 1);
  assert.equal(merged.mergedCount, 1);
  assert.equal(merged.places[0].website.value, 'https://cafevalle.example');
  assert.deepEqual(merged.places[0].providerRefs.osm, ['node/1']);
  assert.equal(merged.audit[0].reason, 'phone_and_location');
});

test('nearby but different names remain distinct without explicit evidence', () => {
  const left = { id: 'a', name: 'Parque Aventura', category: 'adventure', location: { lat: -36.8, lon: -71.6 } };
  const right = { id: 'b', name: 'Hotel Termas', category: 'hotel', location: { lat: -36.80001, lon: -71.60001 } };
  assert.equal(matchReason(left, right).merge, false);
});

test('deduplication merges contained names at the same entrance across compatible categories', () => {
  const records = [
    { id: 'manual-bike', name: 'Bike Park Nevados', category: 'tourism', location: { lat: -36.90931, lon: -71.42309 }, sources: [{ provider: 'manual', id: 'bike' }] },
    { id: 'osm-bike', name: 'Bike Park Nevados de Chillán', category: 'adventure', location: { lat: -36.909311, lon: -71.423091 }, sources: [{ provider: 'osm', id: 'node/1' }] }
  ];
  const merged = mergePlaces(records);
  assert.equal(merged.places.length, 1);
  assert.equal(merged.audit[0].reason, 'name_containment_exact_location');
});

test('manual merge overrides can join known duplicate identifiers', () => {
  const records = [
    { id: 'a', name: 'Parque Las Turbinas', category: 'tourism', location: { lat: -36.9, lon: -71.5 }, sources: [{ provider: 'manual', id: 'a' }] },
    { id: 'b', name: 'Las Turbinas', category: 'tourism', location: { lat: -36.91, lon: -71.51 }, sources: [{ provider: 'osm', id: 'b' }] }
  ];
  const merged = mergePlaces(records, [{ action: 'merge', primaryId: 'a', secondaryId: 'b' }]);
  assert.equal(merged.places.length, 1);
  assert.equal(merged.audit[0].reason, 'manual_override');
});

test('Overpass discovery query is tiled and keeps the useful tag contract explicit', () => {
  const query = overpassTileQuery({ bbox: [-36.9, -71.6, -36.8, -71.5] });
  assert.match(query, /nwr\(-36\.9,-71\.6,-36\.8,-71\.5\)/);
  assert.match(query, /out meta center/);
  assert.ok(OSM_USEFUL_TAGS.amenity.includes('pharmacy'));
  assert.ok(OSM_USEFUL_TAGS.shop.includes('hardware'));
  assert.ok(OSM_USEFUL_TAGS.tourism.includes('hotel'));
});

test('driving graph honours motorcar access, directional overrides and road quality', () => {
  const query = drivingOverpassQuery();
  assert.match(query, /\["motorcar"!="no"\]\["motorcar"!="private"\]/);
  assert.equal(directionFlags({ oneway: 'yes', 'oneway:motorcar': 'no' }), 3);
  assert.equal(directionFlags({ junction: 'roundabout', oneway: 'no' }), 3);
  assert.equal(directionFlags({ 'oneway:motorcar': '-1' }), 2);
  assert.equal(directionFlags({ junction: 'roundabout' }), 1);
  assert.ok(wayProfile({ highway: 'track', surface: 'unpaved' }).impedanceFactor > wayProfile({ highway: 'service' }).impedanceFactor);
  assert.ok(wayProfile({ highway: 'service' }).impedanceFactor > wayProfile({ highway: 'primary', surface: 'asphalt' }).impedanceFactor);
  assert.ok(wayProfile({ highway: 'service', motorcar: 'destination' }).impedanceFactor > wayProfile({ highway: 'service' }).impedanceFactor);
  assert.equal(wayProfile({ highway: 'track', smoothness: 'impassable' }).traversable, false);
  assert.equal(wayProfile({ highway: 'service', 'motorcar:conditional': 'no @ (snow)' }).traversable, false);
});

test('driving graph generation rejects partial data and scales without argument overflow', () => {
  assert.throws(() => validateOverpassPayload({ remark: 'runtime error: Query timed out', elements: [], osm3s: { timestamp_osm_base: '2026-07-18T00:00:00Z' } }), /partial result/);
  assert.throws(() => validateNetworkCandidate({ schemaVersion: 2, networkHash: 'a'.repeat(64), statistics: { nodes: 100, segments: 100, destinations: 10, snappedDestinations: 2 } }), /production floor/);
  assert.deepEqual(impedanceRange(Array.from({ length: 130001 }, (_, index) => index % 2 ? 1 : 2)), {
    minimum: 1, maximum: 2, penalizedSegments: 65001
  });
});

test('provider adapters request required official fields without embedding credentials', () => {
  assert.ok(GOOGLE_FIELD_MASK.includes('places.googleMapsLinks'));
  assert.ok(GOOGLE_FIELD_MASK.includes('places.userRatingCount'));
  assert.ok(GOOGLE_NEARBY_TYPES.includes('gas_station'));
  assert.ok(GOOGLE_TEXT_QUERIES.includes('termas'));
  assert.ok(GOOGLE_DETAILS_FIELD_MASK.includes('googleMapsLinks'));
  assert.ok(!GOOGLE_DETAILS_FIELD_MASK.includes('places.'));
  assert.equal(TRIPADVISOR_API_ROOT, 'https://api.content.tripadvisor.com/api/v1/location');
});

test('Instagram is accepted only in a verifiable account form', () => {
  assert.equal(safeInstagram('@cordal_sur'), 'https://www.instagram.com/cordal_sur/');
  assert.equal(safeInstagram('https://www.instagram.com/cordal_sur/'), 'https://www.instagram.com/cordal_sur/');
  assert.equal(safeInstagram('https://example.com/cordal_sur'), null);
  assert.equal(safeInstagram('cordal sur'), null);
});

test('route actions accept individual public routes and reject generic discovery pages', () => {
  assert.equal(isDirectRouteUrl('https://suda.io/activity/B7HxY9latl'), true);
  assert.equal(isDirectRouteUrl('https://suda.io/adventures/valle-las-trancas/'), false);
  assert.equal(isDirectRouteUrl('https://www.trailforks.com/trails/aguila-799017/'), true);
  assert.equal(isDirectRouteUrl('https://www.trailforks.com/region/nevados-de-chillan/trails/'), false);
  assert.equal(isDirectRouteUrl('https://es.wikiloc.com/rutas-mountain-bike/las-trancas-shangri-la-ruinas-refugio-65999327'), true);
  assert.equal(isDirectRouteUrl('https://www.strava.com/segments/explore'), false);
});

test('editorial catalog keeps broad listings visible and separates offerings, routes and researched entries', () => {
  const catalog = loadEditorialCatalog(HOST_DATA, [], RESEARCH_CATALOG);
  assert.ok(catalog.restaurants.length >= 35);
  assert.ok(catalog.restaurants.every((place) => place.navigationUrl && place.googleMapsUrl));
  const candidates = catalog.restaurants.filter((place) => place.coordinateKind === 'center_candidate');
  assert.ok(candidates.length >= 30);
  assert.ok(candidates.every((place) => place.status === 'candidate_coordinate'));
  assert.ok(candidates.every((place) => place.routingEligible === false));
  assert.ok(candidates.every((place) => place.coordinatePrecision === 'locality_center'));
  assert.ok(candidates.every((place) => place.navigationUrl.includes('google.com/maps/dir/?api=1&destination=')));
  assert.ok(catalog.offerings.length >= 50);
  assert.ok(catalog.routes.length >= 20);
  assert.ok(catalog.routes.every((route) => route.navigationAvailable === false && route.status === 'trailhead_unverified'));
  assert.ok(catalog.catalogEntries.length >= 17);
  assert.ok(catalog.catalogEntries.every((entry) => ['activities', 'provisions'].includes(entry.catalog)));
  assert.ok(catalog.catalogEntries.every((entry) => entry.routingEligible === false && entry.sources.length));
  assert.ok(catalog.catalogEntries.some((entry) => entry.catalog === 'activities'));
  assert.ok(catalog.catalogEntries.some((entry) => entry.catalog === 'provisions'));
});

test('researched profiles and direct routes retain their evidence contract', () => {
  const catalog = loadEditorialCatalog(HOST_DATA, [], RESEARCH_CATALOG);
  const verifiedProfiles = catalog.restaurants.filter((place) => place.instagram);
  assert.ok(verifiedProfiles.length >= 25);
  assert.ok(verifiedProfiles.every((place) => place.instagram.verifiedBy === 'editorial_verified_profile'));
  assert.ok(verifiedProfiles.every((place) => safeInstagram(place.instagram.value) === place.instagram.value));
  assert.ok(verifiedProfiles.every((place) => place.instagram.sourceUrl && place.sources.some((source) => source.provider === 'research' && source.url === place.instagram.sourceUrl)));
  assert.equal(catalog.restaurants.find((place) => place.legacyId === 'super-mcpato')?.instagram?.value, 'https://www.instagram.com/minimarket_mcpato/');

  const directOfferings = catalog.offerings.filter((offering) => offering.routeUrl);
  const directRoutes = catalog.routes.filter((route) => route.routeUrl);
  const directEntries = catalog.catalogEntries.filter((entry) => entry.routeAccess?.url);
  assert.ok(directOfferings.length >= 10);
  assert.ok(directRoutes.length >= 10);
  assert.ok(directEntries.length >= 10);
  for (const item of [...directOfferings, ...directRoutes]) {
    assert.equal(item.routeAccess.status, 'verified-direct');
    assert.equal(item.routeAccess.url, item.routeUrl);
    assert.ok(isDirectRouteUrl(item.routeUrl));
  }
  for (const entry of directEntries) {
    assert.equal(entry.routeAccess.status, 'verified-direct');
    assert.ok(isDirectRouteUrl(entry.routeAccess.url));
  }

  const enriched = applyResearchedProfiles([
    { id: 'manual-don-quelo', sources: [] },
    { id: 'unrelated-place', sources: [] }
  ], RESEARCH_CATALOG);
  assert.equal(enriched[0].instagram.value, 'https://www.instagram.com/donqueloltda/');
  assert.equal(enriched[0].instagram.verifiedBy, 'editorial_verified_profile');
  assert.equal(enriched[1].instagram, undefined);
});

test('a verified editorial match becomes routable without losing search navigation', () => {
  const manual = [{
    legacyId: 'sitari-tapas-y-brasas',
    location: { lat: -36.91, lon: -71.49 },
    coordinateKind: 'manual_verified',
    status: 'published',
    googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Sitari'
  }];
  const catalog = loadEditorialCatalog(HOST_DATA, manual, RESEARCH_CATALOG);
  const place = catalog.restaurants.find((item) => item.legacyId === 'sitari-tapas-y-brasas');
  assert.equal(place.routingEligible, true);
  assert.equal(place.coordinatePrecision, 'verified');
  assert.equal(place.coordinateKind, 'manual_verified');
  assert.equal(place.status, 'published');
  assert.match(place.navigationUrl, /google\.com\/maps\/dir\/\?api=1&destination=-36\.91%2C-71\.49/);
});

test('approximate manual places use sector search instead of routing to a guessed pin', () => {
  const places = loadManualPlaces(path.join(LANDING_ROOT, 'data/nearby.json'));
  const candidates = places.filter((place) => place.status === 'candidate_coordinate');
  assert.ok(candidates.length >= 3);
  assert.ok(candidates.every((place) => place.routingEligible === false));
  assert.ok(candidates.every((place) => place.navigationUrl.includes(encodeURIComponent(place.name))));
  assert.ok(candidates.every((place) => !place.navigationUrl.includes(encodeURIComponent(`${place.location.lat},${place.location.lon}`))));
});

test('manual overrides support add, merge and verified field corrections', () => {
  const overrides = [
    { action: 'add', placeId: 'new-place', payload: { name: 'New Place', category: 'shopping', lat: -36.85, lon: -71.64, sourceUrl: 'https://example.com' }, reason: 'verified' },
    { action: 'merge', placeId: 'a', targetPlaceId: 'b', payload: {}, reason: 'same entity' },
    { action: 'instagram', placeId: 'new-place', payload: { instagramUrl: 'https://www.instagram.com/new.place/', verifiedFrom: 'https://example.com' }, reason: 'official link' }
  ];
  const added = recordsFromAddOverrides(overrides);
  assert.equal(added.length, 1);
  assert.equal(mergeOverrides(overrides)[0].secondaryId, 'b');
  const corrected = applyPlaceOverrides(added, overrides);
  assert.equal(corrected[0].instagram.value, 'https://www.instagram.com/new.place/');
  assert.equal(corrected[0].instagram.verifiedBy, 'manual_verified_override');
});

test('a verified location override restores routing eligibility and published status', () => {
  const candidate = {
    id: 'editorial-test', legacyId: 'test', name: 'Test', category: 'restaurant',
    location: { lat: -36.914792, lon: -71.495698 }, coordinateKind: 'center_candidate',
    coordinatePrecision: 'locality_center', routingEligible: false, status: 'candidate_coordinate',
    sources: []
  };
  const corrected = applyPlaceOverrides([candidate], [{
    id: 'verified-location-test', action: 'location', placeId: 'test',
    payload: { lat: -36.91, lon: -71.49, coordinateKind: 'google_maps_place', sourceUrl: 'https://www.google.com/maps/place/Test' }
  }])[0];
  assert.equal(corrected.coordinateKind, 'google_maps_place');
  assert.equal(corrected.coordinatePrecision, 'verified');
  assert.equal(corrected.routingEligible, true);
  assert.equal(corrected.status, 'published');
});
