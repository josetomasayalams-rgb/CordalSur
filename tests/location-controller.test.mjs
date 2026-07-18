import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = fs.readFileSync(path.join(SITE, 'js/location-controller.js'), 'utf8');

function makeClock(initial = 100_000) {
  let current = initial;
  let nextId = 1;
  const tasks = new Map();
  return {
    now: () => current,
    setTimeout(callback, delay = 0) {
      const id = nextId++;
      tasks.set(id, { at: current + Number(delay), callback });
      return id;
    },
    clearTimeout(id) { tasks.delete(id); },
    tick(duration) {
      const target = current + duration;
      while (true) {
        const pending = [...tasks.entries()]
          .filter(([, task]) => task.at <= target)
          .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
        if (!pending) break;
        tasks.delete(pending[0]);
        current = pending[1].at;
        pending[1].callback();
      }
      current = target;
    },
    pending: () => tasks.size
  };
}

function makeGeolocation() {
  let nextId = 1;
  const watches = new Map();
  const cleared = [];
  return {
    watchPosition(success, failure, options) {
      const id = nextId++;
      watches.set(id, { success, failure, options });
      return id;
    },
    clearWatch(id) {
      cleared.push(id);
      watches.delete(id);
    },
    fix(latitude, longitude, accuracy, timestamp) {
      [...watches.values()].forEach(({ success }) => success({
        timestamp,
        coords: { latitude, longitude, accuracy }
      }));
    },
    fail(code) { [...watches.values()].forEach(({ failure }) => failure({ code })); },
    active: () => watches.size,
    cleared,
    options: () => [...watches.values()][0]?.options
  };
}

function loadController() {
  const pageListeners = new Map();
  const window = {
    isSecureContext: true,
    setTimeout,
    clearTimeout,
    addEventListener(type, listener) { pageListeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (pageListeners.get(type) === listener) pageListeners.delete(type);
    }
  };
  const context = { window, globalThis: window, module: { exports: {} }, Object, Number, Math, Date, Promise, TypeError };
  vm.runInNewContext(SOURCE, context);
  assert.equal(context.module.exports, window.CordalLocationController);
  return {
    api: window.CordalLocationController,
    pagehide() { pageListeners.get('pagehide')?.(); },
    hasPagehide: () => pageListeners.has('pagehide')
  };
}

function setup(extra = {}) {
  const loaded = loadController();
  const clock = makeClock();
  const geolocation = makeGeolocation();
  const events = [];
  const controller = loaded.api.create({
    navigator: { geolocation, ...extra.navigator },
    secureContext: extra.secureContext ?? true,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    onEvent: (event) => events.push(event)
  });
  return { ...loaded, clock, geolocation, events, controller };
}

test('exports quality tiers and geodesic distance without persistence or network I/O', () => {
  const { api } = loadController();
  assert.equal(api.qualityForAccuracy(100), 'precise');
  assert.equal(api.qualityForAccuracy(101), 'approximate');
  assert.equal(api.qualityForAccuracy(1000), 'approximate');
  assert.equal(api.qualityForAccuracy(1001), 'coarse');
  assert.equal(api.qualityForAccuracy(5000), 'coarse');
  assert.equal(api.qualityForAccuracy(5001), null);
  assert.ok(api.distanceMeters({ lat: -36.9, lon: -71.5 }, { lat: -36.9, lon: -71.499 }) > 80);
  assert.doesNotMatch(SOURCE, /localStorage|sessionStorage|indexedDB|\bfetch\s*\(|XMLHttpRequest|sendBeacon|console\./);
});

test('once mode refines with watchPosition, keeps the best usable fix and stops at 20 seconds', () => {
  const { controller, geolocation, clock, events } = setup();
  assert.equal(controller.start('once'), true);
  assert.equal(controller.getState(), 'requesting');
  assert.equal(geolocation.options().enableHighAccuracy, true);
  geolocation.fix(-36.9, -71.5, 6200, 101_000);
  assert.equal(controller.getState(), 'refining');
  assert.equal(controller.getSnapshot(), null);
  geolocation.fix(-36.9, -71.5, 750, 102_000);
  geolocation.fix(-36.9001, -71.5001, 900, 103_000);
  geolocation.fix(-36.9002, -71.5002, 240, 104_000);
  assert.equal(controller.getSnapshot().accuracy, 240);
  clock.tick(20_000);
  assert.equal(controller.getState(), 'degraded');
  assert.equal(controller.getSnapshot().accuracy, 240);
  assert.equal(geolocation.active(), 0);
  assert.equal(clock.pending(), 0);
  assert.ok(events.some((event) => event.type === 'snapshot' && event.final));
});

test('once mode stops early at precise accuracy and times out without a usable fix', () => {
  const precise = setup();
  precise.controller.start('once');
  precise.geolocation.fix(-36.9, -71.5, 100, 101_000);
  assert.equal(precise.controller.getState(), 'ready');
  assert.equal(precise.geolocation.active(), 0);
  assert.equal(precise.clock.pending(), 0);

  const poor = setup();
  poor.controller.start('once');
  poor.geolocation.fix(-36.9, -71.5, 5001, 101_000);
  poor.clock.tick(20_000);
  assert.equal(poor.controller.getState(), 'timeout');
  assert.equal(poor.controller.getSnapshot(), null);
  assert.equal(poor.geolocation.active(), 0);
});

test('once mode keeps refining after temporary geolocation errors until its own deadline', () => {
  const withCandidate = setup();
  withCandidate.controller.start('once');
  withCandidate.geolocation.fix(-36.9, -71.5, 700, 101_000);
  withCandidate.geolocation.fail(2);
  assert.equal(withCandidate.controller.getState(), 'degraded');
  assert.equal(withCandidate.geolocation.active(), 1);
  assert.equal(withCandidate.clock.pending(), 1);
  withCandidate.geolocation.fix(-36.9001, -71.5001, 80, 102_000);
  assert.equal(withCandidate.controller.getState(), 'ready');
  assert.equal(withCandidate.controller.getSnapshot().accuracy, 80);
  assert.equal(withCandidate.geolocation.active(), 0);

  const withoutCandidate = setup();
  withoutCandidate.controller.start('once');
  withoutCandidate.geolocation.fail(3);
  assert.equal(withoutCandidate.controller.getState(), 'refining');
  assert.equal(withoutCandidate.geolocation.active(), 1);
  withoutCandidate.clock.tick(20_000);
  assert.equal(withoutCandidate.controller.getState(), 'timeout');
  assert.equal(withoutCandidate.geolocation.active(), 0);
});

test('session uses one watcher and throttles meaningful reroutes with a trailing signal', () => {
  const { controller, geolocation, clock, events } = setup();
  controller.start('session');
  geolocation.fix(-36.9, -71.5, 40, 101_000);
  assert.equal(events.filter((event) => event.type === 'snapshot' && event.shouldReroute).length, 1);
  clock.tick(1000);
  geolocation.fix(-36.8997, -71.5, 40, 102_000);
  const immediate = events.at(-1);
  assert.equal(immediate.type, 'snapshot');
  assert.equal(immediate.shouldReroute, false);
  assert.equal(geolocation.active(), 1);
  clock.tick(3999);
  assert.equal(events.filter((event) => event.type === 'snapshot' && event.shouldReroute).length, 1);
  clock.tick(1);
  const reroutes = events.filter((event) => event.type === 'snapshot' && event.shouldReroute);
  assert.equal(reroutes.length, 2);
  assert.equal(reroutes[1].replayed, true);

  controller.start('session');
  assert.equal(geolocation.active(), 1);
  assert.ok(geolocation.cleared.length >= 1);
});

test('session retains the last valid snapshot through temporary errors and recovers', () => {
  const { controller, geolocation } = setup();
  controller.start('session');
  geolocation.fix(-36.9, -71.5, 80, 101_000);
  const valid = controller.getSnapshot();
  geolocation.fail(2);
  assert.equal(controller.getState(), 'degraded');
  assert.deepEqual(controller.getSnapshot(), valid);
  assert.equal(geolocation.active(), 1);
  geolocation.fix(-36.8999, -71.5, 70, 102_000);
  assert.equal(controller.getState(), 'ready');
});

test('denial clears coordinates while stop, pagehide and destroy clean every resource', () => {
  const denied = setup();
  denied.controller.start('session');
  denied.geolocation.fix(-36.9, -71.5, 80, 101_000);
  denied.geolocation.fail(1);
  assert.equal(denied.controller.getState(), 'denied');
  assert.equal(denied.controller.getSnapshot(), null);
  assert.equal(denied.geolocation.active(), 0);

  const hidden = setup();
  hidden.controller.start('session');
  hidden.geolocation.fix(-36.9, -71.5, 80, 101_000);
  hidden.pagehide();
  assert.equal(hidden.controller.getState(), 'idle');
  assert.equal(hidden.controller.getSnapshot(), null);
  assert.equal(hidden.geolocation.active(), 0);
  hidden.controller.destroy();
  assert.equal(hidden.hasPagehide(), false);
});

test('manual fixes are ephemeral, reroutable and retry returns to the previous GPS mode', () => {
  const { controller, events } = setup();
  controller.start('session');
  controller.setManual({ lat: -36.9, lon: -71.5 });
  assert.deepEqual({ ...controller.getSnapshot() }, {
    source: 'manual', lat: -36.9, lon: -71.5, accuracy: 0, timestamp: 100_000, quality: 'precise'
  });
  assert.equal(controller.getMode(), 'manual');
  assert.equal(events.at(-2).type, 'snapshot');
  assert.equal(events.at(-2).shouldReroute, true);
  controller.stop();
  assert.equal(controller.getSnapshot(), null);
  assert.equal(controller.retry(), true);
  assert.equal(controller.getMode(), 'session');
});

test('permission preflight is optional and unsupported or insecure environments fail clearly', async () => {
  let permissionListener;
  const prompt = {
    state: 'prompt',
    addEventListener(type, listener) { if (type === 'change') permissionListener = listener; },
    removeEventListener() {}
  };
  const withPermission = setup({ navigator: { permissions: { query: async () => prompt } } });
  withPermission.controller.start('session');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(withPermission.controller.getPermission(), 'prompt');
  prompt.state = 'denied';
  permissionListener();
  assert.equal(withPermission.controller.getState(), 'denied');

  const noApi = setup();
  noApi.controller.destroy();
  const clock = makeClock();
  const controller = loadController().api.create({
    navigator: {}, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout
  });
  assert.equal(controller.start('once'), false);
  assert.equal(controller.getState(), 'unavailable');

  const insecure = setup({ secureContext: false });
  assert.equal(insecure.controller.start('once'), false);
  assert.equal(insecure.controller.getState(), 'unavailable');
});
