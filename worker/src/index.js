const API_PREFIX = '/v1';
const TIME_ZONE = 'America/Santiago';
const ADMIN_SESSION_SECONDS = 30 * 60;
const FAILURE_WINDOW_SECONDS = 15 * 60;
const FAILURE_LIMIT = 5;
const LOCK_SECONDS = 30 * 60;
const MAX_JSON_BYTES = 16 * 1024;
const PIN_PATTERN = /^\d{2}-\d{2}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function baseHeaders() {
  return {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...baseHeaders(), ...extraHeaders }
  });
}

function empty(status = 204, extraHeaders = {}) {
  const headers = { ...baseHeaders(), ...extraHeaders };
  delete headers['Content-Type'];
  return new Response(null, { status, headers });
}

function errorResponse(error) {
  if (error instanceof ApiError) {
    return json({ error: { code: error.code, message: error.message, ...error.extra } }, error.status);
  }
  console.error('Unhandled CordalSur access error', error);
  return json({ error: { code: 'internal_error', message: 'Unexpected server error.' } }, 500);
}

export function parseAllowedOrigins(raw = '') {
  return String(raw)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAllowedOrigin(origin, rawAllowedOrigins) {
  if (!origin) return true; // Non-browser tools do not send Origin; CORS is not authentication.
  return parseAllowedOrigins(rawAllowedOrigins).includes(origin);
}

function corsHeaders(origin) {
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function withCors(response, origin) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(origin)).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function assertEnvironment(env) {
  const missing = [];
  if (!env.DB) missing.push('DB');
  if (!env.TOKEN_SECRET || String(env.TOKEN_SECRET).length < 32) missing.push('TOKEN_SECRET');
  if (!env.PIN_PEPPER || String(env.PIN_PEPPER).length < 32) missing.push('PIN_PEPPER');
  if (!/^[a-f0-9]{64}$/i.test(String(env.ADMIN_PIN_DIGEST || ''))) missing.push('ADMIN_PIN_DIGEST');
  if (!/^[a-f0-9]{64}$/i.test(String(env.DEFAULT_GUEST_PIN_DIGEST || ''))) missing.push('DEFAULT_GUEST_PIN_DIGEST');
  if (!parseAllowedOrigins(env.ALLOWED_ORIGINS).length) missing.push('ALLOWED_ORIGINS');
  if (missing.length) {
    throw new ApiError(500, 'server_not_configured', `Missing or invalid configuration: ${missing.join(', ')}`);
  }
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new ApiError(401, 'invalid_token', 'Invalid access token.');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  let binary;
  try {
    binary = atob(padded);
  } catch {
    throw new ApiError(401, 'invalid_token', 'Invalid access token.');
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function constantTimeEqual(left, right) {
  const a = left instanceof Uint8Array ? left : encoder.encode(String(left));
  const b = right instanceof Uint8Array ? right : encoder.encode(String(right));
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] || 0) ^ (b[index] || 0);
  }
  return difference === 0;
}

async function hmacBytes(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

export async function pinDigest(pin, pepper) {
  const bytes = await hmacBytes(pin, pepper);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function issuer(env) {
  return String(env.TOKEN_ISSUER || 'cordal-sur-access');
}

export async function createToken(claims, env) {
  const payload = { v: 1, iss: issuer(env), ...claims };
  const encodedPayload = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const unsigned = `v1.${encodedPayload}`;
  const signature = bytesToBase64Url(await hmacBytes(unsigned, env.TOKEN_SECRET));
  return `${unsigned}.${signature}`;
}

export async function verifyToken(token, env, currentTime = nowSeconds()) {
  if (typeof token !== 'string' || token.length > 4096) {
    throw new ApiError(401, 'invalid_token', 'Invalid access token.');
  }
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') {
    throw new ApiError(401, 'invalid_token', 'Invalid access token.');
  }
  const expected = await hmacBytes(`${parts[0]}.${parts[1]}`, env.TOKEN_SECRET);
  const actual = base64UrlToBytes(parts[2]);
  if (!constantTimeEqual(expected, actual)) {
    throw new ApiError(401, 'invalid_token', 'Invalid access token.');
  }
  let claims;
  try {
    claims = JSON.parse(decoder.decode(base64UrlToBytes(parts[1])));
  } catch {
    throw new ApiError(401, 'invalid_token', 'Invalid access token.');
  }
  if (
    claims.v !== 1 ||
    claims.iss !== issuer(env) ||
    !['guest', 'admin'].includes(claims.role) ||
    !Number.isInteger(claims.iat) ||
    !Number.isInteger(claims.exp) ||
    claims.iat > currentTime + 60
  ) {
    throw new ApiError(401, 'invalid_token', 'Invalid access token.');
  }
  if (claims.exp <= currentTime) {
    throw new ApiError(401, 'session_expired', 'The access session has expired.');
  }
  return claims;
}

function bearerToken(request) {
  const authorization = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) throw new ApiError(401, 'missing_token', 'An access token is required.');
  return match[1];
}

async function readJson(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'content_type', 'Content-Type must be application/json.');
  }
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > MAX_JSON_BYTES) throw new ApiError(413, 'body_too_large', 'Request body is too large.');
  const text = await request.text();
  if (encoder.encode(text).length > MAX_JSON_BYTES) throw new ApiError(413, 'body_too_large', 'Request body is too large.');
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'invalid_json', 'Request body must be a JSON object.');
  }
  return body;
}

function normalizePin(value, field = 'pin') {
  const pin = String(value || '').trim();
  if (!PIN_PATTERN.test(pin)) {
    throw new ApiError(400, 'invalid_pin_format', `${field} must use the NN-NN format.`);
  }
  return pin;
}

function localParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) throw new ApiError(400, 'invalid_local_time', 'Date and time must use YYYY-MM-DDTHH:mm.');
  const parts = {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4]), minute: Number(match[5])
  };
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));
  if (
    check.getUTCFullYear() !== parts.year || check.getUTCMonth() + 1 !== parts.month ||
    check.getUTCDate() !== parts.day || check.getUTCHours() !== parts.hour ||
    check.getUTCMinutes() !== parts.minute
  ) {
    throw new ApiError(400, 'invalid_local_time', 'Date and time are invalid.');
  }
  return parts;
}

const zoneFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23'
});

function zonedParts(timestampMs) {
  const values = {};
  for (const part of zoneFormatter.formatToParts(new Date(timestampMs))) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return values;
}

function zoneOffsetMinutes(timestampMs) {
  const parts = zonedParts(timestampMs);
  const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((representedAsUtc - timestampMs) / 60000);
}

function sameLocal(parts, timestampMs) {
  const candidate = zonedParts(timestampMs);
  return candidate.year === parts.year && candidate.month === parts.month && candidate.day === parts.day &&
    candidate.hour === parts.hour && candidate.minute === parts.minute;
}

export function localToUtcSeconds(value) {
  const parts = localParts(value);
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const probes = [-48, -24, -12, 0, 12, 24, 48].map((hours) => wallAsUtc + hours * 3600000);
  const offsets = [...new Set(probes.map(zoneOffsetMinutes))];
  const candidates = offsets
    .map((offset) => wallAsUtc - offset * 60000)
    .filter((candidate) => sameLocal(parts, candidate));
  const unique = [...new Set(candidates)];
  if (unique.length === 0) {
    throw new ApiError(400, 'nonexistent_local_time', `That time does not exist in ${TIME_ZONE} because of a clock change.`);
  }
  if (unique.length > 1) {
    throw new ApiError(400, 'ambiguous_local_time', `That time occurs twice in ${TIME_ZONE}; choose another minute.`);
  }
  return Math.floor(unique[0] / 1000);
}

export function utcSecondsToLocal(timestamp) {
  const parts = zonedParts(Number(timestamp) * 1000);
  const pad = (number) => String(number).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function iso(timestamp) {
  return new Date(Number(timestamp) * 1000).toISOString();
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Real-IP') || 'unknown';
}

async function rateKey(scope, request, env) {
  return pinDigest(`${scope}\u0000${clientIp(request)}`, env.PIN_PEPPER);
}

const RESERVE_ATTEMPT_SQL = `
  INSERT INTO auth_attempts (rate_key, scope, failures, window_started_at, locked_until, updated_at)
  VALUES (?, ?, 1, ?, 0, ?)
  ON CONFLICT(rate_key) DO UPDATE SET
    scope = excluded.scope,
    failures = CASE
      WHEN auth_attempts.locked_until > excluded.updated_at THEN auth_attempts.failures
      WHEN excluded.updated_at - auth_attempts.window_started_at < ? THEN auth_attempts.failures + 1
      ELSE 1
    END,
    window_started_at = CASE
      WHEN auth_attempts.locked_until > excluded.updated_at THEN auth_attempts.window_started_at
      WHEN excluded.updated_at - auth_attempts.window_started_at < ? THEN auth_attempts.window_started_at
      ELSE excluded.updated_at
    END,
    locked_until = CASE
      WHEN auth_attempts.locked_until > excluded.updated_at THEN auth_attempts.locked_until
      WHEN excluded.updated_at - auth_attempts.window_started_at < ?
           AND auth_attempts.failures + 1 > ? THEN excluded.updated_at + ?
      ELSE 0
    END,
    updated_at = excluded.updated_at
  RETURNING failures, window_started_at, locked_until
`;

async function reserveAttempt(scope, request, env, currentTime) {
  const key = await rateKey(scope, request, env);
  await env.DB.prepare('DELETE FROM auth_attempts WHERE updated_at < ?')
    .bind(currentTime - FAILURE_WINDOW_SECONDS - LOCK_SECONDS)
    .run();
  // Reserve a comparison before checking the PIN. D1 serializes this one
  // statement, so a parallel burst can never perform more than FAILURE_LIMIT
  // credential comparisons in the window.
  const updated = await env.DB.prepare(RESERVE_ATTEMPT_SQL).bind(
    key, scope, currentTime, currentTime,
    FAILURE_WINDOW_SECONDS, FAILURE_WINDOW_SECONDS, FAILURE_WINDOW_SECONDS,
    FAILURE_LIMIT, LOCK_SECONDS
  ).first();
  const lockedUntil = Number(updated && updated.locked_until || 0);
  if (lockedUntil > currentTime) {
    throw new ApiError(429, 'rate_limited', 'Too many attempts. Try again later.', {
      retryAfter: lockedUntil - currentTime
    });
  }
  return key;
}

async function clearFailures(key, env) {
  await env.DB.prepare('DELETE FROM auth_attempts WHERE rate_key = ?').bind(key).run();
}

async function activeStay(env, currentTime) {
  return env.DB.prepare(`
    SELECT id, label, starts_at, ends_at, guest_pin_digest, enabled, revision
    FROM stays
    WHERE enabled = 1 AND starts_at <= ? AND ends_at > ?
    ORDER BY starts_at ASC
    LIMIT 1
  `).bind(currentTime, currentTime).first();
}

async function authenticatedClaims(request, env, expectedRole, currentTime) {
  const claims = await verifyToken(bearerToken(request), env, currentTime);
  if (claims.role !== expectedRole) throw new ApiError(403, 'forbidden', 'This session cannot access that resource.');
  if (expectedRole === 'guest') {
    if (typeof claims.stayId !== 'string' || !Number.isInteger(claims.revision)) {
      throw new ApiError(401, 'invalid_token', 'Invalid access token.');
    }
    const stay = await env.DB.prepare(`
      SELECT id, label, starts_at, ends_at, enabled, revision
      FROM stays WHERE id = ?
    `).bind(claims.stayId).first();
    if (!stay || !Number(stay.enabled) || Number(stay.revision) !== claims.revision ||
        Number(stay.starts_at) > currentTime || Number(stay.ends_at) <= currentTime ||
        claims.exp > Number(stay.ends_at)) {
      throw new ApiError(401, 'session_revoked', 'This guest session is no longer active.');
    }
    return { claims, stay };
  }
  return { claims };
}

function stayResponse(row, currentTime = nowSeconds()) {
  const startsAt = Number(row.starts_at);
  const endsAt = Number(row.ends_at);
  let status = 'upcoming';
  if (endsAt <= currentTime) status = 'ended';
  else if (!Number(row.enabled)) status = 'disabled';
  else if (startsAt <= currentTime && endsAt > currentTime) status = 'active';
  return {
    id: row.id,
    label: row.label || '',
    startUtc: iso(startsAt),
    endUtc: iso(endsAt),
    startLocal: utcSecondsToLocal(startsAt),
    endLocal: utcSecondsToLocal(endsAt),
    timeZone: TIME_ZONE,
    enabled: Boolean(Number(row.enabled)),
    revision: Number(row.revision),
    status,
    createdAt: row.created_at ? iso(row.created_at) : undefined,
    updatedAt: row.updated_at ? iso(row.updated_at) : undefined
  };
}

function cleanLabel(value) {
  if (value === undefined) return undefined;
  const label = String(value).trim();
  if (label.length > 80) throw new ApiError(400, 'validation_error', 'Label cannot exceed 80 characters.');
  return label;
}

async function assertNoOverlap(env, startsAt, endsAt, excludeId = '') {
  const row = await env.DB.prepare(`
    SELECT id FROM stays
    WHERE id <> ? AND starts_at < ? AND ends_at > ?
    LIMIT 1
  `).bind(excludeId, endsAt, startsAt).first();
  if (row) throw new ApiError(409, 'stay_overlap', 'The stay overlaps an existing stay.');
}

async function runStayMutation(statement) {
  try {
    return await statement.run();
  } catch (error) {
    if (String(error && error.message || error).includes('stay_overlap')) {
      throw new ApiError(409, 'stay_overlap', 'The stay overlaps an existing stay.');
    }
    throw error;
  }
}

async function accessStatus(env, currentTime) {
  const stay = await activeStay(env, currentTime);
  return json({
    active: Boolean(stay),
    state: stay ? 'active' : 'locked',
    timeZone: TIME_ZONE
  });
}

async function guestLogin(request, env, currentTime) {
  const body = await readJson(request);
  const pin = normalizePin(body.pin);
  const stay = await activeStay(env, currentTime);
  if (!stay) throw new ApiError(423, 'no_active_stay', 'Guest access is not active right now.');
  const key = await reserveAttempt('guest', request, env, currentTime);
  const candidate = await pinDigest(pin, env.PIN_PEPPER);
  if (!constantTimeEqual(candidate, String(stay.guest_pin_digest))) {
    throw new ApiError(401, 'invalid_credentials', 'Invalid PIN.');
  }
  await clearFailures(key, env);
  const expiration = Number(stay.ends_at);
  const token = await createToken({
    role: 'guest', sub: `stay:${stay.id}`, stayId: stay.id,
    revision: Number(stay.revision), iat: currentTime, exp: expiration
  }, env);
  return json({ token, expiresAt: iso(expiration), stay: { id: stay.id, label: stay.label || '' } });
}

async function adminLogin(request, env, currentTime) {
  const body = await readJson(request);
  const pin = normalizePin(body.pin);
  const key = await reserveAttempt('admin', request, env, currentTime);
  const candidate = await pinDigest(pin, env.PIN_PEPPER);
  if (!constantTimeEqual(candidate, String(env.ADMIN_PIN_DIGEST).toLowerCase())) {
    throw new ApiError(401, 'invalid_credentials', 'Invalid PIN.');
  }
  await clearFailures(key, env);
  const expiration = currentTime + ADMIN_SESSION_SECONDS;
  const token = await createToken({ role: 'admin', sub: 'admin', iat: currentTime, exp: expiration }, env);
  return json({ token, expiresAt: iso(expiration) });
}

async function sessionStatus(request, env, currentTime) {
  const claims = await verifyToken(bearerToken(request), env, currentTime);
  if (claims.role === 'guest') {
    const { stay } = await authenticatedClaims(request, env, 'guest', currentTime);
    return json({
      valid: true, role: 'guest', expiresAt: iso(claims.exp),
      stay: { id: stay.id, label: stay.label || '', endUtc: iso(stay.ends_at) }
    });
  }
  await authenticatedClaims(request, env, 'admin', currentTime);
  return json({ valid: true, role: 'admin', expiresAt: iso(claims.exp) });
}

async function listStays(request, env, currentTime) {
  await authenticatedClaims(request, env, 'admin', currentTime);
  const result = await env.DB.prepare(`
    SELECT id, label, starts_at, ends_at, enabled, revision, created_at, updated_at
    FROM stays ORDER BY starts_at ASC
  `).all();
  return json({ stays: (result.results || []).map((row) => stayResponse(row, currentTime)), timeZone: TIME_ZONE });
}

async function createStay(request, env, currentTime) {
  await authenticatedClaims(request, env, 'admin', currentTime);
  const body = await readJson(request);
  const startsAt = localToUtcSeconds(body.startLocal);
  const endsAt = localToUtcSeconds(body.endLocal);
  if (startsAt >= endsAt) throw new ApiError(400, 'validation_error', 'Start must be before end.');
  await assertNoOverlap(env, startsAt, endsAt);
  const id = crypto.randomUUID();
  const label = cleanLabel(body.label) || '';
  const useDefaultGuestPin = body.guestPin === undefined || body.guestPin === '';
  const digest = useDefaultGuestPin
    ? String(env.DEFAULT_GUEST_PIN_DIGEST).toLowerCase()
    : await pinDigest(normalizePin(body.guestPin, 'guestPin'), env.PIN_PEPPER);
  const enabled = body.enabled === undefined ? true : body.enabled;
  if (typeof enabled !== 'boolean') throw new ApiError(400, 'validation_error', 'enabled must be boolean.');
  await runStayMutation(env.DB.prepare(`
    INSERT INTO stays (id, label, starts_at, ends_at, guest_pin_digest, enabled, revision, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(id, label, startsAt, endsAt, digest, enabled ? 1 : 0, currentTime, currentTime));
  const created = await env.DB.prepare(`
    SELECT id, label, starts_at, ends_at, enabled, revision, created_at, updated_at FROM stays WHERE id = ?
  `).bind(id).first();
  return json({ stay: stayResponse(created, currentTime) }, 201);
}

async function updateStay(request, env, currentTime, id) {
  await authenticatedClaims(request, env, 'admin', currentTime);
  const body = await readJson(request);
  const existing = await env.DB.prepare('SELECT * FROM stays WHERE id = ?').bind(id).first();
  if (!existing) throw new ApiError(404, 'stay_not_found', 'Stay not found.');

  let startsAt = Number(existing.starts_at);
  let endsAt = Number(existing.ends_at);
  let label = existing.label || '';
  let enabled = Boolean(Number(existing.enabled));
  let digest = existing.guest_pin_digest;
  let changed = false;

  if (body.finish === true) {
    if (Object.keys(body).length !== 1) throw new ApiError(400, 'validation_error', 'finish cannot be combined with other changes.');
    if (!enabled || currentTime <= startsAt || currentTime >= endsAt) {
      throw new ApiError(409, 'stay_not_active', 'Only an active stay can be finished.');
    }
    endsAt = currentTime;
    enabled = false;
    changed = true;
  } else {
    if (body.startLocal !== undefined) { startsAt = localToUtcSeconds(body.startLocal); changed = true; }
    if (body.endLocal !== undefined) { endsAt = localToUtcSeconds(body.endLocal); changed = true; }
    if (body.label !== undefined) { label = cleanLabel(body.label); changed = true; }
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') throw new ApiError(400, 'validation_error', 'enabled must be boolean.');
      enabled = body.enabled;
      changed = true;
    }
    if (body.guestPin !== undefined && body.guestPin !== '') {
      digest = await pinDigest(normalizePin(body.guestPin, 'guestPin'), env.PIN_PEPPER);
      changed = true;
    }
  }
  if (!changed) throw new ApiError(400, 'validation_error', 'No changes were provided.');
  if (startsAt >= endsAt) throw new ApiError(400, 'validation_error', 'Start must be before end.');
  await assertNoOverlap(env, startsAt, endsAt, id);

  await runStayMutation(env.DB.prepare(`
    UPDATE stays SET label = ?, starts_at = ?, ends_at = ?, guest_pin_digest = ?, enabled = ?,
      revision = revision + 1, updated_at = ?
    WHERE id = ?
  `).bind(label, startsAt, endsAt, digest, enabled ? 1 : 0, currentTime, id));
  const updated = await env.DB.prepare(`
    SELECT id, label, starts_at, ends_at, enabled, revision, created_at, updated_at FROM stays WHERE id = ?
  `).bind(id).first();
  return json({ stay: stayResponse(updated, currentTime) });
}

async function deleteStay(request, env, currentTime, id) {
  await authenticatedClaims(request, env, 'admin', currentTime);
  const result = await env.DB.prepare('DELETE FROM stays WHERE id = ?').bind(id).run();
  if (!result.meta || Number(result.meta.changes) < 1) throw new ApiError(404, 'stay_not_found', 'Stay not found.');
  return empty();
}

async function route(request, env) {
  assertEnvironment(env);
  const currentTime = nowSeconds();
  const url = new URL(request.url);
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : url.pathname;
  const method = request.method.toUpperCase();

  if (method === 'GET' && path === `${API_PREFIX}/access/status`) return accessStatus(env, currentTime);
  if (method === 'POST' && path === `${API_PREFIX}/auth/guest`) return guestLogin(request, env, currentTime);
  if (method === 'POST' && path === `${API_PREFIX}/auth/admin`) return adminLogin(request, env, currentTime);
  if (method === 'GET' && path === `${API_PREFIX}/auth/session`) return sessionStatus(request, env, currentTime);
  if (method === 'GET' && path === `${API_PREFIX}/admin/stays`) return listStays(request, env, currentTime);
  if (method === 'POST' && path === `${API_PREFIX}/admin/stays`) return createStay(request, env, currentTime);

  const stayMatch = /^\/v1\/admin\/stays\/([0-9a-f-]{36})$/i.exec(path);
  if (stayMatch && method === 'PATCH') return updateStay(request, env, currentTime, stayMatch[1]);
  if (stayMatch && method === 'DELETE') return deleteStay(request, env, currentTime, stayMatch[1]);
  throw new ApiError(404, 'not_found', 'API route not found.');
}

export async function handleRequest(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (!isAllowedOrigin(origin, env.ALLOWED_ORIGINS)) {
    return errorResponse(new ApiError(403, 'origin_not_allowed', 'Origin is not allowed.'));
  }
  if (request.method.toUpperCase() === 'OPTIONS') {
    const requestedMethod = request.headers.get('Access-Control-Request-Method');
    if (!origin || !requestedMethod) return errorResponse(new ApiError(400, 'invalid_preflight', 'Invalid preflight request.'));
    return withCors(empty(204), origin);
  }
  try {
    return withCors(await route(request, env), origin);
  } catch (error) {
    const response = errorResponse(error);
    if (error instanceof ApiError && error.code === 'rate_limited' && error.extra.retryAfter) {
      const headers = new Headers(response.headers);
      headers.set('Retry-After', String(error.extra.retryAfter));
      return withCors(new Response(response.body, { status: response.status, headers }), origin);
    }
    return withCors(response, origin);
  }
}

export default { fetch: handleRequest };

export const __test = {
  ApiError,
  normalizePin,
  stayResponse,
  TIME_ZONE,
  ADMIN_SESSION_SECONDS,
  FAILURE_LIMIT,
  FAILURE_WINDOW_SECONDS,
  LOCK_SECONDS,
  RESERVE_ATTEMPT_SQL
};
