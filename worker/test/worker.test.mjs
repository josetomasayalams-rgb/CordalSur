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
  parseAllowedOrigins,
  pinDigest,
  utcSecondsToLocal,
  verifyToken
} from '../src/index.js';

const tokenEnv = {
  TOKEN_SECRET: 'token-secret-that-is-longer-than-thirty-two-characters',
  TOKEN_ISSUER: 'cordal-sur-test'
};

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
