import crypto from 'node:crypto';
import path from 'node:path';
import { canonicalCategory } from '../taxonomy.mjs';
import { field, fetchJson, navigationLinks, readCache, safeInstagram, slug, writeCache } from './common.mjs';

const USEFUL = {
  amenity: ['restaurant', 'cafe', 'fast_food', 'food_court', 'ice_cream', 'pharmacy', 'clinic', 'hospital', 'doctors', 'dentist', 'veterinary', 'fuel', 'bank', 'atm', 'car_wash', 'car_rental', 'police', 'fire_station'],
  shop: ['bakery', 'supermarket', 'convenience', 'hardware', 'doityourself', 'farm', 'sports', 'outdoor', 'mall', 'department_store', 'variety_store', 'car_parts', 'tyres', 'laundry', 'dry_cleaning'],
  tourism: ['hotel', 'motel', 'hostel', 'guest_house', 'chalet', 'apartment', 'attraction', 'viewpoint', 'information', 'picnic_site', 'wilderness_hut'],
  leisure: ['ski_resort', 'water_park', 'sports_centre', 'adventure_park'],
  natural: ['hot_spring', 'cave_entrance', 'peak']
};

function regex(values) { return `^(${values.join('|')})$`; }

export function overpassTileQuery(tile) {
  const [south, west, north, east] = tile.bbox;
  const bbox = `${south},${west},${north},${east}`;
  const clauses = Object.entries(USEFUL).map(([key, values]) => `nwr(${bbox})["${key}"~"${regex(values)}"];`);
  clauses.push(`nwr(${bbox})["piste:type"];`);
  return `[out:json][timeout:60];(${clauses.join('')});out meta center;`;
}

function coordinate(element) {
  if (Number.isFinite(element.lat) && Number.isFinite(element.lon)) return { location: { lat: element.lat, lon: element.lon }, coordinateKind: 'node' };
  if (element.center && Number.isFinite(element.center.lat) && Number.isFinite(element.center.lon)) {
    return { location: { lat: element.center.lat, lon: element.center.lon }, coordinateKind: 'center_candidate' };
  }
  return null;
}

function address(tags) {
  return [tags['addr:street'], tags['addr:housenumber'], tags['addr:place'], tags['addr:city']].filter(Boolean).join(' ').trim() || null;
}

function normalizeElement(element, checkedAt) {
  const tags = element.tags || {};
  const point = coordinate(element);
  const name = tags.name || tags['name:es'];
  if (!point || !name) return null;
  if (['private', 'no'].includes(tags.access) || tags.disused === 'yes' || tags.abandoned === 'yes') return null;
  const osmId = `${element.type}/${element.id}`;
  const sourceUrl = `https://www.openstreetmap.org/${osmId}`;
  const instagram = safeInstagram(tags['contact:instagram'] || tags.instagram);
  return {
    id: `osm-${element.type}-${element.id}-${slug(name)}`,
    name,
    aliases: [],
    category: canonicalCategory(tags),
    municipality: tags['addr:city'] || tags['addr:municipality'] || null,
    address: field(address(tags), 'osm', sourceUrl, checkedAt),
    location: point.location,
    coordinateKind: point.coordinateKind,
    coordinatePrecision: point.coordinateKind === 'center_candidate' ? 'mapped_feature_center' : 'mapped_point',
    routingEligible: true,
    ...navigationLinks(point.location),
    website: field(tags['contact:website'] || tags.website, 'osm', sourceUrl, checkedAt),
    phone: field(tags['contact:phone'] || tags.phone, 'osm', sourceUrl, checkedAt),
    openingHours: field(tags.opening_hours, 'osm', sourceUrl, checkedAt),
    instagram: field(instagram, 'osm', sourceUrl, checkedAt, { verifiedBy: 'osm_contact_tag' }),
    googleRating: null,
    tripadvisorRating: null,
    providerRefs: { osm: [osmId], googlePlaceId: null, tripadvisorLocationId: null },
    sources: [{ provider: 'osm', id: osmId, url: sourceUrl, checkedAt, version: element.version || null, timestamp: element.timestamp || null }],
    sourceTags: tags,
    status: 'published'
  };
}

export async function fetchOsmTile(tile, context) {
  const query = overpassTileQuery(tile);
  const key = crypto.createHash('sha256').update(query).digest('hex');
  const cacheFile = path.join(context.cacheDir, 'osm', `${key}.json`);
  let payload = readCache(cacheFile, context.cacheTtlMs);
  let cached = true;
  const started = performance.now();
  if (!payload) {
    cached = false;
    const url = `${context.overpassEndpoint}?data=${encodeURIComponent(query)}`;
    payload = await fetchJson(url, { headers: { Accept: 'application/json', 'User-Agent': 'CordalSurDestinationGuide/1.0' } }, { timeoutMs: 70000, attempts: 4, baseDelayMs: 1000 });
    writeCache(cacheFile, payload);
  }
  const checkedAt = new Date().toISOString();
  const places = (payload.elements || []).map((element) => normalizeElement(element, checkedAt)).filter(Boolean);
  return {
    places,
    saturated: (payload.elements || []).length >= context.overpassSaturation,
    metric: { provider: 'osm', tileId: tile.id, cached, durationMs: Math.round(performance.now() - started), rawResults: (payload.elements || []).length, normalizedResults: places.length, osmBaseTimestamp: payload.osm3s?.timestamp_osm_base || null }
  };
}

export { USEFUL as OSM_USEFUL_TAGS };
