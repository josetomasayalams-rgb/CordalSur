import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { haversineMeters, networkIdentity, prepareNetwork, routeDistances, snapToNetwork } from '../js/road-routing-core.mjs';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const makeNetwork = (nodes, segments, destinations = []) => prepareNetwork({ schemaVersion: 1, nodes, segments, destinations });

test('routes bidirectional ways and snaps origins to edges', () => {
  const graph = makeNetwork([[0, 0], [0, 0.001], [0, 0.002]], [[0, 1, 111.2, 3], [1, 2, 111.2, 3]], [
    { id: 'finish', location: { lat: 0, lon: 0.0018 }, snap: { segment: 1, fraction: 0.8, offsetMeters: 0, quality: 'on_road' } }
  ]);
  const origin = { lat: 0, lon: 0.0002 };
  const result = routeDistances(graph, origin);
  assert.equal(result.coverage, 'covered');
  assert.equal(snapToNetwork(graph, origin).segment, 0);
  assert.ok(result.distances.finish.meters >= haversineMeters(origin, graph.destinations[0].location));
});

test('reports an origin outside the private graph without pretending routing succeeded', () => {
  const graph = makeNetwork([[0, 0], [0, 0.001]], [[0, 1, 111.2, 3]], [
    { id: 'finish', location: { lat: 0, lon: 0.001 }, snap: { segment: 0, fraction: 1, offsetMeters: 0, quality: 'on_road' } }
  ]);
  const result = routeDistances(graph, { lat: 1, lon: 1 });
  assert.deepEqual(result, {
    coverage: 'outside-network',
    graph: { schemaVersion: 1, version: null, hash: null },
    originSnap: null,
    distances: {}
  });
  assert.equal(routeDistances(graph, null).coverage, 'outside-network');
});

test('normalizes the existing graph metadata for guide/network parity checks', () => {
  assert.deepEqual(networkIdentity({
    schemaVersion: 1,
    generatedAt: '2026-07-17T23:19:24.617Z',
    source: { responseSha256: 'abc123' }
  }), { schemaVersion: 1, version: '2026-07-17T23:19:24.617Z', hash: 'abc123' });
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

function roadClientHarness(behaviour) {
  const source = fs.readFileSync(path.join(SITE, 'js/road-distance.js'), 'utf8');
  const instances = [];
  class FakeWorker {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.listeners = new Map();
      this.messages = [];
      this.terminated = false;
      this.index = instances.length;
      instances.push(this);
    }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    emit(type, data) {
      for (const listener of this.listeners.get(type) || []) listener(type === 'message' ? { data } : data || {});
    }
    postMessage(message) {
      this.messages.push(message);
      behaviour(this, message);
    }
    terminate() { this.terminated = true; }
  }
  const context = {
    window: { location: { origin: 'https://example.test' } },
    document: { baseURI: 'https://example.test/guide/', location: { origin: 'https://example.test' } },
    Worker: FakeWorker,
    URL,
    Intl,
    Map,
    Number,
    Error,
    Object,
    Promise,
    JSON,
    setTimeout,
    clearTimeout
  };
  vm.runInNewContext(source, context);
  return { api: context.window.CordalRoadDistances, instances };
}

const TEST_GRAPH = { schemaVersion: 1, version: 'graph-v1', hash: 'sha-v1' };
const TEST_RESULT = {
  type: 'result',
  coverage: 'covered',
  graph: TEST_GRAPH,
  originSnap: { segment: 0, fraction: 0, offsetMeters: 0, quality: 'on_road' },
  distances: { finish: { meters: 120, accessNearby: false, snapMeters: 0, snapQuality: 'on_road' } }
};

function ready(worker, message, graph = TEST_GRAPH) {
  worker.emit('message', { type: 'ready', requestId: message.requestId, graph, destinations: 1 });
}

test('client times out a route, terminates the worker and retries exactly once', async () => {
  const harness = roadClientHarness((worker, message) => {
    if (message.type === 'init') ready(worker, message);
    if (message.type === 'route' && worker.index === 1) {
      worker.emit('message', { ...TEST_RESULT, requestId: message.requestId });
    }
  });
  const result = await harness.api.routeFrom({ lat: 0, lon: 0 }, {
    expectedGraph: TEST_GRAPH,
    initTimeoutMs: 30,
    routeTimeoutMs: 5
  });
  assert.equal(result.coverage, 'covered');
  assert.equal(harness.instances.length, 2);
  assert.equal(harness.instances[0].terminated, true);
  assert.equal(harness.instances[1].terminated, false);
  assert.equal(harness.instances.flatMap((instance) => instance.messages).filter((message) => message.type === 'route').length, 2);
});

test('client applies the initialization timeout before its single recovery attempt', async () => {
  const harness = roadClientHarness((worker, message) => {
    if (message.type === 'init' && worker.index === 1) ready(worker, message);
    if (message.type === 'route') worker.emit('message', { ...TEST_RESULT, requestId: message.requestId });
  });
  const result = await harness.api.routeFrom({ lat: 0, lon: 0 }, {
    expectedGraph: TEST_GRAPH,
    initTimeoutMs: 5,
    routeTimeoutMs: 30
  });
  assert.equal(result.coverage, 'covered');
  assert.equal(harness.instances.length, 2);
  assert.equal(harness.instances[0].terminated, true);
});

test('client never starts a third worker and terminates the final timed-out attempt', async () => {
  const harness = roadClientHarness((worker, message) => {
    if (message.type === 'init') ready(worker, message);
  });
  await assert.rejects(
    harness.api.routeFrom({ lat: 0, lon: 0 }, {
      expectedGraph: TEST_GRAPH,
      initTimeoutMs: 30,
      routeTimeoutMs: 5
    }),
    (error) => error.code === 'ROAD_ROUTE_TIMEOUT'
  );
  assert.equal(harness.instances.length, 2);
  assert.ok(harness.instances.every((instance) => instance.terminated));
});

test('failed initialization is not sticky and a later initialization can recover', async () => {
  const harness = roadClientHarness((worker, message) => {
    if (message.type !== 'init') return;
    if (worker.index === 0) worker.emit('message', { type: 'error', requestId: message.requestId, code: 'ROAD_WORKER_ERROR', message: 'temporary failure' });
    else ready(worker, message);
  });
  await assert.rejects(harness.api.init({ initTimeoutMs: 30 }), /temporary failure/);
  const recovered = await harness.api.init({ initTimeoutMs: 30 });
  assert.equal(recovered.type, 'ready');
  assert.equal(harness.instances.length, 2);
  assert.equal(harness.instances[0].terminated, true);
});

test('late route replies are rejected as stale and cannot replace a newer result', async () => {
  let heldRoute = null;
  const harness = roadClientHarness((worker, message) => {
    if (message.type === 'init') ready(worker, message);
    if (message.type === 'route' && !heldRoute) heldRoute = { worker, message };
    else if (message.type === 'route') worker.emit('message', { ...TEST_RESULT, requestId: message.requestId });
  });
  await harness.api.init({ expectedGraph: TEST_GRAPH, routeTimeoutMs: 50 });
  const oldRoute = harness.api.routeFrom({ lat: 0, lon: 0 });
  await new Promise((resolve) => setImmediate(resolve));
  const currentRoute = harness.api.routeFrom({ lat: 0, lon: 0.0001 });
  assert.equal((await currentRoute).coverage, 'covered');
  heldRoute.worker.emit('message', { ...TEST_RESULT, requestId: heldRoute.message.requestId });
  await assert.rejects(oldRoute, (error) => error.stale === true && error.code === 'ROAD_STALE');
  assert.equal(harness.instances.length, 1);
});

test('graph mismatch is rejected without retrying a permanently incompatible artifact', async () => {
  const harness = roadClientHarness((worker, message) => {
    if (message.type === 'init') ready(worker, message, { ...TEST_GRAPH, hash: 'other-sha' });
  });
  await assert.rejects(
    harness.api.routeFrom({ lat: 0, lon: 0 }, { expectedGraph: TEST_GRAPH, initTimeoutMs: 30 }),
    (error) => error.code === 'ROAD_GRAPH_MISMATCH'
  );
  assert.equal(harness.instances.length, 1);
  assert.equal(harness.instances[0].terminated, true);
});

test('destroy terminates the worker and constructor messages contain coordinates only in local postMessage', async () => {
  const harness = roadClientHarness((worker, message) => {
    if (message.type === 'init') ready(worker, message);
    if (message.type === 'route') worker.emit('message', { ...TEST_RESULT, requestId: message.requestId });
  });
  await harness.api.routeFrom({ lat: -36.9, lon: -71.5 }, { expectedGraph: TEST_GRAPH });
  const routeMessage = harness.instances[0].messages.find((message) => message.type === 'route');
  assert.deepEqual(JSON.parse(JSON.stringify(routeMessage.origin)), { lat: -36.9, lon: -71.5 });
  assert.ok(harness.instances[0].url.startsWith('js/road-distance-worker.js'));
  harness.api.destroy();
  assert.equal(harness.instances[0].terminated, true);
});

test('client and worker enforce production timeout and same-origin contracts', () => {
  const client = fs.readFileSync(path.join(SITE, 'js/road-distance.js'), 'utf8');
  const worker = fs.readFileSync(path.join(SITE, 'js/road-distance-worker.js'), 'utf8');
  assert.match(client, /INIT_TIMEOUT_MS = 10000/);
  assert.match(client, /ROUTE_TIMEOUT_MS = 5000/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.doesNotMatch(client, /localStorage|sessionStorage|fetch\s*\(/);
});

test('artifact keeps ODbL provenance and known road distances', () => {
  const graph = JSON.parse(fs.readFileSync(path.join(SITE, 'data/driving-network.json'), 'utf8'));
  const guide = JSON.parse(fs.readFileSync(path.join(SITE, 'data/destination-guide.json'), 'utf8'));
  assert.equal(graph.schemaVersion, 1);
  assert.match(graph.source.license, /ODbL/);
  assert.deepEqual(networkIdentity(graph), {
    schemaVersion: guide.meta.drivingNetwork.schemaVersion,
    version: guide.meta.drivingNetwork.generatedAt,
    hash: guide.meta.drivingNetwork.responseSha256
  });
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
