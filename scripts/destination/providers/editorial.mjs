import fs from 'node:fs';
import { normalizeName } from '../dedupe.mjs';
import { canonicalCategory } from '../taxonomy.mjs';
import { field, navigationLinks, safeInstagram, slug } from './common.mjs';

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

function loadResearchCatalog(file) {
  if (!file || !fs.existsSync(file)) return { instagramProfiles: [], routeOverrides: [], catalogEntries: [] };
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    checkedAt: data.checkedAt || null,
    instagramProfiles: Array.isArray(data.instagramProfiles) ? data.instagramProfiles : [],
    routeOverrides: Array.isArray(data.routeOverrides) ? data.routeOverrides : [],
    catalogEntries: Array.isArray(data.catalogEntries) ? data.catalogEntries : []
  };
}

export function isDirectRouteUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const path = `${url.pathname.replace(/\/+$/, '')}/`;
    if (url.hostname === 'suda.io') return /^\/activity\/[A-Za-z0-9]+\/$/.test(path);
    if (url.hostname.endsWith('trailforks.com')) return /^\/trails\/[a-z0-9-]+\/$/i.test(path);
    if (url.hostname.endsWith('wikiloc.com')) return /^\/(?:hiking-trails|rutas-mountain-bike)\/.+-\d+\/$/i.test(path);
    if (url.hostname.endsWith('andeshandbook.org')) return /^\/senderismo\/ruta\/\d+\/$/.test(path);
    return false;
  } catch {
    return false;
  }
}

function routeAccessFor(item, override, checkedAt) {
  if (override?.status === 'unverified' || override?.status === 'info-only') {
    return {
      provider: override.provider || item.mapa?.provider || null,
      status: override.status,
      url: null,
      fallbackUrl: null,
      verifiedFrom: override.verifiedFrom || item.link_oficial || null,
      checkedAt
    };
  }
  const candidateUrl = override?.url || item.mapa?.primario_url || null;
  const sourceClaimsPublic = Boolean(override?.url) || item.mapa?.estado === 'verificado_publico';
  const direct = sourceClaimsPublic && isDirectRouteUrl(candidateUrl);
  return {
    provider: override?.provider || item.mapa?.provider || null,
    status: direct ? 'verified-direct' : candidateUrl ? 'info-only' : 'unavailable',
    url: direct ? candidateUrl : null,
    fallbackUrl: override?.fallbackUrl || item.mapa?.fallback_url || null,
    verifiedFrom: override?.verifiedFrom || item.link_oficial || candidateUrl,
    checkedAt,
    metrics: item.ruta || null
  };
}

function normalizedCatalogEntry(entry, checkedAt) {
  const instagram = entry.instagram && safeInstagram(entry.instagram.value);
  return {
    ...entry,
    instagram: instagram ? { ...entry.instagram, value: instagram } : null,
    routingEligible: false,
    status: entry.status || 'published',
    sources: [{
      provider: 'research',
      id: entry.id,
      url: entry.routeAccess?.verifiedFrom || entry.instagram?.sourceUrl || entry.officialUrl || null,
      checkedAt
    }]
  };
}

export function applyResearchedProfiles(places, researchFile) {
  const research = loadResearchCatalog(researchFile);
  return places.map((place) => {
    const profile = research.instagramProfiles.find((item) =>
      (item.placeId && (item.placeId === place.id || item.placeId === place.legacyId)) ||
      (item.legacyId && (item.legacyId === place.legacyId || item.legacyId === place.id))
    );
    const instagram = safeInstagram(profile?.url);
    if (!instagram) return place;
    const source = {
      provider: 'research',
      id: `instagram-${profile.placeId || profile.legacyId}`,
      url: profile.verifiedFrom,
      checkedAt: research.checkedAt,
      sourceLabel: 'Verified business or operator Instagram profile'
    };
    return {
      ...place,
      instagram: {
        value: instagram,
        provider: 'editorial',
        verifiedBy: 'editorial_verified_profile',
        scope: profile.scope || 'business',
        sourceUrl: profile.verifiedFrom,
        checkedAt: research.checkedAt
      },
      sources: (place.sources || []).some((item) => item.url === source.url && item.id === source.id)
        ? place.sources
        : [...(place.sources || []), source]
    };
  });
}

export function loadEditorialCatalog(file, manualPlaces = [], researchFile = null) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const research = loadResearchCatalog(researchFile);
  const instagramById = new Map(research.instagramProfiles.map((item) => [item.legacyId, item]));
  const routeOverrideById = new Map(research.routeOverrides.map((item) => [item.offeringId, item]));
  const restaurants = (data.restaurants || []).filter((item) => item.status !== 'no_publicar').map((item) => {
    const query = searchQuery(item.googleMapsUrl, `${item.name} Ñuble Chile`);
    const manual = exactManualMatch(item, manualPlaces);
    const locality = localityFor(query);
    const location = manual?.location || { lat: locality.lat, lon: locality.lon };
    const routingEligible = Boolean(manual && manual.status !== 'candidate_coordinate');
    const sourceUrl = item.googleMapsUrl || null;
    const verifiedInstagram = instagramById.get(item.id);
    const instagramUrl = safeInstagram(verifiedInstagram?.url);
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
      website: field(item.websiteUrl || null, 'editorial', item.websiteUrl || sourceUrl, research.checkedAt),
      phone: field(item.phone || null, 'editorial', sourceUrl, research.checkedAt),
      openingHours: null,
      instagram: instagramUrl ? {
        value: instagramUrl,
        provider: 'editorial',
        verifiedBy: 'editorial_verified_profile',
        sourceUrl: verifiedInstagram.verifiedFrom,
        checkedAt: research.checkedAt
      } : null,
      googleRating: null,
      tripadvisorRating: null,
      providerRefs: { osm: [], googlePlaceId: null, tripadvisorLocationId: null },
      sources: [{
        provider: 'editorial', id: item.id || null, url: sourceUrl, checkedAt: null,
        sourceLabel: item.status === 'validar' ? 'Host catalog · local verification pending' : 'Host-curated catalog'
      }].concat(instagramUrl ? [{
        provider: 'research', id: `instagram-${item.id}`, url: verifiedInstagram.verifiedFrom,
        checkedAt: research.checkedAt, sourceLabel: 'Official tourism directory linked the business profile'
      }] : []),
      status: manual ? manual.status : 'candidate_coordinate'
    };
  });

  const offerings = (data.activities || []).filter((item) => item.visible !== false).map((item) => {
    const routeAccess = routeAccessFor(item, routeOverrideById.get(item.id), research.checkedAt || item.fecha_verificacion || null);
    return {
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
      routeAccess,
      routeUrl: routeAccess.url,
      verifiedAt: item.fecha_verificacion || research.checkedAt || null,
      sourceCode: item.fuente || null,
      status: 'published'
    };
  });

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
    routeAccess: item.routeAccess,
    routeUrl: item.routeUrl,
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

  const catalogEntries = research.catalogEntries.map((entry) => normalizedCatalogEntry(entry, research.checkedAt));

  return { restaurants, offerings, routes, catalogEntries };
}

export { LOCALITY_CENTERS, RESTAURANT_TAGS };
