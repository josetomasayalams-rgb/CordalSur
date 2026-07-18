import fs from 'node:fs';
import { field, navigationLinks, slug } from './common.mjs';

const CATEGORY = {
  food: 'restaurant', groceries: 'supermarket', fuel: 'gas_station', health: 'medical',
  hardware: 'hardware', police: 'emergency', fire: 'emergency', activities: 'tourism'
};

function searchLinks(place) {
  const query = [place.name, place.sector, place.municipality, 'Ñuble Chile'].filter(Boolean).join(' ');
  return {
    navigationUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`,
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
  };
}

export function loadManualPlaces(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (data.places || []).map((place) => {
    const location = { lat: place.lat, lon: place.lon };
    const sourceUrl = place.sourceUrl || null;
    const routingEligible = place.precision !== 'approximate';
    return {
      id: `manual-${place.id || slug(place.name)}`,
      legacyId: place.id || null,
      name: place.name,
      aliases: [],
      category: CATEGORY[place.category] || 'other',
      municipality: place.municipality || null,
      address: field(place.sector, 'manual', sourceUrl, null),
      location,
      coordinateKind: 'manual_catalog',
      coordinatePrecision: routingEligible ? 'verified_catalog' : 'approximate_catalog',
      routingEligible,
      ...(routingEligible ? navigationLinks(location) : searchLinks(place)),
      website: null,
      phone: field(place.phone, 'manual', sourceUrl, null),
      openingHours: null,
      instagram: null,
      googleRating: null,
      tripadvisorRating: null,
      providerRefs: { osm: [], googlePlaceId: null, tripadvisorLocationId: null },
      sources: [{ provider: 'manual', id: place.id || null, url: sourceUrl, checkedAt: null, sourceLabel: place.source || 'legacy catalog' }],
      status: routingEligible ? 'published' : 'candidate_coordinate'
    };
  });
}
