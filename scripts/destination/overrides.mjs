import fs from 'node:fs';
import { field, navigationLinks, safeInstagram, slug } from './providers/common.mjs';

function readPayload(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function matches(place, placeId) {
  return place.id === placeId || place.legacyId === placeId || place.mergedFrom?.includes(placeId);
}

export function loadPlaceOverrides(file) {
  if (!file || !fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (Array.isArray(parsed) ? parsed : parsed.overrides || []).filter((item) => item && item.action && item.placeId);
}

export function recordsFromAddOverrides(overrides) {
  return overrides.filter((item) => item.action === 'add').map((item) => {
    const payload = readPayload(item.payload);
    const location = { lat: Number(payload.lat), lon: Number(payload.lon) };
    const sourceUrl = payload.sourceUrl || null;
    const checkedAt = payload.checkedAt || item.updatedAt || item.createdAt || null;
    const instagram = safeInstagram(payload.instagramUrl);
    return {
      id: item.placeId || `override-${slug(payload.name)}`,
      legacyId: item.placeId,
      name: payload.name,
      aliases: [],
      category: payload.category || 'other',
      municipality: payload.municipality || 'Pinto',
      address: field(payload.address || null, 'manual', sourceUrl, checkedAt),
      location,
      coordinateKind: payload.coordinateKind || 'manual_verified',
      coordinatePrecision: payload.coordinatePrecision || 'verified',
      routingEligible: payload.routingEligible !== false,
      ...navigationLinks(location),
      website: field(payload.websiteUrl || null, 'manual', sourceUrl, checkedAt),
      phone: field(payload.phone || null, 'manual', sourceUrl, checkedAt),
      openingHours: field(payload.openingHours || null, 'manual', sourceUrl, checkedAt),
      instagram: instagram ? { value: instagram, provider: 'manual', verifiedBy: 'manual_verified_override', sourceUrl: payload.verifiedFrom || sourceUrl, checkedAt } : null,
      googleRating: null,
      tripadvisorRating: null,
      providerRefs: { osm: [], googlePlaceId: null, tripadvisorLocationId: null },
      sources: [{ provider: 'manual', id: item.id || item.placeId, url: sourceUrl, checkedAt, sourceLabel: item.reason || 'Verified manual override' }],
      status: payload.status || 'published'
    };
  });
}

export function mergeOverrides(overrides) {
  return overrides.filter((item) => item.action === 'merge').map((item) => ({
    action: 'merge', primaryId: item.placeId, secondaryId: item.targetPlaceId || readPayload(item.payload).targetPlaceId
  })).filter((item) => item.secondaryId);
}

export function applyPlaceOverrides(places, overrides) {
  const output = places.map((place) => ({ ...place }));
  for (const item of overrides) {
    if (item.action === 'add' || item.action === 'merge') continue;
    const place = output.find((candidate) => matches(candidate, item.placeId));
    if (!place) continue;
    const payload = readPayload(item.payload);
    const checkedAt = payload.checkedAt || item.updatedAt || item.createdAt || null;
    const sourceUrl = payload.sourceUrl || payload.verifiedFrom || payload.websiteUrl || null;
    if (item.action === 'category' && payload.category) place.category = payload.category;
    if (item.action === 'location' && Number.isFinite(Number(payload.lat)) && Number.isFinite(Number(payload.lon))) {
      place.location = { lat: Number(payload.lat), lon: Number(payload.lon) };
      place.coordinateKind = payload.coordinateKind || 'manual_verified';
      place.coordinatePrecision = payload.coordinatePrecision || 'verified';
      place.routingEligible = payload.routingEligible !== false;
      if (payload.status) place.status = payload.status;
      else if (place.status === 'candidate_coordinate') place.status = 'published';
      Object.assign(place, navigationLinks(place.location));
    }
    if (item.action === 'website') place.website = field(payload.websiteUrl || null, 'manual', sourceUrl, checkedAt);
    if (item.action === 'instagram') {
      const value = safeInstagram(payload.instagramUrl);
      place.instagram = value ? { value, provider: 'manual', verifiedBy: 'manual_verified_override', sourceUrl: payload.verifiedFrom, checkedAt } : null;
    }
    if (item.action === 'closed') {
      place.operatingStatus = payload.closed === false ? 'operating_status_unknown' : 'closed';
      place.statusCheckedAt = checkedAt;
    }
    place.sources = [...(place.sources || []), { provider: 'manual', id: item.id || null, url: sourceUrl, checkedAt, sourceLabel: item.reason || `Manual ${item.action} override` }];
  }
  return output;
}
