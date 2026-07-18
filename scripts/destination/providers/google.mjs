import path from 'node:path';
import { canonicalCategory } from '../taxonomy.mjs';
import { field, fetchJson, navigationLinks, readCache, safeInstagram, slug, writeCache } from './common.mjs';

const NEARBY_TYPES = [
  'restaurant', 'cafe', 'fast_food_restaurant', 'bakery', 'supermarket', 'convenience_store',
  'hardware_store', 'home_improvement_store', 'pharmacy', 'hospital', 'doctor', 'veterinary_care',
  'gas_station', 'hotel', 'ski_resort', 'tourist_attraction', 'bank', 'atm', 'laundry',
  'shopping_mall', 'car_repair', 'police', 'fire_station'
];
const TEXT_QUERIES = ['cabañas', 'termas', 'senderos', 'servicios de ski', 'turismo aventura'];
const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.location', 'places.primaryType', 'places.types',
  'places.formattedAddress', 'places.rating', 'places.userRatingCount', 'places.websiteUri',
  'places.nationalPhoneNumber', 'places.regularOpeningHours', 'places.googleMapsLinks'
].join(',');
const DETAILS_FIELD_MASK = FIELD_MASK.split(',').map((fieldName) => fieldName.replace(/^places\./, '')).join(',');

function googleTags(place) {
  const type = place.primaryType || (place.types || [])[0] || '';
  const map = {
    restaurant: { amenity: 'restaurant' }, cafe: { amenity: 'cafe' }, fast_food_restaurant: { amenity: 'fast_food' },
    bakery: { shop: 'bakery' }, supermarket: { shop: 'supermarket' }, convenience_store: { shop: 'convenience' },
    hardware_store: { shop: 'hardware' }, home_improvement_store: { shop: 'doityourself' }, pharmacy: { amenity: 'pharmacy' },
    hospital: { amenity: 'hospital' }, doctor: { amenity: 'doctors' }, veterinary_care: { amenity: 'veterinary' },
    gas_station: { amenity: 'fuel' }, hotel: { tourism: 'hotel' }, ski_resort: { leisure: 'ski_resort' },
    tourist_attraction: { tourism: 'attraction' }, bank: { amenity: 'bank' }, atm: { amenity: 'atm' },
    laundry: { shop: 'laundry' }, shopping_mall: { shop: 'mall' }, car_repair: { shop: 'car_parts' },
    police: { amenity: 'police' }, fire_station: { amenity: 'fire_station' }
  };
  return map[type] || {};
}

function normalizePlace(place, checkedAt) {
  if (!place.id || !place.displayName?.text || !Number.isFinite(place.location?.latitude) || !Number.isFinite(place.location?.longitude)) return null;
  const sourceUrl = place.googleMapsLinks?.placeUri || `https://places.googleapis.com/v1/places/${place.id}`;
  const location = { lat: place.location.latitude, lon: place.location.longitude };
  const links = navigationLinks(location, place.googleMapsLinks?.placeUri, place.googleMapsLinks?.directionsUri);
  return {
    id: `google-${place.id}-${slug(place.displayName.text)}`,
    name: place.displayName.text,
    aliases: [],
    category: canonicalCategory(googleTags(place)),
    municipality: null,
    address: field(place.formattedAddress, 'google', sourceUrl, checkedAt),
    location,
    coordinateKind: 'entrance',
    ...links,
    website: field(place.websiteUri, 'google', sourceUrl, checkedAt),
    phone: field(place.nationalPhoneNumber, 'google', sourceUrl, checkedAt),
    openingHours: field(place.regularOpeningHours?.weekdayDescriptions || null, 'google', sourceUrl, checkedAt),
    instagram: null,
    googleRating: place.rating == null ? null : { value: place.rating, reviewCount: place.userRatingCount || 0, provider: 'google', sourceUrl, checkedAt },
    tripadvisorRating: null,
    providerRefs: { osm: [], googlePlaceId: place.id, tripadvisorLocationId: null },
    sources: [{ provider: 'google', id: place.id, url: sourceUrl, checkedAt }],
    status: 'published'
  };
}

async function postSearch(endpoint, body, tile, context, cacheName) {
  const cacheFile = path.join(context.cacheDir, 'google', `${cacheName}.json`);
  let payload = readCache(cacheFile, Math.min(context.cacheTtlMs, 30 * 24 * 3600 * 1000));
  let cached = true;
  const started = performance.now();
  if (!payload) {
    cached = false;
    payload = await fetchJson(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': context.googleApiKey, 'X-Goog-FieldMask': FIELD_MASK },
      body: JSON.stringify(body)
    }, { timeoutMs: 30000, attempts: 4, baseDelayMs: 500 });
    writeCache(cacheFile, payload);
  }
  const checkedAt = new Date().toISOString();
  const enriched = [];
  let detailCalls = 0;
  let detailFailures = 0;
  for (const place of payload.places || []) {
    if (!place.id) { enriched.push(place); continue; }
    try {
      const detail = await fetchGooglePlaceDetails(place.id, context);
      detailCalls += detail.cached ? 0 : 1;
      enriched.push({ ...place, ...detail.place });
    } catch {
      detailFailures += 1;
      enriched.push(place);
    }
  }
  const places = enriched.map((place) => normalizePlace(place, checkedAt)).filter(Boolean);
  return { places, payload, cached, detailCalls, detailFailures, durationMs: Math.round(performance.now() - started), tileId: tile.id };
}

export async function fetchGooglePlaceDetails(placeId, context) {
  if (!context.googleApiKey) throw new Error('Google Places credential is required.');
  const safeId = encodeURIComponent(String(placeId));
  const cacheFile = path.join(context.cacheDir, 'google', `details-${safeId}.json`);
  let place = readCache(cacheFile, Math.min(context.cacheTtlMs, 30 * 24 * 3600 * 1000));
  const cached = Boolean(place);
  if (!place) {
    place = await fetchJson(`https://places.googleapis.com/v1/places/${safeId}`, {
      headers: { 'X-Goog-Api-Key': context.googleApiKey, 'X-Goog-FieldMask': DETAILS_FIELD_MASK },
    }, { timeoutMs: 30000, attempts: 4, baseDelayMs: 500 });
    writeCache(cacheFile, place);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return { place, cached };
}

export async function fetchGoogleTile(tile, context) {
  if (!context.googleApiKey) return { places: [], saturated: false, metric: { provider: 'google', tileId: tile.id, skipped: 'missing_credentials' } };
  const body = {
    includedTypes: NEARBY_TYPES,
    maxResultCount: 20,
    rankPreference: 'POPULARITY',
    languageCode: 'es',
    regionCode: 'CL',
    locationRestriction: { circle: { center: { latitude: tile.center.lat, longitude: tile.center.lon }, radius: Math.min(50000, tile.queryRadiusMeters) } }
  };
  const nearby = await postSearch('https://places.googleapis.com/v1/places:searchNearby', body, tile, context, `nearby-${tile.id}`);
  const textPlaces = [];
  if (nearby.places.length < 5) {
    for (const query of TEXT_QUERIES) {
      const textBody = {
        textQuery: `${query} Ñuble Chile`, languageCode: 'es', regionCode: 'CL', maxResultCount: 20,
        locationBias: { circle: { center: { latitude: tile.center.lat, longitude: tile.center.lon }, radius: Math.min(50000, tile.queryRadiusMeters) } }
      };
      const textResult = await postSearch('https://places.googleapis.com/v1/places:searchText', textBody, tile, context, `text-${tile.id}-${slug(query)}`);
      textPlaces.push(...textResult.places);
    }
  }
  return {
    places: nearby.places.concat(textPlaces),
    saturated: (nearby.payload.places || []).length === 20,
    metric: {
      provider: 'google', tileId: tile.id, cached: nearby.cached, durationMs: nearby.durationMs,
      nearbyResults: nearby.places.length, textResults: textPlaces.length,
      detailCalls: nearby.detailCalls, detailFailures: nearby.detailFailures
    }
  };
}

export { DETAILS_FIELD_MASK as GOOGLE_DETAILS_FIELD_MASK, FIELD_MASK as GOOGLE_FIELD_MASK, NEARBY_TYPES as GOOGLE_NEARBY_TYPES, TEXT_QUERIES as GOOGLE_TEXT_QUERIES };
