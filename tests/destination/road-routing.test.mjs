import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { LANDING_ROOT, ROAD_CORE_URL } from '../../scripts/destination/paths.mjs';

const { haversineMeters, networkIdentity, prepareNetwork, routeDistances, snapToNetwork } = await import(ROAD_CORE_URL);

function network(nodes, segments, destinations = []) {
  return prepareNetwork({ schemaVersion: 1, nodes, segments, destinations });
}

function profiledNetwork(nodes, segments, destinations = [], defaultFactor = 1) {
  return prepareNetwork({
    schemaVersion: 2,
    profile: { mode: 'driving', impedance: { unit: 'multiplier', defaultFactor } },
    nodes,
    segments,
    destinations
  });
}

test('routes bidirectional ways and snaps origins to edges', () => {
  const graph = network([[0, 0], [0, 0.001], [0, 0.002]], [[0, 1, 111.2, 3], [1, 2, 111.2, 3]], [
    { id: 'finish', location: { lat: 0, lon: 0.0018 }, snap: { segment: 1, fraction: 0.8, offsetMeters: 0, quality: 'on_road' } }
  ]);
  const origin = { lat: 0, lon: 0.0002 };
  const result = routeDistances(graph, origin);
  assert.equal(result.coverage, 'covered');
  assert.equal(snapToNetwork(graph, origin).segment, 0);
  assert.ok(result.distances.finish.meters >= haversineMeters(origin, graph.destinations[0].location));
  assert.ok(result.distances.finish.meters < 190);
});

test('reports origins outside the private network explicitly', () => {
  const graph = network([[0, 0], [0, 0.001]], [[0, 1, 111.2, 3]], [
    { id: 'finish', location: { lat: 0, lon: 0.001 }, snap: { segment: 0, fraction: 1, offsetMeters: 0, quality: 'on_road' } }
  ]);
  const result = routeDistances(graph, { lat: 1, lon: 1 });
  assert.equal(result.coverage, 'outside-network');
  assert.equal(result.originSnap, null);
  assert.deepEqual(result.distances, {});
});

test('live origin snapping honours the artifact profile limit', () => {
  const graph = prepareNetwork({
    schemaVersion: 2,
    profile: { snapLimitMeters: 100, impedance: { unit: 'multiplier', defaultFactor: 1 } },
    nodes: [[0, 0], [0, 0.001]],
    segments: [[0, 1, 111.2, 3, 1]],
    destinations: []
  });
  assert.equal(routeDistances(graph, { lat: 0.0045, lon: 0.0005 }).coverage, 'outside-network');
});

test('honours oneway and reports disconnected destinations without a route', () => {
  const graph = network([[0, 0], [0, 0.001], [0, 0.002], [1, 1], [1, 1.001]], [[0, 1, 111.2, 1], [1, 2, 111.2, 1], [3, 4, 111.2, 3]], [
    { id: 'behind', snap: { segment: 0, fraction: 0.1, offsetMeters: 0, quality: 'on_road' } },
    { id: 'island', snap: { segment: 2, fraction: 0.5, offsetMeters: 0, quality: 'on_road' } }
  ]);
  const result = routeDistances(graph, { segment: 1, fraction: 0.8, offsetMeters: 0, quality: 'on_road' });
  assert.equal(result.distances.behind, null);
  assert.equal(result.distances.island, null);
});

test('supports directed roundabout-style segments and access-nearby quality', () => {
  const graph = network([[0, 0], [0, 0.001], [0.001, 0.001], [0.001, 0]], [[0, 1, 111.2, 1], [1, 2, 111.2, 1], [2, 3, 111.2, 1], [3, 0, 111.2, 1]], [
    { id: 'exit', snap: { segment: 2, fraction: 0.5, offsetMeters: 175, quality: 'access_nearby' } }
  ]);
  const result = routeDistances(graph, { segment: 0, fraction: 0.5, offsetMeters: 0, quality: 'on_road' });
  assert.equal(result.distances.exit.accessNearby, true);
  assert.equal(result.distances.exit.snapQuality, 'access_nearby');
});

test('schema 2 impedance avoids an implausible track while returning physical metres', () => {
  const destinations = [
    { id: 'finish', snap: { segment: 0, fraction: 1, offsetMeters: 0, quality: 'on_road' } }
  ];
  const graph = profiledNetwork(
    [[0, 0], [0, 0.001], [0.001, 0.0005]],
    [[0, 1, 100, 3, 5], [0, 2, 80, 3, 1.5], [2, 1, 80, 3, 1.5]],
    destinations
  );
  const result = routeDistances(graph, { segment: 0, fraction: 0, offsetMeters: 0, quality: 'on_road' });
  assert.equal(result.distances.finish.meters, 160);
});

test('schema 1 keeps shortest-distance behaviour and schema 2 defaults remain compatible', () => {
  const nodes = [[0, 0], [0, 0.001], [0.001, 0.0005]];
  const legacySegments = [[0, 1, 100, 3], [0, 2, 80, 3], [2, 1, 80, 3]];
  const destinations = [{ id: 'finish', snap: { segment: 0, fraction: 1, offsetMeters: 0, quality: 'on_road' } }];
  const origin = { segment: 0, fraction: 0, offsetMeters: 0, quality: 'on_road' };
  assert.equal(routeDistances(network(nodes, legacySegments, destinations), origin).distances.finish.meters, 100);
  assert.deepEqual(
    routeDistances(profiledNetwork(nodes, legacySegments, destinations), origin).distances,
    routeDistances(network(nodes, legacySegments, destinations), origin).distances
  );
});

test('same point and destinations sharing a road access do not double-count snap offsets', () => {
  const nodes = [[0, 0], [0, 0.001]];
  const segments = [[0, 1, 111.2, 3]];
  const origin = { lat: 0.0001, lon: 0.0005 };
  const sameSnap = { segment: 0, fraction: 0.5, offsetMeters: 11.1, quality: 'on_road' };
  const sharedLocation = { lat: 0.0002, lon: 0.0005 };
  const graph = network(nodes, segments, [
    { id: 'same', location: origin, snap: sameSnap },
    { id: 'shared-access', location: sharedLocation, snap: { ...sameSnap, offsetMeters: 22.1 } }
  ]);
  const result = routeDistances(graph, origin);
  assert.equal(result.distances.same.meters, 0);
  assert.ok(Math.abs(result.distances['shared-access'].meters - haversineMeters(origin, sharedLocation)) < 0.2);
  assert.equal(routeDistances(graph, sameSnap).distances.same.meters, 22.2);
});

test('shared formatter produces exactly three significant digits in ES, PT and EN', () => {
  const source = fs.readFileSync(path.join(LANDING_ROOT, 'js/road-distance.js'), 'utf8');
  const context = { window: {}, document: { baseURI: 'https://example.test/' }, URL, Intl, Map, Number, Error, Object, Promise };
  vm.runInNewContext(source, context);
  const format = context.window.CordalRoadDistances.formatMeters;
  assert.equal(format(0.4, 'es'), '< 1 m');
  assert.equal(format(8.5, 'es'), '8,50 m');
  assert.equal(format(85, 'pt'), '85,0 m');
  assert.equal(format(293, 'es'), '293 m');
  assert.equal(format(999, 'en'), '999 m');
  assert.equal(format(1000, 'es'), '1,00 km');
  assert.equal(format(12300, 'en'), '12.3 km');
});

test('versioned artifact preserves known road distances and ODbL provenance', () => {
  const graph = JSON.parse(fs.readFileSync(path.join(LANDING_ROOT, 'data/driving-network.json'), 'utf8'));
  const guide = JSON.parse(fs.readFileSync(path.join(LANDING_ROOT, 'data/destination-guide.json'), 'utf8'));
  assert.equal(graph.schemaVersion, 2);
  assert.match(graph.source.license, /ODbL/);
  assert.deepEqual(networkIdentity(graph), {
    schemaVersion: guide.meta.drivingNetwork.schemaVersion,
    version: guide.meta.drivingNetwork.networkVersion,
    hash: guide.meta.drivingNetwork.networkHash
  });
  assert.match(graph.networkHash, /^[a-f0-9]{64}$/);
  assert.equal(graph.artifactSha256, graph.networkHash);
  assert.ok(graph.statistics.impedance.penalizedSegments > 0);
  assert.ok(graph.segments.every((segment) => Number.isFinite(segment[4]) && segment[4] >= 1));
  const candidates = new Set(guide.places.filter((place) => place.routingEligible === false || place.status === 'candidate_coordinate').map((place) => place.id));
  assert.ok(candidates.size >= 15);
  assert.ok(graph.destinations.every((destination) => !candidates.has(destination.id)));
  const verifiedEditorial = guide.places.filter((place) => place.coordinateKind === 'google_maps_place');
  assert.ok(verifiedEditorial.length >= 19);
  assert.equal(new Set(verifiedEditorial.map((place) => `${place.location.lat},${place.location.lon}`)).size, verifiedEditorial.length);
  assert.equal(guide.places.filter((place) => /^(?:Rucahue|Rucahue Minimarket)$/i.test(place.name)).length, 1, 'Rucahue minimarket must be a single destination');
  const prepared = prepareNetwork(graph);
  const current = routeDistances(prepared, { lat: -36.914792, lon: -71.495698 });
  const food = new Set(['restaurant', 'coffee', 'fast_food', 'bakery', 'supermarket', 'convenience', 'other']);
  const nearbyRoad = guide.places.filter((place) => food.has(place.category) && current.distances[place.id])
    .map((place) => current.distances[place.id].meters).sort((left, right) => left - right).slice(0, 20);
  assert.equal(nearbyRoad.length, 20);
  assert.ok(new Set(nearbyRoad).size >= 15, 'nearby road results must not collapse onto a shared locality coordinate');
  for (const name of ['Restaurant Los Pincheira', 'Quincho del Valle']) {
    const place = guide.places.find((item) => item.name === name);
    assert.ok(place.discovery.apartmentRoadDistanceMeters > place.discovery.apartmentDistanceMeters, name);
  }
});
