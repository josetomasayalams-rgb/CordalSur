import fs from 'node:fs';
import path from 'node:path';
import { LANDING_ROOT, PROJECT_ROOT, SCRIPT_ROOT } from './paths.mjs';
import { mergePlaces } from './dedupe.mjs';
import { haversineMeters, nearestPointOnLine } from './geo.mjs';
import { categoryEntries } from './taxonomy.mjs';
import { loadManualPlaces } from './providers/manual.mjs';
import { loadEditorialCatalog } from './providers/editorial.mjs';
import { fetchOsmTile } from './providers/osm.mjs';
import { fetchGoogleTile } from './providers/google.mjs';
import { fetchTripadvisorTile } from './providers/tripadvisor.mjs';
import { applyPlaceOverrides, loadPlaceOverrides, mergeOverrides, recordsFromAddOverrides } from './overrides.mjs';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=') || true];
}));
const runDir = path.resolve(PROJECT_ROOT, String(args.get('run-dir') || '.research/20260717-destination-guide'));
const enabledProviders = new Set(String(args.get('providers') || 'manual,editorial,osm,google,tripadvisor').split(',').map((value) => value.trim()).filter(Boolean));
const config = JSON.parse(fs.readFileSync(path.join(SCRIPT_ROOT, 'config.json'), 'utf8'));
const geometryPath = path.join(LANDING_ROOT, 'data/destination-geometry.json');
const geometry = JSON.parse(fs.readFileSync(geometryPath, 'utf8'));
const centerline = geometry.corridor.geometry.coordinates.map(([lon, lat]) => ({ lat, lon }));
const context = {
  cacheDir: path.join(runDir, 'cache', 'providers'),
  cacheTtlMs: 30 * 24 * 3600 * 1000,
  overpassEndpoint: config.providers.overpassEndpoint,
  overpassSaturation: 400,
  googleApiKey: process.env.GOOGLE_PLACES_API_KEY || '',
  tripadvisorApiKey: process.env.TRIPADVISOR_API_KEY || '',
  tripadvisorCombinationAllowed: process.env.TRIPADVISOR_CONTENT_COMBINATION_ALLOWED === 'true'
};
const providerFunctions = { osm: fetchOsmTile, google: fetchGoogleTile, tripadvisor: fetchTripadvisorTile };

function childTiles(tile) {
  const [south, west, north, east] = tile.bbox;
  const midLat = (south + north) / 2;
  const midLon = (west + east) / 2;
  const boxes = [
    [south, west, midLat, midLon], [south, midLon, midLat, east],
    [midLat, west, north, midLon], [midLat, midLon, north, east]
  ];
  return boxes.map((bbox, index) => ({
    id: `${tile.id}-${index}`,
    bbox,
    center: { lat: (bbox[0] + bbox[2]) / 2, lon: (bbox[1] + bbox[3]) / 2 },
    sizeMeters: tile.sizeMeters / 2,
    queryRadiusMeters: Math.ceil(tile.queryRadiusMeters / 2)
  }));
}

function providerIdentity(place) {
  return place.providerRefs?.googlePlaceId || place.providerRefs?.tripadvisorLocationId || place.providerRefs?.osm?.[0] || place.id;
}

async function discoverTile(provider, tile, metrics, failures, depth = 0) {
  const fn = providerFunctions[provider];
  try {
    const result = await fn(tile, context);
    metrics.push({ ...result.metric, depth });
    const unique = new Map(result.places.map((place) => [providerIdentity(place), place]));
    if (result.saturated && tile.sizeMeters > 1250 && depth < 4) {
      const before = unique.size;
      for (const child of childTiles(tile)) {
        const places = await discoverTile(provider, child, metrics, failures, depth + 1);
        for (const place of places) unique.set(providerIdentity(place), place);
      }
      metrics.push({ provider, tileId: tile.id, depth, subdivision: true, addedBySubdivision: unique.size - before, stopReason: unique.size === before ? 'no_meaningful_new_places' : 'below_saturation_or_minimum_tile' });
    }
    if (provider === 'osm' && !result.metric.cached) await new Promise((resolve) => setTimeout(resolve, 350));
    return [...unique.values()];
  } catch (error) {
    failures.push({ provider, tileId: tile.id, message: error.message });
    return [];
  }
}

function modes(place) {
  const apartmentDistanceMeters = haversineMeters(config.apartment, place.location);
  const route = nearestPointOnLine(centerline, place.location);
  return {
    apartment: apartmentDistanceMeters <= geometry.apartment.radiusMeters,
    corridor: route.distanceMeters <= geometry.corridor.bufferMeters,
    apartmentDistanceMeters: Number(apartmentDistanceMeters.toFixed(1)),
    corridorDistanceMeters: Number(route.distanceMeters.toFixed(1)),
    routeProgressMeters: Number(route.progressMeters.toFixed(1)),
    routeLengthMeters: Number(route.lineLengthMeters.toFixed(1))
  };
}

function applyModes(place) { return { ...place, discovery: modes(place) }; }

function pisteRoute(place) {
  const tags = place.sourceTags || {};
  return {
    id: `route-${place.id}`,
    offeringId: null,
    name: { es: place.name, pt: place.name, en: place.name },
    activityType: 'ski',
    difficulty: tags['piste:difficulty'] || null,
    duration: null,
    safetyNotes: null,
    officialUrl: place.sources?.[0]?.url || null,
    navigationUrl: null,
    navigationAvailable: false,
    status: 'mapped_piste_no_verified_access',
    warning: {
      es: 'Elemento cartográfico de pista; acceso, apertura y operación diaria deben verificarse con el centro de ski.',
      pt: 'Elemento cartográfico de pista; acesso, abertura e operação diária devem ser verificados com o centro de esqui.',
      en: 'Mapped ski feature; access, opening and daily operations must be checked with the ski resort.'
    },
    providerRefs: place.providerRefs,
    sources: place.sources,
    checkedAt: place.sources?.[0]?.checkedAt || null
  };
}

function validateGuide(guide) {
  const errors = [];
  if (guide.schemaVersion !== 1) errors.push('schemaVersion must equal 1');
  if (!Array.isArray(guide.places) || !guide.places.length) errors.push('places must not be empty');
  const ids = new Set();
  for (const place of guide.places || []) {
    if (!place.id || ids.has(place.id)) errors.push(`duplicate or missing id: ${place.id}`);
    ids.add(place.id);
    if (!place.name || !place.category || !Number.isFinite(place.location?.lat) || !Number.isFinite(place.location?.lon)) errors.push(`invalid place: ${place.id}`);
    if (!place.navigationUrl || !place.googleMapsUrl) errors.push(`missing navigation: ${place.id}`);
    if (!Array.isArray(place.sources) || !place.sources.length) errors.push(`missing provenance: ${place.id}`);
    if (place.instagram && place.instagram.verifiedBy !== 'osm_contact_tag' && place.instagram.provider !== 'manual') errors.push(`unverified Instagram: ${place.id}`);
    if (place.googleRating && place.googleRating.provider !== 'google') errors.push(`Google rating source mismatch: ${place.id}`);
    if (place.tripadvisorRating && place.tripadvisorRating.provider !== 'tripadvisor') errors.push(`Tripadvisor rating source mismatch: ${place.id}`);
  }
  if (errors.length) throw new Error(`Destination guide validation failed:\n- ${errors.slice(0, 20).join('\n- ')}`);
}

async function main() {
  fs.mkdirSync(runDir, { recursive: true });
  const records = [];
  const metrics = [];
  const failures = [];
  const providerStatus = [];
  const overrideFile = path.resolve(PROJECT_ROOT, String(args.get('overrides') || path.join(LANDING_ROOT, 'data/place-overrides.json')));
  const overrides = loadPlaceOverrides(overrideFile);
  let offerings = [];
  let routes = [];
  let manual = [];

  if (enabledProviders.has('manual')) {
    manual = loadManualPlaces(path.join(LANDING_ROOT, 'data/nearby.json'));
    records.push(...manual);
    providerStatus.push({ id: 'manual', enabled: true, records: manual.length, note: 'Legacy curated catalog; field verification dates remain null when unknown.' });
  } else {
    providerStatus.push({ id: 'manual', enabled: false, reason: 'not_requested' });
  }

  if (enabledProviders.has('editorial')) {
    const editorial = loadEditorialCatalog(path.join(LANDING_ROOT, 'data/host-data.json'), manual);
    records.push(...editorial.restaurants);
    offerings = editorial.offerings;
    routes = editorial.routes;
    providerStatus.push({ id: 'editorial', enabled: true, records: editorial.restaurants.length, offerings: offerings.length, routes: routes.length, note: 'Host-curated catalog; unresolved coordinates remain explicit candidates.' });
  } else {
    providerStatus.push({ id: 'editorial', enabled: false, reason: 'not_requested' });
  }

  records.push(...recordsFromAddOverrides(overrides));

  const tilesById = new Map([...geometry.tiles.apartment, ...geometry.tiles.corridor].map((tile) => [tile.id, tile]));
  for (const provider of ['osm', 'google', 'tripadvisor']) {
    if (!enabledProviders.has(provider)) {
      providerStatus.push({ id: provider, enabled: false, reason: 'not_requested' });
      continue;
    }
    const missingCredential = provider === 'google' && !context.googleApiKey || provider === 'tripadvisor' && !context.tripadvisorApiKey;
    if (missingCredential) {
      providerStatus.push({ id: provider, enabled: false, reason: 'missing_credentials' });
      continue;
    }
    if (provider === 'tripadvisor' && !context.tripadvisorCombinationAllowed) {
      providerStatus.push({ id: provider, enabled: false, reason: 'license_combination_not_approved' });
      continue;
    }
    const before = records.length;
    for (const tile of tilesById.values()) records.push(...await discoverTile(provider, tile, metrics, failures));
    providerStatus.push({ id: provider, enabled: true, records: records.length - before, failedTiles: failures.filter((failure) => failure.provider === provider).length });
  }

  const pisteRecords = records.filter((record) => record.sourceTags?.['piste:type']);
  const uniquePistes = [...new Map(pisteRecords.map((record) => [record.providerRefs?.osm?.[0] || record.id, record])).values()];
  routes.push(...uniquePistes.map(pisteRoute));
  const placeRecords = records.filter((record) => !record.sourceTags?.['piste:type']);
  const deduplicated = mergePlaces(placeRecords, mergeOverrides(overrides));
  const places = applyPlaceOverrides(deduplicated.places, overrides).map(applyModes).filter((place) => place.discovery.apartment || place.discovery.corridor);
  const categoryCounts = Object.fromEntries(categoryEntries().map((category) => [category.id, places.filter((place) => place.category === category.id).length]));
  const providerCounts = Object.fromEntries(providerStatus.map((provider) => [provider.id, places.filter((place) => place.sources.some((source) => source.provider === provider.id)).length]));
  const guide = {
    schemaVersion: 1,
    meta: {
      generatedAt: new Date().toISOString(),
      coverage: 'Condominio Andes Chillán apartment radius and buffered Ruta N-55 corridor from Pinto',
      statistics: {
        rawRecords: records.length, publishedPlaces: places.length, duplicatesMerged: deduplicated.mergedCount + pisteRecords.length - uniquePistes.length,
        pisteFeaturesMovedToRoutes: uniquePistes.length,
        categoryCounts, providerCounts, providerCalls: metrics.length, failedProviderCalls: failures.length,
        candidateCoordinates: places.filter((place) => place.coordinateKind === 'center_candidate' || place.status === 'candidate_coordinate').length
      },
      limitations: geometry.limitations.concat([
        'Google Places was queried only when a server-side credential was available.',
        'Tripadvisor content was queried only with credentials and explicit confirmation that combined display is licensed.',
        'Opening hours, ratings and review counts may change after the recorded provider check.'
      ])
    },
    geometry: {
      apartment: geometry.apartment,
      corridor: geometry.corridor,
      tiles: geometry.tiles
    },
    categories: categoryEntries().map((category) => ({ ...category, count: categoryCounts[category.id] || 0 })),
    places,
    offerings,
    routes,
    providers: providerStatus,
    mergeAudit: deduplicated.audit.concat(pisteRecords.length > uniquePistes.length ? [{ reason: 'osm_piste_identifier', mergedCount: pisteRecords.length - uniquePistes.length }] : []),
    performance: { calls: metrics, failures }
  };
  validateGuide(guide);

  const output = path.join(LANDING_ROOT, 'data/destination-guide.json');
  const temporary = `${output}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(guide, null, 2)}\n`);
  fs.renameSync(temporary, output);
  fs.writeFileSync(path.join(runDir, 'discovery-metrics.json'), `${JSON.stringify({ generatedAt: guide.meta.generatedAt, metrics, failures, providerStatus }, null, 2)}\n`);
  fs.writeFileSync(path.join(runDir, 'merge-audit.json'), `${JSON.stringify(deduplicated.audit, null, 2)}\n`);
  console.log(`Wrote ${path.relative(PROJECT_ROOT, output)}`);
  console.log(`${records.length} raw → ${places.length} places · ${guide.meta.statistics.duplicatesMerged} duplicate records merged · ${uniquePistes.length} piste features moved to routes · ${failures.length} failed calls`);
  console.log(`Providers: ${providerStatus.map((provider) => `${provider.id}=${provider.enabled ? provider.records : provider.reason}`).join(' · ')}`);
  console.log(`Editorial: ${offerings.length} offerings · ${routes.length} routes · ${overrides.length} overrides`);
}

await main();

export { childTiles, validateGuide };
