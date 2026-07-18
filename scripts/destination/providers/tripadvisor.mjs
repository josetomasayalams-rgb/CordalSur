import path from 'node:path';
import { field, fetchJson, navigationLinks, readCache, slug, writeCache } from './common.mjs';

const API_ROOT = 'https://api.content.tripadvisor.com/api/v1/location';
const CATEGORIES = ['restaurants', 'attractions', 'hotels'];

function category(value) {
  if (value === 'restaurants') return 'restaurant';
  if (value === 'hotels') return 'hotel';
  return 'tourism';
}

async function cachedGet(url, file, context) {
  let payload = readCache(file, Math.min(context.cacheTtlMs, 24 * 3600 * 1000));
  let cached = true;
  if (!payload) {
    cached = false;
    payload = await fetchJson(url, { headers: { Accept: 'application/json' } }, { timeoutMs: 30000, attempts: 4, baseDelayMs: 500 });
    writeCache(file, payload);
  }
  return { payload, cached };
}

function normalizeDetails(details, fallbackCategory, checkedAt) {
  const lat = Number(details.latitude);
  const lon = Number(details.longitude);
  if (!details.location_id || !details.name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const location = { lat, lon };
  const sourceUrl = details.web_url || `${API_ROOT}/${details.location_id}/details`;
  return {
    id: `tripadvisor-${details.location_id}-${slug(details.name)}`,
    name: details.name,
    aliases: [],
    category: fallbackCategory,
    municipality: details.address_obj?.city || null,
    address: field(details.address_obj?.address_string, 'tripadvisor', sourceUrl, checkedAt),
    location,
    coordinateKind: 'entrance',
    ...navigationLinks(location),
    website: field(details.website, 'tripadvisor', sourceUrl, checkedAt),
    phone: field(details.phone, 'tripadvisor', sourceUrl, checkedAt),
    openingHours: field(details.hours?.weekday_text, 'tripadvisor', sourceUrl, checkedAt),
    instagram: null,
    googleRating: null,
    tripadvisorRating: details.rating == null ? null : { value: Number(details.rating), reviewCount: Number(details.num_reviews || 0), provider: 'tripadvisor', sourceUrl, checkedAt },
    providerRefs: { osm: [], googlePlaceId: null, tripadvisorLocationId: String(details.location_id) },
    sources: [{ provider: 'tripadvisor', id: String(details.location_id), url: sourceUrl, checkedAt }],
    status: 'published'
  };
}

export async function fetchTripadvisorTile(tile, context) {
  if (!context.tripadvisorApiKey) return { places: [], saturated: false, metric: { provider: 'tripadvisor', tileId: tile.id, skipped: 'missing_credentials' } };
  if (context.tripadvisorCombinationAllowed !== true) {
    return { places: [], saturated: false, metric: { provider: 'tripadvisor', tileId: tile.id, skipped: 'license_combination_not_approved' } };
  }
  const started = performance.now();
  const places = [];
  let saturated = false;
  let cacheHits = 0;
  for (const apiCategory of CATEGORIES) {
    const params = new URLSearchParams({
      key: context.tripadvisorApiKey,
      latLong: `${tile.center.lat},${tile.center.lon}`,
      radius: String(Math.ceil(tile.queryRadiusMeters)), radiusUnit: 'm', category: apiCategory, language: 'es'
    });
    const searchFile = path.join(context.cacheDir, 'tripadvisor', `nearby-${tile.id}-${apiCategory}.json`);
    const search = await cachedGet(`${API_ROOT}/nearby_search?${params}`, searchFile, context);
    if (search.cached) cacheHits += 1;
    const candidates = search.payload.data || [];
    if (candidates.length === 10) saturated = true;
    for (const candidate of candidates) {
      const detailParams = new URLSearchParams({ key: context.tripadvisorApiKey, language: 'es' });
      const detailFile = path.join(context.cacheDir, 'tripadvisor', `details-${candidate.location_id}.json`);
      const detail = await cachedGet(`${API_ROOT}/${candidate.location_id}/details?${detailParams}`, detailFile, context);
      const normalized = normalizeDetails(detail.payload, category(apiCategory), new Date().toISOString());
      if (normalized) places.push(normalized);
    }
  }
  return { places, saturated, metric: { provider: 'tripadvisor', tileId: tile.id, durationMs: Math.round(performance.now() - started), results: places.length, cacheHits } };
}

export { API_ROOT as TRIPADVISOR_API_ROOT };
