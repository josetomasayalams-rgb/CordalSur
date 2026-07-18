import { haversineMeters } from './geo.mjs';

export function normalizeName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\b(restaurante|restaurant|restobar|cabanas?|cabins?)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 9) return `56${digits}`;
  return digits;
}

export function websiteHost(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}

function tokenSimilarity(left, right) {
  const a = new Set(normalizeName(left).split(' ').filter(Boolean));
  const b = new Set(normalizeName(right).split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}

function tokenContainment(left, right) {
  const a = new Set(normalizeName(left).split(' ').filter(Boolean));
  const b = new Set(normalizeName(right).split(' ').filter(Boolean));
  if (Math.min(a.size, b.size) < 2) return false;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  return [...smaller].every((token) => larger.has(token));
}

const CATEGORY_FAMILIES = [
  new Set(['restaurant', 'coffee', 'fast_food', 'bakery']),
  new Set(['supermarket', 'convenience', 'shopping']),
  new Set(['tourism', 'adventure', 'trail', 'ski', 'thermal_baths']),
  new Set(['hotel', 'cabin'])
];

function compatibleCategories(left, right) {
  if (left === right || left === 'other' || right === 'other') return true;
  return CATEGORY_FAMILIES.some((family) => family.has(left) && family.has(right));
}

function distance(left, right) {
  if (!left.location || !right.location) return Infinity;
  return haversineMeters(left.location, right.location);
}

function refs(place) { return place.providerRefs || {}; }

export function matchReason(left, right, manualPairs = new Set()) {
  const pair = [left.id, right.id].sort().join('|');
  if (manualPairs.has(pair)) return { merge: true, reason: 'manual_override', score: 1 };
  if (refs(left).googlePlaceId && refs(left).googlePlaceId === refs(right).googlePlaceId) return { merge: true, reason: 'google_place_id', score: 1 };
  if (refs(left).tripadvisorLocationId && refs(left).tripadvisorLocationId === refs(right).tripadvisorLocationId) return { merge: true, reason: 'tripadvisor_location_id', score: 1 };
  const leftOsm = new Set(refs(left).osm || []);
  if ((refs(right).osm || []).some((id) => leftOsm.has(id))) return { merge: true, reason: 'osm_identifier', score: 1 };
  const meters = distance(left, right);
  const phone = normalizePhone(left.phone?.value || left.phone) && normalizePhone(left.phone?.value || left.phone) === normalizePhone(right.phone?.value || right.phone);
  const host = websiteHost(left.website?.value || left.website) && websiteHost(left.website?.value || left.website) === websiteHost(right.website?.value || right.website);
  if ((phone || host) && meters <= 300) return { merge: true, reason: phone ? 'phone_and_location' : 'website_and_location', score: 0.98 };
  const similarity = tokenSimilarity(left.name, right.name);
  const compatibleCategory = compatibleCategories(left.category, right.category);
  const addressSimilarity = tokenSimilarity(left.address?.value || left.address, right.address?.value || right.address);
  if (compatibleCategory && meters <= 30 && tokenContainment(left.name, right.name)) return { merge: true, reason: 'name_containment_exact_location', score: Math.max(similarity, 0.9) };
  if (similarity >= 0.8 && compatibleCategory && meters <= 100) return { merge: true, reason: 'name_category_location', score: similarity };
  if (similarity >= 0.6 && addressSimilarity >= 0.75 && compatibleCategory && meters <= 500) return { merge: true, reason: 'name_address_location', score: (similarity + addressSimilarity) / 2 };
  return { merge: false, reason: 'distinct', score: similarity };
}

function valueRank(value) {
  const provider = value && typeof value === 'object' ? value.provider : '';
  return { manual: 5, official: 4, google: 3, osm: 2, tripadvisor: 2 }[provider] || (value ? 1 : 0);
}

function richer(left, right) {
  if (!left) return right ?? null;
  if (!right) return left;
  return valueRank(right) > valueRank(left) ? right : left;
}

function mergeTwo(primary, secondary, reason) {
  const merged = { ...primary };
  for (const field of ['website', 'phone', 'openingHours', 'instagram', 'googleRating', 'tripadvisorRating']) {
    merged[field] = richer(primary[field], secondary[field]);
  }
  if ((!merged.location || merged.coordinateKind === 'center_candidate') && secondary.location) {
    merged.location = secondary.location;
    merged.coordinateKind = secondary.coordinateKind;
    merged.coordinatePrecision = secondary.coordinatePrecision;
    merged.routingEligible = secondary.routingEligible;
    merged.status = secondary.status || merged.status;
  }
  if (merged.category === 'other' && secondary.category !== 'other') merged.category = secondary.category;
  merged.aliases = [...new Set([...(primary.aliases || []), ...(secondary.aliases || []), secondary.name].filter((name) => name && name !== primary.name))];
  merged.sources = [...new Map([...(primary.sources || []), ...(secondary.sources || [])].map((source) => [`${source.provider}:${source.id || source.url || ''}`, source])).values()];
  merged.providerRefs = {
    osm: [...new Set([...(refs(primary).osm || []), ...(refs(secondary).osm || [])])],
    googlePlaceId: refs(primary).googlePlaceId || refs(secondary).googlePlaceId || null,
    tripadvisorLocationId: refs(primary).tripadvisorLocationId || refs(secondary).tripadvisorLocationId || null
  };
  merged.mergedFrom = [...new Set([...(primary.mergedFrom || []), secondary.id, ...(secondary.mergedFrom || [])])];
  merged.mergeReasons = [...(primary.mergeReasons || []), { sourceId: secondary.id, reason }];
  return merged;
}

export function mergePlaces(records, overrides = []) {
  const manualPairs = new Set(overrides.filter((item) => item.action === 'merge').map((item) => [item.primaryId, item.secondaryId].sort().join('|')));
  const places = [];
  const audit = [];
  for (const record of records) {
    let target = -1;
    let match = null;
    for (let index = 0; index < places.length; index += 1) {
      const candidate = matchReason(places[index], record, manualPairs);
      if (candidate.merge) { target = index; match = candidate; break; }
    }
    if (target < 0) places.push({ ...record, mergedFrom: record.mergedFrom || [], mergeReasons: record.mergeReasons || [] });
    else {
      audit.push({ primaryId: places[target].id, secondaryId: record.id, ...match });
      places[target] = mergeTwo(places[target], record, match.reason);
    }
  }
  return { places, mergedCount: records.length - places.length, audit };
}
