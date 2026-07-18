import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  __test,
  constantTimeEqual,
  createToken,
  handleRequest,
  isAllowedOrigin,
  localToUtcSeconds,
  parseOfficialSkiPrices,
  parseAllowedOrigins,
  pinDigest,
  skiPriceForDate,
  utcSecondsToLocal,
  verifyToken
} from '../src/index.js';

const tokenEnv = {
  TOKEN_SECRET: 'token-secret-that-is-longer-than-thirty-two-characters',
  TOKEN_ISSUER: 'cordal-sur-test'
};

const skiFixture = readFileSync(new URL('./fixtures/nevados-ski-prices.html', import.meta.url), 'utf8');

function createSkiPriceDb() {
  let row = null;
  return {
    prepare(sql) {
      let values = [];
      return {
        bind(...nextValues) {
          values = nextValues;
          return this;
        },
        async first() {
          return /SELECT payload_json/i.test(sql) ? row : null;
        },
        async run() {
          if (/INSERT INTO ski_price_snapshots/i.test(sql)) {
            row = { payload_json: values[0], fetched_at: values[2] };
          }
          return { meta: { changes: 1 } };
        }
      };
    }
  };
}

function skiPriceEnv(fetcher, db = createSkiPriceDb()) {
  return {
    ...tokenEnv,
    DB: db,
    ALLOWED_ORIGINS: 'https://josetomasayalams-rgb.github.io',
    PIN_PEPPER: 'pepper-that-is-longer-than-thirty-two-characters',
    ADMIN_PIN_DIGEST: 'a'.repeat(64),
    DEFAULT_GUEST_PIN_DIGEST: 'b'.repeat(64),
    SKI_PRICE_FETCHER: fetcher
  };
}

test('CORS origin matching is exact and trims configuration whitespace', () => {
  const configured = 'https://josetomasayalams-rgb.github.io, http://127.0.0.1:8765 ';
  assert.deepEqual(parseAllowedOrigins(configured), [
    'https://josetomasayalams-rgb.github.io',
    'http://127.0.0.1:8765'
  ]);
  assert.equal(isAllowedOrigin('https://josetomasayalams-rgb.github.io', configured), true);
  assert.equal(isAllowedOrigin('https://evil.example', configured), false);
  assert.equal(isAllowedOrigin('https://josetomasayalams-rgb.github.io.evil.example', configured), false);
});

test('preflight returns only the requesting allowlisted origin', async () => {
  const response = await handleRequest(new Request('https://worker.example/v1/access/status', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://josetomasayalams-rgb.github.io',
      'Access-Control-Request-Method': 'GET'
    }
  }), { ALLOWED_ORIGINS: 'https://josetomasayalams-rgb.github.io' });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://josetomasayalams-rgb.github.io');
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
});

test('a disallowed browser origin receives no CORS grant', async () => {
  const response = await handleRequest(new Request('https://worker.example/v1/access/status', {
    headers: { Origin: 'https://evil.example' }
  }), { ALLOWED_ORIGINS: 'https://josetomasayalams-rgb.github.io' });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('PIN digest is HMAC-SHA256 with a server-side pepper', async () => {
  const pepper = 'pepper-that-is-at-least-thirty-two-characters';
  const expected = createHmac('sha256', pepper).update('12-34').digest('hex');
  assert.equal(await pinDigest('12-34', pepper), expected);
  assert.equal(constantTimeEqual(expected, expected), true);
  assert.equal(constantTimeEqual(expected, expected.slice(0, -1) + '0'), false);
  assert.equal(constantTimeEqual('short', 'a-much-longer-value'), false);
});

test('signed tokens detect tampering and expire at exp', async () => {
  const claims = { role: 'admin', sub: 'admin', iat: 1_700_000_000, exp: 1_700_001_800 };
  const token = await createToken(claims, tokenEnv);
  const verified = await verifyToken(token, tokenEnv, 1_700_000_100);
  assert.equal(verified.role, 'admin');
  assert.equal(verified.exp, claims.exp);
  await assert.rejects(() => verifyToken(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'), tokenEnv, 1_700_000_100));
  await assert.rejects(() => verifyToken(token, tokenEnv, claims.exp), (error) => error.code === 'session_expired');
});

test('America/Santiago local timestamps round-trip in summer and winter', () => {
  for (const local of ['2026-01-13T12:00', '2026-07-13T12:00']) {
    const utc = localToUtcSeconds(local);
    assert.equal(utcSecondsToLocal(utc), local);
  }
  assert.equal(new Date(localToUtcSeconds('2026-01-13T12:00') * 1000).toISOString(), '2026-01-13T15:00:00.000Z');
  assert.equal(new Date(localToUtcSeconds('2026-07-13T12:00') * 1000).toISOString(), '2026-07-13T16:00:00.000Z');
});

test('official ski parser combines the operation calendar with verified web prices', () => {
  const snapshot = parseOfficialSkiPrices(skiFixture, 1_784_398_400);
  assert.equal(snapshot.product, 'Ticket diario web · Adulto y niño');
  assert.deepEqual(snapshot.prices, { high: 80_000, low: 70_000 });
  assert.deepEqual(skiPriceForDate(snapshot, '2026-07-19'), {
    date: '2026-07-19', product: snapshot.product, currency: 'CLP', season: 'high', price: 80_000,
    available: true, sourceUrl: snapshot.sourceUrl, fetchedAt: new Date(1_784_398_400 * 1000).toISOString()
  });
  assert.equal(skiPriceForDate(snapshot, '2026-08-03').price, 70_000);
  assert.equal(skiPriceForDate(snapshot, '2026-07-18').available, false);
  assert.equal(skiPriceForDate(snapshot, '2026-09-21').price, null);
});

test('official ski parser rejects incomplete, overlapping or implausible source data', () => {
  assert.throws(() => parseOfficialSkiPrices(skiFixture.replace('80.000', '800')), /Invalid official ski price/);
  assert.throws(() => parseOfficialSkiPrices(skiFixture.replace('03-08-2026 al 07-08-2026', '01-08-2026 al 07-08-2026')), /overlapping/);
  assert.throws(() => parseOfficialSkiPrices(skiFixture.replace('<h2>Ticket diario web</h2>', '<h2>Otro producto</h2>')), /not found/);
});

test('public ski endpoint refreshes once and falls back to the last verified snapshot', async () => {
  let calls = 0;
  let shouldFail = false;
  const db = createSkiPriceDb();
  const env = skiPriceEnv(async () => {
    calls += 1;
    if (shouldFail) throw new Error('network down');
    return new Response(skiFixture, { status: 200 });
  }, db);
  const request = (query = '') => new Request(`https://worker.example/v1/public/ski-price?date=2026-08-03${query}`, {
    headers: { Origin: 'https://josetomasayalams-rgb.github.io' }
  });

  const live = await handleRequest(request(), env);
  assert.equal(live.status, 200);
  assert.equal((await live.json()).price, 70_000);
  assert.equal(calls, 1);

  const cached = await handleRequest(request(), env);
  assert.equal((await cached.json()).sourceStatus, 'cache');
  assert.equal(calls, 1);

  shouldFail = true;
  const stale = await handleRequest(request('&refresh=1'), env);
  const staleBody = await stale.json();
  assert.equal(stale.status, 200);
  assert.equal(staleBody.price, 70_000);
  assert.equal(staleBody.stale, true);
  assert.equal(staleBody.sourceStatus, 'stale-cache');
  assert.equal(calls, 2);
});

test('public ski endpoint never invents a price when no verified snapshot exists', async () => {
  const response = await handleRequest(new Request('https://worker.example/v1/public/ski-price?date=2026-08-03', {
    headers: { Origin: 'https://josetomasayalams-rgb.github.io' }
  }), skiPriceEnv(async () => { throw new Error('network down'); }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'ski_price_unavailable');
});

test('DST gaps and duplicate wall times are rejected instead of guessed', () => {
  assert.throws(() => localToUtcSeconds('2025-09-07T00:30'), (error) => error.code === 'nonexistent_local_time');
  assert.throws(() => localToUtcSeconds('2025-04-05T23:30'), (error) => error.code === 'ambiguous_local_time');
});

test('security policy constants match the access contract', () => {
  assert.equal(__test.TIME_ZONE, 'America/Santiago');
  assert.equal(__test.ADMIN_SESSION_SECONDS, 30 * 60);
  assert.equal(__test.FAILURE_LIMIT, 5);
  assert.equal(__test.FAILURE_WINDOW_SECONDS, 15 * 60);
  assert.equal(__test.LOCK_SECONDS, 30 * 60);
});

test('place override validation supports every editorial action without trusting arbitrary payloads', () => {
  const base = { placeId: 'osm-node-123', reason: 'Verified by the local operations team.' };
  assert.deepEqual(__test.validatePlaceOverride({ ...base, action: 'category', payload: { category: 'pharmacy', ignored: true } }).payload, { category: 'pharmacy' });
  assert.deepEqual(__test.validatePlaceOverride({ ...base, action: 'location', payload: { lat: -36.8, lon: -71.6, coordinateKind: 'entrance' } }).payload,
    { lat: -36.8, lon: -71.6, coordinateKind: 'entrance' });
  assert.equal(__test.validatePlaceOverride({ ...base, action: 'website', payload: { websiteUrl: 'https://example.com' } }).payload.websiteUrl, 'https://example.com/');
  assert.equal(__test.validatePlaceOverride({ ...base, action: 'instagram', payload: { instagramUrl: 'https://instagram.com/example', verifiedFrom: 'https://example.com/contact' } }).payload.instagramUrl,
    'https://instagram.com/example');
  assert.deepEqual(__test.validatePlaceOverride({ ...base, action: 'closed', payload: { closed: true } }).payload, { closed: true, checkedAt: null });
  assert.equal(__test.validatePlaceOverride({ ...base, action: 'merge', targetPlaceId: 'google-abc', payload: {} }).targetPlaceId, 'google-abc');
  assert.equal(__test.validatePlaceOverride({ ...base, action: 'add', payload: {
    name: 'Farmacia local', category: 'pharmacy', lat: -36.8, lon: -71.6, sourceUrl: 'https://example.com/source'
  } }).payload.name, 'Farmacia local');
  assert.throws(() => __test.validatePlaceOverride({ ...base, action: 'instagram', payload: { instagramUrl: 'https://instagram.com/guessed' } }), /verification source/i);
  assert.throws(() => __test.validatePlaceOverride({ ...base, action: 'merge', targetPlaceId: base.placeId }), /itself/i);
  assert.throws(() => __test.validatePlaceOverride({ ...base, action: 'website', payload: { websiteUrl: 'http://example.com' } }), /HTTPS/);
});

test('place override routes require an administrator session before touching D1', async () => {
  const env = {
    ...tokenEnv,
    DB: {},
    ALLOWED_ORIGINS: 'https://app.example',
    PIN_PEPPER: 'pepper-that-is-longer-than-thirty-two-characters',
    ADMIN_PIN_DIGEST: 'a'.repeat(64),
    DEFAULT_GUEST_PIN_DIGEST: 'b'.repeat(64)
  };
  const response = await handleRequest(new Request('https://worker.example/v1/admin/place-overrides', {
    headers: { Origin: 'https://app.example' }
  }), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'missing_token');
});

test('authenticated override writes validate payload before a D1 mutation', async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await createToken({ role: 'admin', sub: 'admin', iat: now, exp: now + 300 }, tokenEnv);
  const env = {
    ...tokenEnv,
    DB: {},
    ALLOWED_ORIGINS: 'https://app.example',
    PIN_PEPPER: 'pepper-that-is-longer-than-thirty-two-characters',
    ADMIN_PIN_DIGEST: 'a'.repeat(64),
    DEFAULT_GUEST_PIN_DIGEST: 'b'.repeat(64)
  };
  const response = await handleRequest(new Request('https://worker.example/v1/admin/place-overrides', {
    method: 'POST',
    headers: { Origin: 'https://app.example', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'category', placeId: 'osm-node-1', payload: { category: 'INVALID VALUE' }, reason: 'invalid category test' })
  }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'validation_error');
});

test('D1 place override migration keeps current revisions and append-only history separate', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cordal-sur-overrides-'));
  const database = join(directory, 'test.sqlite');
  try {
    const migrations = [
      readFileSync(new URL('../migrations/0001_access.sql', import.meta.url), 'utf8'),
      readFileSync(new URL('../migrations/0002_place_overrides.sql', import.meta.url), 'utf8'),
      readFileSync(new URL('../migrations/0003_ski_price_snapshots.sql', import.meta.url), 'utf8')
    ].join('\n');
    execFileSync('sqlite3', [database], { input: migrations });
    execFileSync('sqlite3', [database, `INSERT INTO place_overrides VALUES ('one','category','osm-node-1',NULL,'{"category":"pharmacy"}','verified locally',1,'admin',1,1);`]);
    execFileSync('sqlite3', [database, `INSERT INTO place_override_history VALUES ('history-one','one','create','{}',1,'admin',1);`]);
    assert.equal(execFileSync('sqlite3', [database, 'SELECT COUNT(*) FROM place_overrides;'], { encoding: 'utf8' }).trim(), '1');
    assert.equal(execFileSync('sqlite3', [database, 'SELECT COUNT(*) FROM place_override_history;'], { encoding: 'utf8' }).trim(), '1');
    assert.equal(execFileSync('sqlite3', [database, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ski_price_snapshots';"], { encoding: 'utf8' }).trim(), '1');
    assert.throws(() => execFileSync('sqlite3', [database, `INSERT INTO place_overrides VALUES ('bad','unsupported','x',NULL,'{}','bad reason',1,'admin',1,1);`], { stdio: 'pipe' }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('D1 migration enforces half-open, non-overlapping stay windows', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cordal-sur-d1-'));
  const database = join(directory, 'test.sqlite');
  try {
    const migration = readFileSync(new URL('../migrations/0001_access.sql', import.meta.url), 'utf8');
    execFileSync('sqlite3', [database], { input: migration });
    const digest = 'a'.repeat(64);
    execFileSync('sqlite3', [database, `INSERT INTO stays VALUES ('one','',100,200,'${digest}',1,1,1,1);`]);
    // [100, 200) and [200, 300) touch but do not overlap.
    execFileSync('sqlite3', [database, `INSERT INTO stays VALUES ('two','',200,300,'${digest}',1,1,1,1);`]);
    assert.throws(() => {
      execFileSync('sqlite3', [database, `INSERT INTO stays VALUES ('bad','',150,250,'${digest}',1,1,1,1);`], { stdio: 'pipe' });
    });
    const count = execFileSync('sqlite3', [database, 'SELECT COUNT(*) FROM stays;'], { encoding: 'utf8' }).trim();
    assert.equal(count, '2');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('atomic attempt reservation allows five comparisons and locks the sixth', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cordal-sur-rate-'));
  const database = join(directory, 'test.sqlite');
  const sqlValue = (value) => typeof value === 'number'
    ? String(value)
    : `'${String(value).replace(/'/g, "''")}'`;
  const bindSql = (sql, values) => {
    let index = 0;
    const bound = sql.replace(/\?/g, () => sqlValue(values[index++]));
    assert.equal(index, values.length);
    return bound;
  };
  const reserve = (now) => execFileSync('sqlite3', [database, bindSql(__test.RESERVE_ATTEMPT_SQL, [
    'rate-key', 'admin', now, now,
    __test.FAILURE_WINDOW_SECONDS, __test.FAILURE_WINDOW_SECONDS, __test.FAILURE_WINDOW_SECONDS,
    __test.FAILURE_LIMIT, __test.LOCK_SECONDS
  ])], { encoding: 'utf8' }).trim();
  try {
    const migration = readFileSync(new URL('../migrations/0001_access.sql', import.meta.url), 'utf8');
    execFileSync('sqlite3', [database], { input: migration });
    for (let attempt = 1; attempt <= __test.FAILURE_LIMIT; attempt += 1) {
      assert.equal(reserve(1_000), `${attempt}|1000|0`);
    }
    assert.equal(reserve(1_000), `6|1000|${1_000 + __test.LOCK_SECONDS}`);
    assert.equal(reserve(1_001), `6|1000|${1_000 + __test.LOCK_SECONDS}`);
    assert.equal(reserve(1_000 + __test.LOCK_SECONDS + 1), `1|${1_000 + __test.LOCK_SECONDS + 1}|0`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
