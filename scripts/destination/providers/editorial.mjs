import fs from 'node:fs';
import { normalizeName } from '../dedupe.mjs';
import { canonicalCategory } from '../taxonomy.mjs';
import { field, navigationLinks, slug } from './common.mjs';

const LOCALITY_CENTERS = {
  'las-trancas': { lat: -36.914792, lon: -71.495698, label: 'Valle Las Trancas' },
  recinto: { lat: -36.846414, lon: -71.656873, label: 'Recinto' },
  'los-lleuques': { lat: -36.8540055, lon: -71.6443989, label: 'Los Lleuques' },
  nevados: { lat: -36.9082176, lon: -71.4205745, label: 'Nevados de Chillán' }
};

const RESTAURANT_TAGS = {
  restaurante: { amenity: 'restaurant' },
  cafe_bar: { amenity: 'cafe' },
  restobar: { amenity: 'restaurant' },
  bar_restobar: { amenity: 'restaurant' },
  pasteleria: { shop: 'bakery' },
  panaderia: { shop: 'bakery' },
  restaurante_bar_pasteleria: { amenity: 'restaurant' },
  restaurante_pizzeria: { amenity: 'restaurant' },
  pizzeria_bar: { amenity: 'fast_food' },
  cafe: { amenity: 'cafe' },
  pasteleria_sandwicheria: { shop: 'bakery' },
  heladeria: { amenity: 'cafe' },
  panaderia_pasteleria: { shop: 'bakery' },
  supermercado: { shop: 'supermarket' },
  cava: { shop: 'convenience' },
  charcuteria: { shop: 'convenience' },
  cerveceria: { amenity: 'bar' },
  cerveceria_pasteleria: { amenity: 'bar' },
  saludable: { amenity: 'restaurant' },
  mixto: { shop: 'convenience' }
};

function searchQuery(url, fallback) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('query') || fallback;
  } catch {
    return fallback;
  }
}

function localityFor(query) {
  const normalized = normalizeName(query);
  if (normalized.includes('recinto')) return LOCALITY_CENTERS.recinto;
  if (normalized.includes('lleuque')) return LOCALITY_CENTERS['los-lleuques'];
  if (normalized.includes('nevados') || normalized.includes('plaza tata')) return LOCALITY_CENTERS.nevados;
  return LOCALITY_CENTERS['las-trancas'];
}

function exactManualMatch(restaurant, manualPlaces) {
  const id = restaurant.id;
  const normalized = normalizeName(restaurant.name);
  return manualPlaces.find((place) => place.legacyId === id || normalizeName(place.name) === normalized) || null;
}

function directionsForQuery(query) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}

export function loadEditorialCatalog(file, manualPlaces = []) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const restaurants = (data.restaurants || []).filter((item) => item.status !== 'no_publicar').map((item) => {
    const query = searchQuery(item.googleMapsUrl, `${item.name} Ñuble Chile`);
    const manual = exactManualMatch(item, manualPlaces);
    const locality = localityFor(query);
    const location = manual?.location || { lat: locality.lat, lon: locality.lon };
    const routingEligible = Boolean(manual && manual.status !== 'candidate_coordinate');
    const sourceUrl = item.googleMapsUrl || null;
    const links = manual ? navigationLinks(location, item.googleMapsUrl || manual.googleMapsUrl) : {
      navigationUrl: directionsForQuery(query),
      googleMapsUrl: item.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    };
    return {
      id: `editorial-${item.id || slug(item.name)}`,
      legacyId: item.id || null,
      name: item.name,
      localizedName: item.nombre || null,
      aliases: [],
      category: canonicalCategory(RESTAURANT_TAGS[item.category] || { amenity: 'restaurant' }),
      municipality: 'Pinto',
      address: field(manual ? null : locality.label, 'editorial', sourceUrl, null),
      location,
      coordinateKind: manual ? manual.coordinateKind : 'center_candidate',
      coordinatePrecision: manual ? (routingEligible ? 'verified' : 'approximate') : 'locality_center',
      routingEligible,
      ...links,
      website: null,
      phone: null,
      openingHours: null,
      instagram: null,
      googleRating: null,
      tripadvisorRating: null,
      providerRefs: { osm: [], googlePlaceId: null, tripadvisorLocationId: null },
      sources: [{
        provider: 'editorial', id: item.id || null, url: sourceUrl, checkedAt: null,
        sourceLabel: item.status === 'validar' ? 'Host catalog · local verification pending' : 'Host-curated catalog'
      }],
      status: manual ? manual.status : 'candidate_coordinate'
    };
  });

  const offerings = (data.activities || []).filter((item) => item.visible !== false).map((item) => ({
    id: item.id,
    type: item.tipo,
    name: item.nombre,
    category: item.categoria,
    subcategory: item.subcategoria,
    module: item.modulo,
    season: item.temporada,
    seasonKey: item.temporada_key,
    zone: item.zona,
    zoneKey: item.zona_key,
    duration: item.duracion,
    difficulty: item.dificultad,
    difficultyKey: item.dificultad_key,
    minimumAge: item.edad_minima,
    referencePrice: item.precio_referencia,
    hours: item.horario,
    booking: item.reserva_o_compra,
    contact: item.contacto,
    safetyNotes: item.notas_seguridad,
    summary: item.copy_card,
    officialUrl: item.link_oficial || null,
    mapsSearchUrl: item.google_maps_url || null,
    verifiedAt: item.fecha_verificacion || null,
    sourceCode: item.fuente || null,
    status: 'published'
  }));

  const routeModules = new Set(['senderos', 'bici']);
  const routes = offerings.filter((item) => routeModules.has(item.module)).map((item) => ({
    id: `route-${item.id}`,
    offeringId: item.id,
    name: item.name,
    activityType: item.module,
    difficulty: item.difficulty,
    duration: item.duration,
    safetyNotes: item.safetyNotes,
    officialUrl: item.officialUrl,
    navigationUrl: null,
    navigationAvailable: false,
    status: 'trailhead_unverified',
    warning: {
      es: 'Inicio público, estacionamiento y derecho de acceso pendientes de verificación local.',
      pt: 'Início público, estacionamento e direito de acesso aguardando verificação local.',
      en: 'Public trailhead, parking and access rights still require local verification.'
    },
    verifiedAt: item.verifiedAt
  }));

  return { restaurants, offerings, routes };
}

export { LOCALITY_CENTERS, RESTAURANT_TAGS };
