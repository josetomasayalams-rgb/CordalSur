import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { LANDING_ROOT, PROJECT_ROOT, SCRIPT_ROOT } from './paths.mjs';
import {
  bufferLine, haversineMeters, lineLengthMeters, nearestPointOnLine,
  simplifyLine, tilesForCircle, tilesForCorridor
} from './geo.mjs';

const config = JSON.parse(fs.readFileSync(path.join(SCRIPT_ROOT, 'config.json'), 'utf8'));

function coordinateKey(point) { return `${point.lat.toFixed(7)},${point.lon.toFixed(7)}`; }

function overpassQuery() {
  const [south, west, north, east] = config.route.bbox;
  return `[out:json][timeout:90];way["ref"="${config.route.ref}"](${south},${west},${north},${east});out meta geom;`;
}

async function requestJson(url, options, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 95000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) {
        const error = new Error(`request failed with ${response.status}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1 || error.retryable === false) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt + Math.floor(Math.random() * 200)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function buildGraph(ways) {
  const points = new Map();
  const adjacency = new Map();
  const edgeWays = new Map();
  function addEdge(from, to, wayId) {
    const weight = haversineMeters(points.get(from), points.get(to));
    const list = adjacency.get(from) || [];
    list.push({ to, weight });
    adjacency.set(from, list);
    edgeWays.set(`${from}>${to}`, wayId);
  }
  for (const way of ways) {
    if (!Array.isArray(way.geometry)) continue;
    for (const point of way.geometry) points.set(coordinateKey(point), { lat: point.lat, lon: point.lon });
    for (let index = 1; index < way.geometry.length; index += 1) {
      const from = coordinateKey(way.geometry[index - 1]);
      const to = coordinateKey(way.geometry[index]);
      addEdge(from, to, way.id);
      addEdge(to, from, way.id);
    }
  }
  return { points, adjacency, edgeWays };
}

function nearestNode(points, target) {
  let best = null;
  for (const [key, point] of points) {
    const distance = haversineMeters(point, target);
    if (!best || distance < best.distance) best = { key, point, distance };
  }
  return best;
}

function shortestPath(graph, start, finish) {
  const distance = new Map([[start, 0]]);
  const previous = new Map();
  const pending = new Set([start]);
  while (pending.size) {
    let current = null;
    for (const key of pending) if (current === null || distance.get(key) < distance.get(current)) current = key;
    pending.delete(current);
    if (current === finish) break;
    for (const edge of graph.adjacency.get(current) || []) {
      const candidate = distance.get(current) + edge.weight;
      if (candidate < (distance.get(edge.to) ?? Infinity)) {
        distance.set(edge.to, candidate);
        previous.set(edge.to, current);
        pending.add(edge.to);
      }
    }
  }
  if (!distance.has(finish)) throw new Error('N-55 graph does not connect rural start to the apartment segment');
  const keys = [];
  for (let current = finish; current; current = previous.get(current)) {
    keys.push(current);
    if (current === start) break;
  }
  keys.reverse();
  const wayIds = new Set();
  for (let index = 1; index < keys.length; index += 1) wayIds.add(graph.edgeWays.get(`${keys[index - 1]}>${keys[index]}`));
  return { points: keys.map((key) => graph.points.get(key)), wayIds: [...wayIds].filter(Boolean), distanceMeters: distance.get(finish) };
}

function roundedPoint(point) {
  return { lat: Number(point.lat.toFixed(7)), lon: Number(point.lon.toFixed(7)) };
}

async function main() {
  const query = overpassQuery();
  const url = `${config.providers.overpassEndpoint}?data=${encodeURIComponent(query)}`;
  const started = performance.now();
  const payload = await requestJson(url, { headers: { Accept: 'application/json', 'User-Agent': 'CordalSurDestinationGuide/1.0' } });
  const durationMs = Math.round(performance.now() - started);
  const ways = (payload.elements || []).filter((element) => element.type === 'way' && Array.isArray(element.geometry));
  if (!ways.length) throw new Error('Overpass returned no N-55 ways');

  const graph = buildGraph(ways);
  const start = nearestNode(graph.points, config.route.ruralStart);
  const finish = nearestNode(graph.points, config.apartment);
  const pathResult = shortestPath(graph, start.key, finish.key);
  const withApartmentConnector = pathResult.points.concat([{ lat: config.apartment.lat, lon: config.apartment.lon }]);
  const centerline = simplifyLine(withApartmentConnector, config.route.simplifyToleranceMeters).map(roundedPoint);
  const apartmentRadiusMeters = haversineMeters(config.apartment, config.radiusAnchor);
  const publishedApartmentRadiusMeters = Math.ceil(apartmentRadiusMeters * 100) / 100;
  const corridorPolygon = bufferLine(centerline, config.route.bufferMeters).map(roundedPoint);
  const apartmentTiles = tilesForCircle(config.apartment, publishedApartmentRadiusMeters, config.route.tileSizeMeters);
  const corridorTiles = tilesForCorridor(centerline, config.route.bufferMeters, config.route.tileSizeMeters);
  const radiusAnchorDistance = haversineMeters(config.apartment, config.radiusAnchor);
  if (radiusAnchorDistance > publishedApartmentRadiusMeters) throw new Error('radius anchor fell outside apartment boundary');

  const serializedRaw = JSON.stringify(payload);
  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: [{
      provider: 'OpenStreetMap',
      license: 'ODbL 1.0',
      attribution: '© OpenStreetMap contributors',
      url: 'https://www.openstreetmap.org/copyright',
      endpoint: config.providers.overpassEndpoint,
      osmBaseTimestamp: payload.osm3s?.timestamp_osm_base || null,
      query,
      responseSha256: crypto.createHash('sha256').update(serializedRaw).digest('hex'),
      durationMs,
      waysReturned: ways.length,
      waysUsed: pathResult.wayIds.sort((a, b) => a - b)
    }],
    apartment: {
      ...config.apartment,
      radiusAnchor: config.radiusAnchor,
      radiusMeters: publishedApartmentRadiusMeters,
      radiusMethod: 'haversine-wgs84',
      anchorInsideBoundary: radiusAnchorDistance <= publishedApartmentRadiusMeters
    },
    corridor: {
      name: 'Ruta N-55 · Pinto a Condominio Andes Chillán',
      routeRef: config.route.ref,
      ruralStart: config.route.ruralStart,
      startSnapMeters: Number(start.distance.toFixed(2)),
      apartmentRoadSnapMeters: Number(finish.distance.toFixed(2)),
      bufferMeters: config.route.bufferMeters,
      centerlineLengthMeters: Number(lineLengthMeters(centerline).toFixed(2)),
      geometry: { type: 'LineString', coordinates: centerline.map((point) => [point.lon, point.lat]) },
      bufferGeometry: { type: 'Polygon', coordinates: [corridorPolygon.map((point) => [point.lon, point.lat])] }
    },
    tiles: {
      sizeMeters: config.route.tileSizeMeters,
      apartment: apartmentTiles,
      corridor: corridorTiles
    },
    limitations: [
      'Apartment coordinate is approximate until an entrance or parking point is manually verified.',
      'The corridor buffer is a discovery boundary, not a driving route or legal road boundary.',
      'OpenStreetMap coverage is incomplete and does not prove that an establishment does not exist.'
    ]
  };

  const destination = path.join(LANDING_ROOT, 'data/destination-geometry.json');
  fs.writeFileSync(destination, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${path.relative(PROJECT_ROOT, destination)}`);
  console.log(`Apartment radius: ${(apartmentRadiusMeters / 1000).toFixed(2)} km`);
  console.log(`Corridor: ${(output.corridor.centerlineLengthMeters / 1000).toFixed(2)} km · ${centerline.length} points · ${corridorTiles.length} tiles`);
}

await main();
