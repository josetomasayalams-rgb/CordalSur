import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bufferLine, haversineMeters, nearestPointOnLine, simplifyLine,
  tilesForCircle, tilesForCorridor
} from '../../scripts/destination/geo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

assert.equal(haversineMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 0 }), 0);
assert.ok(Math.abs(haversineMeters({ lat: 0, lon: 179.9 }, { lat: 0, lon: -179.9 }) - 22239) < 20);
assert.throws(() => haversineMeters({ lat: 91, lon: 0 }, { lat: 0, lon: 0 }), /valid lat\/lon/);

const simpleLine = [{ lat: -36.8, lon: -71.8 }, { lat: -36.8, lon: -71.7 }, { lat: -36.8, lon: -71.6 }];
const projected = nearestPointOnLine(simpleLine, { lat: -36.79, lon: -71.7 });
assert.ok(projected.distanceMeters > 1000 && projected.distanceMeters < 1200);
assert.ok(projected.progressMeters > 8000 && projected.progressMeters < 10000);
assert.equal(simplifyLine(simpleLine, 20).length, 2);
assert.equal(bufferLine(simpleLine, 1000).at(0).lat, bufferLine(simpleLine, 1000).at(-1).lat);
assert.ok(tilesForCircle(simpleLine[0], 5000, 2500).length > 4);
assert.ok(tilesForCorridor(simpleLine, 1000, 2500).length > 1);

const geometryPath = path.join(ROOT, 'data/destination-geometry.json');
assert.ok(fs.existsSync(geometryPath), 'destination geometry must be generated');
const geometry = JSON.parse(fs.readFileSync(geometryPath, 'utf8'));
assert.equal(geometry.schemaVersion, 1);
assert.equal(geometry.apartment.radiusMethod, 'haversine-wgs84');
assert.equal(geometry.apartment.anchorInsideBoundary, true);
assert.ok(geometry.apartment.radiusMeters > 22000 && geometry.apartment.radiusMeters < 23000);
assert.equal(geometry.corridor.routeRef, 'N-55');
assert.ok(geometry.corridor.geometry.coordinates.length > 20);
assert.ok(geometry.corridor.centerlineLengthMeters > 40000);
assert.ok(geometry.corridor.bufferGeometry.coordinates[0].length > 40);
assert.ok(geometry.tiles.apartment.length > 20);
assert.ok(geometry.tiles.corridor.length > 20);
assert.ok(geometry.sources[0].query.includes('way["ref"="N-55"]'));
assert.match(geometry.sources[0].responseSha256, /^[a-f0-9]{64}$/);

console.log(`  PASS (automatic ${Math.round(geometry.apartment.radiusMeters)} m radius, real N-55 corridor and tiled boundaries)`);
