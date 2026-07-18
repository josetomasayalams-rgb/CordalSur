const EARTH_RADIUS_METERS = 6371008.8;

export function networkIdentity(raw) {
  const source = raw && raw.source && typeof raw.source === 'object' ? raw.source : {};
  const version = raw && (raw.networkVersion || raw.version || raw.generatedAt);
  const hash = raw && (raw.networkHash || raw.hash || source.responseSha256);
  return {
    schemaVersion: raw && Number.isFinite(Number(raw.schemaVersion)) ? Number(raw.schemaVersion) : null,
    version: typeof version === 'string' && version ? version : null,
    hash: typeof hash === 'string' && hash ? hash : null
  };
}

export function haversineMeters(a, b) {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLon = (b.lon - a.lon) * radians;
  const lat1 = a.lat * radians;
  const lat2 = b.lat * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function projectOnSegment(a, b, target) {
  const refLat = target.lat * Math.PI / 180;
  const scaleX = 111320 * Math.cos(refLat);
  const ax = (a.lon - target.lon) * scaleX;
  const ay = (a.lat - target.lat) * 110540;
  const bx = (b.lon - target.lon) * scaleX;
  const by = (b.lat - target.lat) * 110540;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
  return { fraction, distanceMeters: Math.hypot(ax + fraction * dx, ay + fraction * dy) };
}

export function prepareNetwork(raw) {
  if (!raw || raw.schemaVersion !== 1 || !Array.isArray(raw.nodes) || !Array.isArray(raw.segments)) throw new Error('invalid driving network');
  const nodes = raw.nodes.map((node) => ({ lat: Number(node[0]), lon: Number(node[1]) }));
  const segments = raw.segments.map((segment, index) => ({
    index,
    from: Number(segment[0]),
    to: Number(segment[1]),
    meters: Number(segment[2]),
    flags: Number(segment[3])
  }));
  const adjacency = Array.from({ length: nodes.length }, () => []);
  for (const segment of segments) {
    if (segment.flags & 1) adjacency[segment.from].push({ to: segment.to, meters: segment.meters });
    if (segment.flags & 2) adjacency[segment.to].push({ to: segment.from, meters: segment.meters });
  }
  return { ...raw, nodes, segments, adjacency, graph: networkIdentity(raw) };
}

export function snapToNetwork(network, target, maxDistanceMeters = 1000) {
  let best = null;
  for (const segment of network.segments) {
    const projection = projectOnSegment(network.nodes[segment.from], network.nodes[segment.to], target);
    if (!best || projection.distanceMeters < best.offsetMeters) {
      best = { segment: segment.index, fraction: projection.fraction, offsetMeters: projection.distanceMeters };
    }
  }
  if (!best || best.offsetMeters > maxDistanceMeters) return null;
  return {
    segment: best.segment,
    fraction: Number(best.fraction.toFixed(6)),
    offsetMeters: Number(best.offsetMeters.toFixed(1)),
    quality: best.offsetMeters > 150 ? 'access_nearby' : (best.offsetMeters > 30 ? 'near' : 'on_road')
  };
}

class MinHeap {
  constructor() { this.items = []; }
  push(node, distance) {
    const item = { node, distance };
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.items[parent].distance <= distance) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = item;
  }
  pop() {
    if (!this.items.length) return null;
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length && last) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= this.items.length) break;
        const child = right < this.items.length && this.items[right].distance < this.items[left].distance ? right : left;
        if (this.items[child].distance >= last.distance) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = last;
    }
    return first;
  }
}

function seedOrigin(network, originSnap) {
  const distances = new Float64Array(network.nodes.length);
  distances.fill(Infinity);
  const heap = new MinHeap();
  const segment = network.segments[originSnap.segment];
  if (!segment) return { distances, heap };
  const offset = originSnap.offsetMeters;
  if (segment.flags & 1) {
    const value = offset + (1 - originSnap.fraction) * segment.meters;
    distances[segment.to] = value;
    heap.push(segment.to, value);
  }
  if (segment.flags & 2) {
    const value = offset + originSnap.fraction * segment.meters;
    if (value < distances[segment.from]) {
      distances[segment.from] = value;
      heap.push(segment.from, value);
    }
  }
  return { distances, heap };
}

function dijkstra(network, originSnap) {
  const { distances, heap } = seedOrigin(network, originSnap);
  while (heap.items.length) {
    const current = heap.pop();
    if (!current || current.distance !== distances[current.node]) continue;
    for (const edge of network.adjacency[current.node]) {
      const candidate = current.distance + edge.meters;
      if (candidate < distances[edge.to]) {
        distances[edge.to] = candidate;
        heap.push(edge.to, candidate);
      }
    }
  }
  return distances;
}

function destinationDistance(network, distances, originSnap, destinationSnap) {
  if (!destinationSnap) return Infinity;
  const segment = network.segments[destinationSnap.segment];
  if (!segment) return Infinity;
  let best = Infinity;
  if (segment.flags & 1) best = Math.min(best, distances[segment.from] + destinationSnap.fraction * segment.meters);
  if (segment.flags & 2) best = Math.min(best, distances[segment.to] + (1 - destinationSnap.fraction) * segment.meters);
  if (originSnap.segment === destinationSnap.segment) {
    if ((segment.flags & 1) && destinationSnap.fraction >= originSnap.fraction) best = Math.min(best, originSnap.offsetMeters + (destinationSnap.fraction - originSnap.fraction) * segment.meters);
    if ((segment.flags & 2) && destinationSnap.fraction <= originSnap.fraction) best = Math.min(best, originSnap.offsetMeters + (originSnap.fraction - destinationSnap.fraction) * segment.meters);
  }
  return best + destinationSnap.offsetMeters;
}

export function routeDistances(network, origin, destinationSnaps = network.destinations || []) {
  const graph = network.graph || networkIdentity(network);
  const isSnap = Boolean(origin && Object.prototype.hasOwnProperty.call(origin, 'segment'));
  const hasCoordinates = Boolean(origin && Number.isFinite(Number(origin.lat)) && Number.isFinite(Number(origin.lon)));
  if (!isSnap && !hasCoordinates) {
    return { coverage: 'outside-network', graph, originSnap: null, distances: {} };
  }
  const rawOrigin = isSnap ? null : { lat: Number(origin.lat), lon: Number(origin.lon) };
  const originSnap = isSnap ? origin : snapToNetwork(network, rawOrigin);
  if (!originSnap || !network.segments[originSnap.segment]) {
    return { coverage: 'outside-network', graph, originSnap: null, distances: {} };
  }
  const graphDistances = dijkstra(network, originSnap);
  const distances = {};
  for (const destination of destinationSnaps) {
    const meters = destinationDistance(network, graphDistances, originSnap, destination.snap);
    const direct = rawOrigin && destination.location ? haversineMeters(rawOrigin, destination.location) : 0;
    distances[destination.id] = Number.isFinite(meters) && meters + 1 >= direct ? {
      meters: Math.ceil(Math.max(meters, direct) * 10) / 10,
      accessNearby: destination.snap.quality === 'access_nearby',
      snapMeters: destination.snap.offsetMeters,
      snapQuality: destination.snap.quality
    } : null;
  }
  return { coverage: 'covered', graph, originSnap, distances };
}
