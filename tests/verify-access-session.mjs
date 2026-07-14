import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'js/access.js'), 'utf8');
const ADMIN_KEY = 'cordal-sur-admin-token-v1';
const GUEST_KEY = 'cordal-sur-guest-token-v1';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function classList() {
  const values = new Set();
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    remove(...names) { names.forEach((name) => values.delete(name)); },
    contains(name) { return values.has(name); }
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; }
  };
}

async function runScenario({ adminToken = '', guestToken = '', now = Date.parse('2026-07-13T18:00:00Z'), fetchHandler }) {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const timers = new Map();
  const attributes = new Map();
  const fetchCalls = [];
  let timerId = 0;
  let currentNow = now;

  const htmlClasses = classList();
  const documentElement = {
    classList: htmlClasses,
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
    getAttribute(name) { return attributes.get(name) || null; }
  };
  const root = {
    isConnected: false,
    innerHTML: '',
    className: '',
    setAttribute() {},
    addEventListener() {},
    querySelectorAll() { return []; },
    querySelector() { return null; },
    focus() {},
    remove() { this.isConnected = false; }
  };
  const document = {
    currentScript: {
      getAttribute(name) {
        return name === 'data-api-base' ? 'https://access.example.test' : null;
      }
    },
    documentElement,
    body: { appendChild(node) { node.isConnected = true; } },
    readyState: 'loading',
    hidden: false,
    createElement() { return root; },
    querySelector() { return null; },
    addEventListener(type, listener) {
      const listeners = documentListeners.get(type) || [];
      listeners.push(listener);
      documentListeners.set(type, listeners);
    }
  };
  const localStorage = memoryStorage(guestToken ? { [GUEST_KEY]: guestToken } : {});
  const sessionStorage = memoryStorage(adminToken ? { [ADMIN_KEY]: adminToken } : {});
  const window = {
    GH_I18N: {
      getLang() { return 'es'; },
      setLang() {},
      t(key) { return key; }
    },
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
    dispatchEvent() {}
  };
  class FakeDate extends Date {
    static now() { return currentNow; }
  }
  class FakeCustomEvent {
    constructor(type, init) { this.type = type; this.detail = init && init.detail; }
  }
  const context = {
    AbortController,
    CustomEvent: FakeCustomEvent,
    Date: FakeDate,
    document,
    fetch: async (url, options = {}) => {
      fetchCalls.push({ url, options });
      return fetchHandler(url, options, fetchCalls.length);
    },
    localStorage,
    location: { hostname: 'example.test' },
    sessionStorage,
    setTimeout(listener, delay = 0) {
      timerId += 1;
      timers.set(timerId, { listener, delay });
      return timerId;
    },
    clearTimeout(id) { timers.delete(id); },
    window
  };

  vm.createContext(context);
  vm.runInContext(SOURCE, context, { filename: 'js/access.js' });
  const boot = (documentListeners.get('DOMContentLoaded') || [])[0];
  assert.equal(typeof boot, 'function', 'access boot listener was not registered');
  await boot();

  return {
    attributes,
    document,
    fetchCalls,
    htmlClasses,
    localStorage,
    root,
    sessionStorage,
    setNow(value) { currentNow = value; },
    async runLongestTimer() {
      const entry = [...timers.entries()].sort((left, right) => right[1].delay - left[1].delay)[0];
      assert.ok(entry, 'expected a scheduled session check');
      timers.delete(entry[0]);
      await entry[1].listener();
    }
  };
}

const tests = [
  ['a valid administrator session opens the protected platform', async () => {
    const app = await runScenario({
      adminToken: 'admin-token',
      fetchHandler: async (url, options) => {
        assert.match(url, /\/v1\/auth\/session$/);
        assert.equal(options.headers.Authorization, 'Bearer admin-token');
        return jsonResponse(200, { valid: true, role: 'admin', expiresAt: '2026-07-13T18:30:00.000Z' });
      }
    });
    assert.equal(app.htmlClasses.contains('access-granted'), true);
    assert.equal(app.attributes.get('data-access-role'), 'admin');
    assert.equal(app.sessionStorage.getItem(ADMIN_KEY), 'admin-token');
  }],
  ['an expired administrator session falls back to a valid guest session', async () => {
    const app = await runScenario({
      adminToken: 'expired-admin',
      guestToken: 'valid-guest',
      fetchHandler: async (url, options, call) => {
        assert.match(url, /\/v1\/auth\/session$/);
        if (call === 1) {
          assert.equal(options.headers.Authorization, 'Bearer expired-admin');
          return jsonResponse(401, { error: { code: 'session_expired', message: 'expired' } });
        }
        assert.equal(options.headers.Authorization, 'Bearer valid-guest');
        return jsonResponse(200, { valid: true, role: 'guest', expiresAt: '2026-07-14T15:00:00.000Z' });
      }
    });
    assert.equal(app.attributes.get('data-access-role'), 'guest');
    assert.equal(app.sessionStorage.getItem(ADMIN_KEY), null);
    assert.equal(app.localStorage.getItem(GUEST_KEY), 'valid-guest');
  }],
  ['a transient network error preserves the administrator session', async () => {
    const app = await runScenario({
      adminToken: 'admin-token',
      guestToken: 'guest-token',
      fetchHandler: async () => { throw new TypeError('temporary network failure'); }
    });
    assert.equal(app.htmlClasses.contains('access-granted'), false);
    assert.equal(app.sessionStorage.getItem(ADMIN_KEY), 'admin-token');
    assert.equal(app.localStorage.getItem(GUEST_KEY), 'guest-token');
    assert.equal(app.fetchCalls.length, 1);
  }],
  ['an administrator role mismatch never grants access', async () => {
    const app = await runScenario({
      adminToken: 'wrong-role-token',
      fetchHandler: async (url, options, call) => {
        if (call === 1) return jsonResponse(200, { valid: true, role: 'guest', expiresAt: '2026-07-14T15:00:00.000Z' });
        assert.match(url, /\/v1\/access\/status$/);
        return jsonResponse(200, { active: false, timeZone: 'America/Santiago' });
      }
    });
    assert.equal(app.htmlClasses.contains('access-granted'), false);
    assert.equal(app.sessionStorage.getItem(ADMIN_KEY), null);
  }],
  ['expiration while hidden still recovers a valid guest session', async () => {
    const start = Date.parse('2026-07-13T18:00:00Z');
    const app = await runScenario({
      adminToken: 'short-admin',
      guestToken: 'valid-guest',
      now: start,
      fetchHandler: async (url, options, call) => {
        assert.match(url, /\/v1\/auth\/session$/);
        if (call === 1) return jsonResponse(200, { valid: true, role: 'admin', expiresAt: new Date(start + 1000).toISOString() });
        assert.equal(options.headers.Authorization, 'Bearer valid-guest');
        return jsonResponse(200, { valid: true, role: 'guest', expiresAt: new Date(start + 3600000).toISOString() });
      }
    });
    app.document.hidden = true;
    app.setNow(start + 2000);
    await app.runLongestTimer();
    assert.equal(app.attributes.get('data-access-role'), 'guest');
    assert.equal(app.sessionStorage.getItem(ADMIN_KEY), null);
    assert.equal(app.localStorage.getItem(GUEST_KEY), 'valid-guest');
  }]
];

let failures = 0;
for (const [name, test] of tests) {
  try {
    await test();
  } catch (error) {
    failures += 1;
    console.error(`  FAIL: ${name}`);
    console.error(`        ${error.stack || error.message}`);
  }
}
if (failures) process.exitCode = 1;
else console.log(`  PASS (${tests.length} administrator session scenarios)`);
