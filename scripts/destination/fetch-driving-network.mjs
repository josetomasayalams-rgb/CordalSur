import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANDING_ROOT, PROJECT_ROOT, ROAD_CORE_URL, SCRIPT_ROOT } from './paths.mjs';

const { haversineMeters, prepareNetwork, routeDistances, snapToNetwork } = await import(ROAD_CORE_URL);
const config = JSON.parse(fs.readFileSync(path.join(SCRIPT_ROOT, 'config.json'), 'utf8'));
const guidePath = path.join(LANDING_ROOT, 'data/destination-guide.json');
const outputPath = path.join(LANDING_ROOT, 'data/driving-network.json');
const DRIVEABLE = 'motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service|track';
const REFERENCE_SPEED_KPH = 50;
const SNAP_LIMIT_METERS = 350;
const DEFAULT_SPEED_KPH = {
  motorway: 100,
  motorway_link: 50,
  trunk: 90,
  trunk_link: 45,
  primary: 80,
  primary_link: 40,
  secondary: 70,
  secondary_link: 35,
  tertiary: 55,
  tertiary_link: 30,
  unclassified: 45,
  residential: 30,
  living_street: 15,
  service: 20,
  track: 12
};
const SURFACE_SPEED_FACTOR = {
  asphalt: 1,
  paved: 1,
  concrete: 1,
  concrete_lanes: 0.9,
  paving_stones: 0.85,
  sett: 0.75,
  compacted: 0.75,
  fine_gravel: 0.7,
  gravel: 0.55,
  pebblestone: 0.5,
  unpaved: 0.5,
  ground: 0.4,
  dirt: 0.4,
  earth: 0.4,
  grass: 0.3,
  sand: 0.25,
  mud: 0.2
};
const TRACKTYPE_SPEED_FACTOR = { grade1: 0.9, grade2: 0.7, grade3: 0.55, grade4: 0.4, grade5: 0.3 };

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

export function overpassQuery() {
  const [south, west, north, east] = config.route.bbox;
  return `[out:json][timeout:180];way["highway"~"^(${DRIVEABLE})$"](${south},${west},${north},${east})["highway"!="construction"]["access"!="no"]["access"!="private"]["vehicle"!="no"]["vehicle"!="private"]["motor_vehicle"!="no"]["motor_vehicle"!="private"]["motorcar"!="no"]["motorcar"!="private"]["smoothness"!="impassable"];(._;>;);out body qt;`;
}

async function requestOverpass(query, attempts = 5) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 195000);
    try {
      const response = await fetch(config.providers.overpassEndpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'CordalSurDrivingNetwork/1.0'
        },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Overpass responded ${response.status}`);
      const payload = await response.json();
      validateOverpassPayload(payload);
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

export function directionFlags(tags = {}) {
  const oneway = String(tags['oneway:motorcar'] ?? tags['oneway:motor_vehicle'] ?? tags['oneway:vehicle'] ?? tags.oneway ?? '').toLowerCase();
  if (oneway === '-1' || oneway === 'reverse') return 2;
  if (oneway === 'yes' || oneway === '1' || oneway === 'true') return 1;
  if (oneway === 'no' || oneway === '0' || oneway === 'false') return 3;
  if (tags.junction === 'roundabout') return 1;
  return 3;
}

function parseMaxspeed(value) {
  const match = String(value || '').toLowerCase().match(/(\d+(?:\.\d+)?)\s*(mph)?/);
  if (!match) return null;
  const speed = Number(match[1]) * (match[2] ? 1.609344 : 1);
  return Number.isFinite(speed) && speed > 0 ? speed : null;
}

export function wayProfile(tags = {}) {
  const highway = String(tags.highway || 'service').toLowerCase();
  const surface = String(tags.surface || '').toLowerCase();
  const tracktype = String(tags.tracktype || '').toLowerCase();
  const service = String(tags.service || '').toLowerCase();
  const smoothness = String(tags.smoothness || '').toLowerCase();
  const maxspeed = parseMaxspeed(tags.maxspeed);
  const motorAccess = String(tags.motorcar ?? tags.motor_vehicle ?? tags.vehicle ?? tags.access ?? '').toLowerCase();
  const conditionalAccess = String(tags['motorcar:conditional'] ?? tags['motor_vehicle:conditional'] ?? tags['vehicle:conditional'] ?? '').toLowerCase();
  const traversable = !['no', 'private'].includes(motorAccess) && smoothness !== 'impassable' && !/\b(?:no|private)\b/.test(conditionalAccess);
  let effectiveSpeedKph = DEFAULT_SPEED_KPH[highway] || 20;
  if (maxspeed) effectiveSpeedKph = Math.min(effectiveSpeedKph, maxspeed);
  if (SURFACE_SPEED_FACTOR[surface]) effectiveSpeedKph *= SURFACE_SPEED_FACTOR[surface];
  if (TRACKTYPE_SPEED_FACTOR[tracktype]) effectiveSpeedKph *= TRACKTYPE_SPEED_FACTOR[tracktype];
  if (service === 'driveway') effectiveSpeedKph *= 0.45;
  if (service === 'parking_aisle') effectiveSpeedKph *= 0.3;
  if (['destination', 'customers', 'delivery'].includes(motorAccess)) effectiveSpeedKph *= 0.5;
  if (['bad', 'very_bad'].includes(smoothness)) effectiveSpeedKph *= 0.6;
  if (['horrible', 'very_horrible'].includes(smoothness)) effectiveSpeedKph *= 0.35;
  effectiveSpeedKph = Math.max(5, effectiveSpeedKph);
  return {
    highway,
    surface: surface || 'unknown',
    tracktype: tracktype || 'unknown',
    traversable,
    effectiveSpeedKph: Number(effectiveSpeedKph.toFixed(1)),
    impedanceFactor: Number(Math.max(1, REFERENCE_SPEED_KPH / effectiveSpeedKph).toFixed(3))
  };
}

function increment(counter, key) {
  counter[key] = (counter[key] || 0) + 1;
}

export function validateOverpassPayload(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.elements)) throw new Error('Overpass returned an invalid payload');
  if (payload.remark) throw new Error(`Overpass returned a partial result: ${payload.remark}`);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(String(payload.osm3s?.timestamp_osm_base || ''))) throw new Error('Overpass payload is missing its OSM timestamp');
  const ways = payload.elements.filter((element) => element.type === 'way').length;
  const nodes = payload.elements.filter((element) => element.type === 'node').length;
  if (ways < 100 || nodes < 1000) throw new Error(`Overpass payload is implausibly small (${ways} ways, ${nodes} nodes)`);
  return payload;
}

export function impedanceRange(factors) {
  if (!Array.isArray(factors) || !factors.length) throw new Error('Driving network has no impedance factors');
  let minimum = Infinity;
  let maximum = -Infinity;
  let penalizedSegments = 0;
  for (const factor of factors) {
    if (!Number.isFinite(factor) || factor < 1) throw new Error('Driving network has an invalid impedance factor');
    if (factor < minimum) minimum = factor;
    if (factor > maximum) maximum = factor;
    if (factor > 1) penalizedSegments += 1;
  }
  return { minimum, maximum, penalizedSegments };
}

export function validateNetworkCandidate(network, previous = null) {
  const stats = network?.statistics || {};
  if (network?.schemaVersion !== 2 || !/^[a-f0-9]{64}$/.test(String(network.networkHash || ''))) throw new Error('Driving network identity is invalid');
  if (stats.nodes < 50000 || stats.segments < 50000 || stats.destinations < 100 || stats.snappedDestinations < 100) {
    throw new Error(`Driving network is below its production floor (${stats.nodes} nodes, ${stats.segments} segments, ${stats.snappedDestinations} snaps)`);
  }
  if (stats.snappedDestinations / stats.destinations < 0.65) throw new Error('Driving network destination coverage is implausibly low');
  if (previous?.statistics) {
    for (const key of ['nodes', 'segments', 'destinations', 'snappedDestinations']) {
      const oldValue = Number(previous.statistics[key]);
      if (Number.isFinite(oldValue) && oldValue > 0 && Number(stats[key]) < oldValue * 0.75) {
        throw new Error(`Driving network ${key} dropped by more than 25%`);
      }
    }
  }
  return network;
}

function readPreviousNetwork() {
  try { return JSON.parse(fs.readFileSync(outputPath, 'utf8')); }
  catch { return null; }
}

function writeJsonPairAtomically(network, guide) {
  const networkTemp = `${outputPath}.${process.pid}.tmp`;
  const guideTemp = `${guidePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(networkTemp, `${JSON.stringify(network)}\n`);
    fs.writeFileSync(guideTemp, `${JSON.stringify(guide, null, 2)}\n`);
    fs.renameSync(networkTemp, outputPath);
    fs.renameSync(guideTemp, guidePath);
  } finally {
    if (fs.existsSync(networkTemp)) fs.unlinkSync(networkTemp);
    if (fs.existsSync(guideTemp)) fs.unlinkSync(guideTemp);
  }
}

function buildRawNetwork(payload, guide, query, elapsedMs) {
  const nodeByOsmId = new Map();
  for (const element of payload.elements || []) {
    if (element.type === 'node' && Number.isFinite(element.lat) && Number.isFinite(element.lon)) {
      nodeByOsmId.set(element.id, [Number(element.lat.toFixed(7)), Number(element.lon.toFixed(7))]);
    }
  }

  const ways = (payload.elements || []).filter((element) => element.type === 'way' && Array.isArray(element.nodes));
  const usedOsmNodeIds = new Set();
  const segmentsByKey = new Map();
  const wayStatistics = { highway: {}, surface: {}, tracktype: {}, profiledWays: 0 };
  for (const way of ways) {
    const flags = directionFlags(way.tags);
    const wayRoadProfile = wayProfile(way.tags);
    if (!wayRoadProfile.traversable) continue;
    increment(wayStatistics.highway, wayRoadProfile.highway);
    increment(wayStatistics.surface, wayRoadProfile.surface);
    increment(wayStatistics.tracktype, wayRoadProfile.tracktype);
    wayStatistics.profiledWays += 1;
    for (let index = 1; index < way.nodes.length; index += 1) {
      const firstId = way.nodes[index - 1];
      const secondId = way.nodes[index];
      const first = nodeByOsmId.get(firstId);
      const second = nodeByOsmId.get(secondId);
      if (!first || !second || firstId === secondId) continue;
      const meters = haversineMeters({ lat: first[0], lon: first[1] }, { lat: second[0], lon: second[1] });
      if (!Number.isFinite(meters) || meters < 0.5) continue;
      const low = Math.min(firstId, secondId);
      const high = Math.max(firstId, secondId);
      const normalizedFlags = firstId === low ? flags : ((flags & 1 ? 2 : 0) | (flags & 2 ? 1 : 0));
      const key = `${low}:${high}`;
      const existing = segmentsByKey.get(key);
      segmentsByKey.set(key, {
        firstId: low,
        secondId: high,
        meters: Number(meters.toFixed(1)),
        flags: (existing?.flags || 0) | normalizedFlags,
        impedanceFactor: Math.min(existing?.impedanceFactor ?? Infinity, wayRoadProfile.impedanceFactor)
      });
      usedOsmNodeIds.add(firstId);
      usedOsmNodeIds.add(secondId);
    }
  }

  const orderedOsmNodeIds = [...usedOsmNodeIds].sort((a, b) => a - b);
  const localIndex = new Map(orderedOsmNodeIds.map((id, index) => [id, index]));
  const nodes = orderedOsmNodeIds.map((id) => nodeByOsmId.get(id));
  const segments = [...segmentsByKey.values()]
    .sort((left, right) => left.firstId - right.firstId || left.secondId - right.secondId)
    .map((segment) => [localIndex.get(segment.firstId), localIndex.get(segment.secondId), segment.meters, segment.flags, segment.impedanceFactor]);
  const destinations = guide.places
    .filter((place) => place.location && place.routingEligible !== false && place.status !== 'candidate_coordinate')
    .map((place) => ({ id: place.id, location: place.location }));
  const raw = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    source: {
      provider: 'OpenStreetMap',
      license: 'ODbL 1.0',
      attribution: '© OpenStreetMap contributors',
      url: 'https://www.openstreetmap.org/copyright',
      endpoint: config.providers.overpassEndpoint,
      osmBaseTimestamp: payload.osm3s?.timestamp_osm_base || null,
      query,
      responseSha256: sha256(payload),
      durationMs: elapsedMs,
      waysReturned: ways.length
    },
    profile: {
      mode: 'driving',
      highwayValues: DRIVEABLE.split('|'),
      exclusions: ['construction', 'access=no/private', 'vehicle=no/private', 'motor_vehicle=no/private', 'motorcar=no/private', 'conditional motorcar restrictions', 'smoothness=impassable'],
      snapLimitMeters: SNAP_LIMIT_METERS,
      accessNearbyThresholdMeters: 150,
      impedance: {
        unit: 'multiplier',
        defaultFactor: 1,
        referenceSpeedKph: REFERENCE_SPEED_KPH,
        description: 'Penalizes slower and lower-standard motor-vehicle ways while reporting physical road metres.'
      }
    },
    nodes,
    segments,
    apartment: { lat: config.apartment.lat, lon: config.apartment.lon },
    destinations,
    statistics: {
      nodes: nodes.length,
      segments: segments.length,
      destinations: destinations.length,
      wayProfiles: wayStatistics
    }
  };
  const network = prepareNetwork(raw);
  raw.apartment.snap = snapToNetwork(network, config.apartment, SNAP_LIMIT_METERS);
  raw.destinations = destinations.map((destination) => ({
    id: destination.id,
    location: destination.location,
    snap: snapToNetwork(network, destination.location, SNAP_LIMIT_METERS)
  }));
  raw.statistics.snappedDestinations = raw.destinations.filter((destination) => destination.snap).length;
  raw.statistics.impedance = impedanceRange(segments.map((segment) => segment[4]));
  raw.destinationSetSha256 = sha256(raw.destinations.map(({ id, location, snap }) => ({ id, location, snap })));
  raw.networkHash = sha256({
    schemaVersion: raw.schemaVersion,
    profile: raw.profile,
    nodes: raw.nodes,
    segments: raw.segments,
    apartment: raw.apartment,
    destinations: raw.destinations
  });
  raw.artifactSha256 = raw.networkHash;
  raw.networkVersion = `road-v2-${raw.networkHash.slice(0, 16)}`;
  return raw;
}

function mergeRoadMetadata(guide, network) {
  const prepared = prepareNetwork(network);
  const result = routeDistances(prepared, network.apartment, network.destinations);
  const directById = new Map(guide.places.map((place) => [place.id, place.location ? haversineMeters(config.apartment, place.location) : null]));
  for (const place of guide.places) {
    const route = result.distances[place.id];
    const snap = network.destinations.find((destination) => destination.id === place.id)?.snap || null;
    let roadMeters = route?.meters ?? null;
    const directMeters = directById.get(place.id);
    if (roadMeters !== null && Number.isFinite(directMeters) && roadMeters + 1 < directMeters) roadMeters = null;
    place.discovery = {
      ...place.discovery,
      apartmentRoadDistanceMeters: roadMeters,
      roadSnapStatus: snap?.quality || 'unavailable',
      roadSnapMeters: snap?.offsetMeters ?? null,
      roadAccessNearby: Boolean(route?.accessNearby)
    };
  }
  guide.meta = {
    ...guide.meta,
    drivingNetwork: {
      schemaVersion: network.schemaVersion,
      generatedAt: network.generatedAt,
      networkVersion: network.networkVersion,
      osmBaseTimestamp: network.source.osmBaseTimestamp,
      responseSha256: network.source.responseSha256,
      networkHash: network.networkHash,
      artifactSha256: network.artifactSha256,
      destinationSetSha256: network.destinationSetSha256
    }
  };
  return guide;
}

async function main() {
  const guide = JSON.parse(fs.readFileSync(guidePath, 'utf8'));
  const previousNetwork = readPreviousNetwork();
  const query = overpassQuery();
  const started = performance.now();
  const payload = await requestOverpass(query);
  const network = buildRawNetwork(payload, guide, query, Math.round(performance.now() - started));
  validateNetworkCandidate(network, previousNetwork);
  const updatedGuide = mergeRoadMetadata(guide, network);
  writeJsonPairAtomically(network, updatedGuide);
  console.log(`Wrote ${path.relative(PROJECT_ROOT, outputPath)} (${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MiB)`);
  console.log(`${network.statistics.nodes} nodes · ${network.statistics.segments} segments · ${network.statistics.snappedDestinations}/${network.statistics.destinations} destinations snapped`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
