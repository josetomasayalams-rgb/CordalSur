const EARTH_RADIUS_METERS = 6371008.8;

function finiteCoordinate(point, label = 'coordinate') {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon) ||
      point.lat < -90 || point.lat > 90 || point.lon < -180 || point.lon > 180) {
    throw new TypeError(`${label} must contain valid lat/lon numbers`);
  }
  return point;
}

function radians(value) { return value * Math.PI / 180; }

export function haversineMeters(from, to) {
  finiteCoordinate(from, 'from');
  finiteCoordinate(to, 'to');
  const lat1 = radians(from.lat);
  const lat2 = radians(to.lat);
  const deltaLat = radians(to.lat - from.lat);
  let deltaLon = radians(to.lon - from.lon);
  if (deltaLon > Math.PI) deltaLon -= Math.PI * 2;
  if (deltaLon < -Math.PI) deltaLon += Math.PI * 2;
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function projector(reference) {
  const cosLat = Math.cos(radians(reference.lat));
  return {
    toXY(point) {
      return {
        x: radians(point.lon - reference.lon) * EARTH_RADIUS_METERS * cosLat,
        y: radians(point.lat - reference.lat) * EARTH_RADIUS_METERS
      };
    },
    toLatLon(point) {
      return {
        lat: reference.lat + point.y / EARTH_RADIUS_METERS * 180 / Math.PI,
        lon: reference.lon + point.x / (EARTH_RADIUS_METERS * cosLat) * 180 / Math.PI
      };
    }
  };
}

function projectOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const raw = lengthSquared ? ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared : 0;
  const t = Math.max(0, Math.min(1, raw));
  const projected = { x: start.x + t * dx, y: start.y + t * dy };
  return { point: projected, t, distance: Math.hypot(point.x - projected.x, point.y - projected.y) };
}

export function nearestPointOnLine(line, target) {
  if (!Array.isArray(line) || line.length < 2) throw new TypeError('line requires at least two coordinates');
  line.forEach((point, index) => finiteCoordinate(point, `line[${index}]`));
  finiteCoordinate(target, 'target');
  const project = projector(target);
  const xy = line.map(project.toXY);
  let best = null;
  let progress = 0;
  for (let index = 1; index < xy.length; index += 1) {
    const start = xy[index - 1];
    const end = xy[index];
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
    const candidate = projectOnSegment({ x: 0, y: 0 }, start, end);
    if (!best || candidate.distance < best.distanceMeters) {
      best = {
        point: project.toLatLon(candidate.point),
        distanceMeters: candidate.distance,
        progressMeters: progress + candidate.t * segmentLength,
        segmentIndex: index - 1,
        segmentFraction: candidate.t
      };
    }
    progress += segmentLength;
  }
  best.lineLengthMeters = progress;
  return best;
}

export function simplifyLine(line, toleranceMeters = 20) {
  if (!Array.isArray(line) || line.length <= 2 || toleranceMeters <= 0) return line.slice();
  const project = projector(line[0]);
  const xy = line.map(project.toXY);
  const keep = new Set([0, line.length - 1]);
  const stack = [[0, line.length - 1]];
  while (stack.length) {
    const [startIndex, endIndex] = stack.pop();
    let furthest = -1;
    let distance = 0;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const candidate = projectOnSegment(xy[index], xy[startIndex], xy[endIndex]);
      if (candidate.distance > distance) {
        distance = candidate.distance;
        furthest = index;
      }
    }
    if (distance > toleranceMeters && furthest > startIndex) {
      keep.add(furthest);
      stack.push([startIndex, furthest], [furthest, endIndex]);
    }
  }
  return [...keep].sort((a, b) => a - b).map((index) => line[index]);
}

export function bufferLine(line, bufferMeters) {
  if (!Array.isArray(line) || line.length < 2 || !(bufferMeters > 0)) {
    throw new TypeError('bufferLine requires a line and positive buffer');
  }
  const reference = line[Math.floor(line.length / 2)];
  const project = projector(reference);
  const xy = line.map(project.toXY);
  const left = [];
  const right = [];
  for (let index = 0; index < xy.length; index += 1) {
    const previous = xy[Math.max(0, index - 1)];
    const next = xy[Math.min(xy.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const normal = { x: -dy / length * bufferMeters, y: dx / length * bufferMeters };
    left.push(project.toLatLon({ x: xy[index].x + normal.x, y: xy[index].y + normal.y }));
    right.push(project.toLatLon({ x: xy[index].x - normal.x, y: xy[index].y - normal.y }));
  }
  const ring = left.concat(right.reverse());
  ring.push({ ...ring[0] });
  return ring;
}

function bboxForPoints(points) {
  return points.reduce((box, point) => ({
    south: Math.min(box.south, point.lat), west: Math.min(box.west, point.lon),
    north: Math.max(box.north, point.lat), east: Math.max(box.east, point.lon)
  }), { south: Infinity, west: Infinity, north: -Infinity, east: -Infinity });
}

function tileFromCenter(center, sizeMeters, id) {
  const half = sizeMeters / 2;
  const latDelta = half / EARTH_RADIUS_METERS * 180 / Math.PI;
  const lonDelta = latDelta / Math.cos(radians(center.lat));
  return {
    id, center, sizeMeters,
    bbox: [center.lat - latDelta, center.lon - lonDelta, center.lat + latDelta, center.lon + lonDelta],
    queryRadiusMeters: Math.ceil(Math.hypot(half, half))
  };
}

function grid(box, sizeMeters, include, prefix) {
  const midLat = (box.south + box.north) / 2;
  const latStep = sizeMeters / EARTH_RADIUS_METERS * 180 / Math.PI;
  const lonStep = latStep / Math.cos(radians(midLat));
  const tiles = [];
  let row = 0;
  for (let lat = box.south + latStep / 2; lat <= box.north + latStep / 2; lat += latStep) {
    let column = 0;
    for (let lon = box.west + lonStep / 2; lon <= box.east + lonStep / 2; lon += lonStep) {
      const tile = tileFromCenter({ lat, lon }, sizeMeters, `${prefix}-${row}-${column}`);
      if (include(tile)) tiles.push(tile);
      column += 1;
    }
    row += 1;
  }
  return tiles;
}

export function tilesForCircle(center, radiusMeters, sizeMeters) {
  finiteCoordinate(center, 'center');
  const latitude = radiusMeters / EARTH_RADIUS_METERS * 180 / Math.PI;
  const longitude = latitude / Math.cos(radians(center.lat));
  const box = { south: center.lat - latitude, west: center.lon - longitude, north: center.lat + latitude, east: center.lon + longitude };
  return grid(box, sizeMeters, (tile) => haversineMeters(center, tile.center) <= radiusMeters + tile.queryRadiusMeters, 'apartment');
}

export function tilesForCorridor(line, bufferMeters, sizeMeters) {
  const polygon = bufferLine(line, bufferMeters);
  const box = bboxForPoints(polygon);
  return grid(box, sizeMeters, (tile) => nearestPointOnLine(line, tile.center).distanceMeters <= bufferMeters + tile.queryRadiusMeters, 'corridor');
}

export function lineLengthMeters(line) {
  return line.slice(1).reduce((total, point, index) => total + haversineMeters(line[index], point), 0);
}

export { EARTH_RADIUS_METERS };
