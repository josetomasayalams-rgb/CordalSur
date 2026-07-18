import fs from 'node:fs';
import path from 'node:path';

export async function fetchJson(url, options = {}, policy = {}) {
  const attempts = policy.attempts || 4;
  const timeoutMs = policy.timeoutMs || 30000;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const error = new Error(`HTTP ${response.status}: ${body.slice(0, 240)}`);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      const retryable = error.name === 'AbortError' || error.status === 429 || error.status >= 500 || !error.status;
      if (!retryable || attempt === attempts - 1) break;
      const retryAfter = Number(error.retryAfter || 0) * 1000;
      const delay = retryAfter || (policy.baseDelayMs || 500) * 2 ** attempt + Math.floor(Math.random() * 250);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

export function readCache(file, ttlMs) {
  try {
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs > ttlMs) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return null; }
}

export function writeCache(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function field(value, provider, sourceUrl, checkedAt, extra = {}) {
  return value == null || value === '' ? null : { value, provider, sourceUrl, checkedAt, ...extra };
}

export function navigationLinks(location, placeUri = null, directionsUri = null) {
  const destination = `${location.lat},${location.lon}`;
  return {
    navigationUrl: directionsUri || `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`,
    googleMapsUrl: placeUri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`
  };
}

export function safeInstagram(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^https:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._]+\/?$/i.test(text)) return text.replace(/\/$/, '') + '/';
  if (/^@?[A-Za-z0-9._]+$/.test(text)) return `https://www.instagram.com/${text.replace(/^@/, '')}/`;
  return null;
}

export function slug(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72) || 'place';
}
