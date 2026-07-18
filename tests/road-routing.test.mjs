import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { haversineMeters, prepareNetwork, routeDistances, snapToNetwork } from '../js/road-routing-core.mjs';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const makeNetwork = (nodes, segments, destinations = []) => prepareNetwork({ schemaVersion: 1, nodes, segments, destinations });

test('routes bidirectional ways and snaps origins to edges', () => {
  const graph = makeNetwork([[0, 0], [0, 0.001], [0, 0.002]], [[0, 1, 111.2, 3], [1, 2, 111.2, 3]], [
    { id: 'finish', location: { lat: 0, lon: 0.0018 }, snap: { segment: 1, fraction: 0.8, offsetMeters: 0, quality: 'on_road' } }
  ]);
  const origin = { lat: 0, lon: 0.0002 };
  const result = routeDistances(graph, origin);
  assert.equal(snapToNetwork(graph, origin).segment, 0);
  assert.ok(result.distances.finish.meters >= haversineMeters(origin, graph.destinations[0].location));
});

test('honours oneway, roundabouts, disconnected components and access quality', () => {
  const directed = makeNetwork([[0, 0], [0, 0.001], [0, 0.002], [1, 1], [1, 1.001]], [[0, 1, 111.2, 1], [1, 2, 111.2, 1], [3, 4, 111.2, 3]], [
    { id: 'behind', snap: { segment: 0, fraction: 0.1, offsetMeters: 0, quality: 'on_road' } },
    { id: 'island', snap: { segment: 2, fraction: 0.5, offsetMeters: 0, quality: 'on_road' } }
  ]);
  const noRoute = routeDistances(directed, { segment: 1, fraction: 0.8, offsetMeters: 0, quality: 'on_road' });
  assert.equal(noRoute.distances.behind, null);
  assert.equal(noRoute.distances.island, null);

  const roundabout = makeNetwork([[0, 0], [0, 0.001], [0.001, 0.001], [0.001, 0]], [[0, 1, 111.2, 1], [1, 2, 111.2, 1], [2, 3, 111.2, 1], [3, 0, 111.2, 1]], [
    { id: 'exit', snap: { segment: 2, fraction: 0.5, offsetMeters: 175, quality: 'access_nearby' } }
  ]);
  assert.equal(routeDistances(roundabout, { segment: 0, fraction: 0.5, offsetMeters: 0, quality: 'on_road' }).distances.exit.accessNearby, true);
});

test('shared formatter uses exactly three significant digits in ES, PT and EN', () => {
  const source = fs.readFileSync(path.join(SITE, 'js/road-distance.js'), 'utf8');
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

test('artifact keeps ODbL provenance and known road distances', () => {
  const graph = JSON.parse(fs.readFileSync(path.join(SITE, 'data/driving-network.json'), 'utf8'));
  const guide = JSON.parse(fs.readFileSync(path.join(SITE, 'data/destination-guide.json'), 'utf8'));
  assert.equal(graph.schemaVersion, 1);
  assert.match(graph.source.license, /ODbL/);
  for (const name of ['Restaurant Los Pincheira', 'Quincho del Valle']) {
    const place = guide.places.find((item) => item.name === name);
    assert.ok(place.discovery.apartmentRoadDistanceMeters > place.discovery.apartmentDistanceMeters, name);
  }
});

test('motion tracker rejects poor fixes, suppresses GPS noise and derives travel heading', () => {
  const source = fs.readFileSync(path.join(SITE, 'js/location-motion.js'), 'utf8');
  const context = { window: {}, globalThis: {}, Date, Number, Math };
  vm.runInNewContext(source, context);
  const tracker = context.window.CordalLocationMotion.createTracker({ maximumAccuracy: 100 });
  const fix = (latitude, longitude, accuracy, timestamp, speed = null, heading = null) => ({
    timestamp,
    coords: { latitude, longitude, accuracy, speed, heading }
  });
  assert.equal(tracker.accept(fix(-36.9, -71.5, 180, 1_000)).reason, 'low_accuracy');
  assert.equal(tracker.accept(fix(-36.9, -71.5, 12, 2_000)).accepted, true);
  assert.equal(tracker.accept(fix(-36.90001, -71.50001, 13, 3_000)).reason, 'noise');
  const moving = tracker.accept(fix(-36.9, -71.4995, 10, 12_000, 4, null));
  assert.equal(moving.accepted, true);
  assert.equal(moving.headingReliable, true);
  assert.ok(moving.heading > 70 && moving.heading < 110);
  assert.ok(context.window.CordalLocationMotion.angleDifference(355, 5) < 11);
});
