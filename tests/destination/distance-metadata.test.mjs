import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { LANDING_ROOT } from '../../scripts/destination/paths.mjs';
import {
  applyCatalogAccessTargets,
  baselineDistanceFromApartment,
  catalogDistanceIsValid,
  loadCatalogAccessTargets,
  withRoadDistance
} from '../../scripts/destination/distance-metadata.mjs';

const apartment = { lat: -36.9082176, lon: -71.4205745 };
const guide = JSON.parse(fs.readFileSync(path.join(LANDING_ROOT, 'data/destination-guide.json'), 'utf8'));

test('distance metadata distinguishes road, mapped, sector and trailhead targets', () => {
  const candidate = {
    id: 'candidate', location: { lat: -36.91, lon: -71.49 }, coordinateKind: 'center_candidate',
    status: 'candidate_coordinate', routingEligible: false, address: { value: 'Valle Las Trancas' }, discovery: {}
  };
  const candidateDistance = baselineDistanceFromApartment(candidate, apartment);
  assert.equal(candidateDistance.source, 'sector-apartment');
  assert.equal(candidateDistance.target, 'locality');
  assert.equal(candidateDistance.confidence, 'approximate');
  assert.equal(candidateDistance.label, 'Valle Las Trancas');

  const mapped = { ...candidate, id: 'mapped', coordinateKind: 'node', status: 'published', routingEligible: true, address: null };
  const mappedDistance = baselineDistanceFromApartment(mapped, apartment);
  assert.equal(mappedDistance.source, 'direct-apartment');
  assert.equal(mappedDistance.target, 'place');
  assert.equal(mappedDistance.confidence, 'mapped');

  const targets = loadCatalogAccessTargets(path.join(LANDING_ROOT, 'data/catalog-access-targets.json'));
  const [trail] = applyCatalogAccessTargets([{ ...mapped, id: targets[0].placeId, category: 'trail' }], targets);
  const road = withRoadDistance(trail, apartment, { meters: 587.2, accessNearby: false }, { quality: 'on_road', offsetMeters: 2 });
  assert.equal(road.distanceFromApartment.meters, 587.2);
  assert.equal(road.distanceFromApartment.source, 'road-trailhead-apartment');
  assert.equal(road.distanceFromApartment.target, 'trailhead');
  assert.equal(road.distanceFromApartment.confidence, 'verified');
  assert.equal(road.catalogAccess.label.es, 'Inicio por Andarivel Tata');
});

test('every routable catalog place has a finite, honest apartment distance', () => {
  const publicCatalog = guide.places.filter((place) =>
    !['hotel', 'cabin'].includes(place.category) && place.routingEligible !== false && place.status !== 'candidate_coordinate'
  );
  assert.ok(publicCatalog.length >= 120);
  assert.deepEqual(publicCatalog.filter((place) => !catalogDistanceIsValid(place)).map((place) => place.id), []);
  assert.ok(publicCatalog.some((place) => place.distanceFromApartment.source === 'direct-apartment'));
  assert.ok(publicCatalog.some((place) => place.distanceFromApartment.source === 'road-apartment'));
  assert.ok(publicCatalog.every((place) => place.distanceFromApartment.source !== 'sector-apartment'));
  for (const place of publicCatalog.filter((item) => item.distanceFromApartment.source.startsWith('road-'))) {
    assert.ok(Number.isFinite(place.discovery.apartmentRoadDistanceMeters), `${place.id} claims a road distance without a route`);
  }
  for (const place of publicCatalog.filter((item) => item.category === 'trail')) {
    assert.equal(place.distanceFromApartment.target, 'trailhead', `${place.id} must measure to the trailhead`);
    assert.ok(place.catalogAccess?.source?.url, `${place.id} lacks trailhead provenance`);
  }
});

test('generated catalog cards expose distance only when they are routable', () => {
  for (const page of ['restaurantes.html', 'actividades.html']) {
    const html = fs.readFileSync(path.join(LANDING_ROOT, page), 'utf8');
    const cards = [...html.matchAll(/<article\b[^>]*class="[^"]*\bcatalog-card\b[^"]*"[^>]*>/g)].map((match) => match[0]);
    assert.ok(cards.length > 50, `${page} unexpectedly lost catalog coverage`);
    for (const card of cards) {
      const id = card.match(/data-id="([^"]+)"/)?.[1] || 'unknown';
      const routingEligible = card.match(/data-routing-eligible="([^"]+)"/)?.[1];
      if (routingEligible === 'true') {
        assert.match(card, /data-distance="\d+(?:\.\d+)?"/, `${page}:${id} lacks current distance`);
        assert.match(card, /data-apartment-distance="\d+(?:\.\d+)?"/, `${page}:${id} lacks apartment distance`);
        assert.doesNotMatch(card, /data-(?:apartment-)?distance-source="unknown"/, `${page}:${id} has an unknown distance source`);
        assert.match(card, /data-distance-target="(?:place|locality|trailhead)"/, `${page}:${id} lacks a distance target`);
        continue;
      }
      assert.equal(routingEligible, 'false', `${page}:${id} lacks routing eligibility`);
      assert.match(card, /data-lat="" data-lon=""/);
      assert.match(card, /data-distance="" data-distance-source="unknown"/);
      assert.match(card, /data-apartment-distance="" data-apartment-distance-source="unknown"/);
    }
  }
});
