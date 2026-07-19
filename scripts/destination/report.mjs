import fs from 'node:fs';
import path from 'node:path';
import { LANDING_ROOT, PROJECT_ROOT as ROOT } from './paths.mjs';

const GUIDE_PATH = path.join(LANDING_ROOT, 'data/destination-guide.json');
const REPORT_PATH = path.join(ROOT, 'docs/reports/destination-guide-coverage-2026-07-17.md');
const RESEARCH_REPORT_PATH = path.join(ROOT, '.research/20260717-destination-guide/polished_report.md');
const guide = JSON.parse(fs.readFileSync(GUIDE_PATH, 'utf8'));
const stats = guide.meta.statistics;

function escapeCell(value) {
  return String(value == null ? '—' : value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

const durations = guide.performance.calls.map((call) => Number(call.durationMs || 0));
const cachedCalls = guide.performance.calls.filter((call) => call.cached).length;
const modes = {
  apartment: guide.places.filter((place) => place.discovery.apartment).length,
  corridor: guide.places.filter((place) => place.discovery.corridor).length,
  both: guide.places.filter((place) => place.discovery.apartment && place.discovery.corridor).length
};
const lodgingCategories = new Set(['hotel', 'cabin']);
const activityCategories = new Set(['tourism', 'thermal_baths', 'ski', 'trail', 'adventure']);
const exploreQuickCategories = new Set([
  'restaurant', 'coffee', 'fast_food', 'bakery', 'supermarket', 'convenience', 'hardware',
  'home_improvement', 'pharmacy', 'medical', 'veterinary', 'gas_station', 'bank', 'atm',
  'laundry', 'shopping', 'vehicle_service', 'emergency'
]);
const nonLodgingPlaces = guide.places.filter((place) => !lodgingCategories.has(place.category));
const lodgingExcluded = guide.places.filter((place) => lodgingCategories.has(place.category));
const explorePlaces = nonLodgingPlaces.filter((place) =>
  exploreQuickCategories.has(place.category) && place.routingEligible !== false && place.status !== 'candidate_coordinate'
);
const provisionPlaces = nonLodgingPlaces.filter((place) => !activityCategories.has(place.category));
const activityPlaceInventory = nonLodgingPlaces.filter((place) => activityCategories.has(place.category));
const publishedOfferings = guide.offerings.filter((offering) => offering.status === 'published');
const activityCatalogEntries = (guide.catalogEntries || []).filter((entry) => entry.catalog === 'activities');
const provisionCatalogEntries = (guide.catalogEntries || []).filter((entry) => entry.catalog === 'provisions');
const directActivityRoutes = publishedOfferings.filter((offering) => offering.routeUrl).length + activityCatalogEntries.filter((entry) => entry.routeAccess?.url).length;
const missingCategories = guide.categories.filter((category) => !category.count).map((category) => category.label);

const categoryRows = guide.categories.map((category) =>
  `| ${escapeCell(category.id)} | ${escapeCell(category.label)} | ${category.count} |`
).join('\n');
const providerRows = guide.providers.map((provider) =>
  `| ${escapeCell(provider.id)} | ${provider.enabled ? 'Sí' : 'No'} | ${escapeCell(provider.records ?? 0)} | ${stats.providerCounts[provider.id] || 0} | ${escapeCell(provider.reason || provider.note || '')} |`
).join('\n');
const placeRows = [...guide.places].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)).map((place) => {
  const providers = [...new Set(place.sources.map((source) => source.provider))].join(', ');
  const status = place.operatingStatus === 'closed' ? 'cerrado verificado' : place.status === 'candidate_coordinate' || place.coordinateKind === 'center_candidate' ? 'coordenada candidata' : 'publicado';
  return `| ${escapeCell(place.id)} | ${escapeCell(place.name)} | ${escapeCell(place.category)} | ${escapeCell(place.municipality)} | ${escapeCell(status)} | ${escapeCell(providers)} |`;
}).join('\n');

const report = `# Informe de cobertura de la guía territorial CordalSur

**Corte de datos:** ${guide.meta.generatedAt}<br>
**Estadía de referencia:** Condominio Andes Chillán<br>
**Cobertura:** ${guide.meta.coverage}

## Resumen ejecutivo

- **${stats.rawRecords} registros brutos** consolidados en **${stats.publishedPlaces} lugares publicables**.
- **${stats.duplicatesMerged} duplicados fusionados** mediante identificadores de proveedor, teléfono/sitio, nombre, categoría y proximidad.
- **${modes.apartment} lugares** dentro del radio automático del departamento y **${modes.corridor} lugares** dentro del corredor N-55; **${modes.both}** pertenecen a ambas geometrías.
- Los **${lodgingExcluded.length} alojamientos** (hotel/cabaña) se excluyen de Explora, Actividades y Comida/provisiones; permanecen en el inventario completo para trazabilidad.
- **Explora el Valle** usa un subconjunto inmediato de **${explorePlaces.length} servicios esenciales ruteables**. No mezcla panoramas ni fichas con coordenadas candidatas.
- **Comida y provisiones** publica **${provisionPlaces.length} lugares no turísticos** más **${provisionCatalogEntries.length} entradas investigadas** sin ubicación exacta: **${provisionPlaces.length + provisionCatalogEntries.length} fichas** en total.
- **Actividades** publica **${publishedOfferings.length} ofertas editoriales** más **${activityCatalogEntries.length} rutas investigadas**: **${publishedOfferings.length + activityCatalogEntries.length} fichas** en total. El inventario geográfico conserva además **${activityPlaceInventory.length} lugares de actividad** como evidencia territorial, sin convertirlos automáticamente en fichas duplicadas.
- Hay **${guide.catalogEntries.length} entradas investigadas** separadas de los lugares físicos y **${directActivityRoutes} accesos directos a rutas individuales** validados.
- **${guide.routes.length} rutas normalizadas** se mantienen separadas de la navegación vehicular; un enlace de sendero no implica que su inicio o estacionamiento estén verificados.
- **${stats.pisteFeaturesMovedToRoutes || 0} elementos de pista de ski** se trasladaron de la lista de establecimientos al modelo de rutas sin navegación vehicular.
- **${stats.candidateCoordinates} coordenadas candidatas** permanecen visibles con advertencia; no se presentan como entradas exactas.
- El radio del departamento es **${(guide.geometry.apartment.radiusMeters / 1000).toFixed(2)} km**, calculado por Haversine WGS84 hasta Restaurant Los Pincheira. La línea central N-55 mide **${(guide.geometry.corridor.centerlineLengthMeters / 1000).toFixed(2)} km** y usa un buffer de **${(guide.geometry.corridor.bufferMeters / 1000).toFixed(1)} km**.

## Estrategia de descubrimiento

1. Se obtuvo la geometría real de Ruta N-55 desde OpenStreetMap/Overpass y se conectó al departamento.
2. El círculo del departamento se dividió en **${guide.geometry.tiles.apartment.length} teselas** y el corredor en **${guide.geometry.tiles.corridor.length} teselas**.
3. Cada tesela se consulta por separado. Una respuesta saturada se subdivide hasta 1.250 m o hasta dejar de aportar lugares nuevos.
4. OpenStreetMap entrega la cobertura base. Google Places New (Nearby Search, Text Search y Place Details) y Tripadvisor Content API están implementados y sólo se activan con credenciales de servidor y condiciones de licencia compatibles.
5. El catálogo editorial agrega negocios conocidos que OSM omite. Cuando no existe una entrada verificable, se conserva un centro de localidad explícitamente marcado como candidato.
6. La sincronización usa caché de 30 días, reintentos, timeout, backoff exponencial, pausa entre llamadas a Overpass y salida atómica.

## Rendimiento de la sincronización

| Métrica | Resultado |
|---|---:|
| Llamadas de proveedor | ${stats.providerCalls} |
| Llamadas fallidas | ${stats.failedProviderCalls} |
| Respuestas desde caché | ${cachedCalls} |
| Duración mediana informada | ${percentile(durations, 0.5)} ms |
| Duración p95 informada | ${percentile(durations, 0.95)} ms |
| Teselas del departamento | ${guide.geometry.tiles.apartment.length} |
| Teselas del corredor | ${guide.geometry.tiles.corridor.length} |

## Cobertura por proveedor

“Registros descubiertos” cuenta respuestas antes de deduplicar. “Lugares publicados con fuente” cuenta entidades canónicas que conservan esa procedencia.

| Proveedor | Activo | Registros descubiertos | Lugares publicados con fuente | Nota |
|---|---:|---:|---:|---|
${providerRows}

## Cobertura por categoría

| ID canónico | Categoría | Lugares |
|---|---|---:|
${categoryRows}

Categorías sin un lugar verificable en el corte actual: **${missingCategories.join(', ') || 'ninguna'}**. La ausencia de resultados no demuestra que el servicio no exista; indica un vacío de evidencia pública trazable.

## Catálogos para huéspedes

| Superficie | Fuente | Fichas |
|---|---|---:|
| Explora el Valle | Servicios esenciales georreferenciados y ruteables | ${explorePlaces.length} |
| Actividades | Ofertas editoriales | ${publishedOfferings.length} |
| Actividades | Rutas investigadas sin ubicación vehicular inferida | ${activityCatalogEntries.length} |
| Actividades | **Total visible** | **${publishedOfferings.length + activityCatalogEntries.length}** |
| Comida y provisiones | Inventario geográfico no turístico | ${provisionPlaces.length} |
| Comida y provisiones | Directorio investigado sin coordenada confirmada | ${provisionCatalogEntries.length} |
| Comida y provisiones | **Total visible** | **${provisionPlaces.length + provisionCatalogEntries.length}** |

Estas superficies ya no son una partición del radio del departamento. Explora prioriza decisiones inmediatas y distancias confiables; los otros dos catálogos privilegian cobertura editorial. Una ficha sin ubicación confirmada permanece visible, pero no expone distancia, pin ni navegación. Los IDs se mantienen únicos dentro de cada catálogo.

## Calidad, seguridad y decisiones editoriales

- Cada lugar tiene navegación y apertura en Google Maps sin incluir la ubicación del huésped en el enlace externo.
- Instagram sólo se publica desde etiquetas de contacto OSM, una corrección manual verificada o investigación editorial con fuente trazable. En este corte hay **${guide.places.filter((place) => place.instagram).length} cuentas verificadas**.
- Los botones de ruta aceptan únicamente páginas de una ruta individual en SUDA, Trailforks, Wikiloc o Andeshandbook; no se presentan páginas regionales ni búsquedas como si fueran un recorrido concreto.
- Las valoraciones, cuando existan, muestran proveedor, cantidad de reseñas, URL de origen y fecha de consulta. No se trasladan valoraciones editoriales a campos de Google o Tripadvisor.
- Bike Park Nevados está marcado cerrado según su [página oficial](https://www.nevadosdechillan.com/bike-park), cuyo último día de temporada fue el 5 de abril de 2026.
- La Reserva Nacional Ñuble está cerrada preventivamente desde el 1 de junio de 2026 y hasta nuevo aviso, según [CONAF](https://www.conaf.cl/reserva-nuble-inicia-cierre-preventivo-de-invierno/).
- SERNAGEOMIN mantiene alerta técnica amarilla para Nevados de Chillán y una zona de potencial peligro de 1 km alrededor del cráter Nicanor; se debe revisar el [estado oficial](https://www.sernageomin.cl/alertas-volcanicas/) antes de actividades de montaña.
- Las rutas naturales sin inicio público, estacionamiento o derecho de paso verificado no ofrecen navegación vehicular. Se conservan como fichas informativas con advertencia.
- La Posta de Salud Rural Recinto está confirmada por MINSAL, pero no hay horario ni teléfono directo publicable. No se presenta como urgencia 24/7.
- 132 y 133 se identifican como números nacionales de emergencia, no como líneas directas de cuarteles locales.

## Limitaciones

${guide.meta.limitations.map((item) => `- ${item}`).join('\n')}
- Google Places no se ejecutó en este corte porque no había credencial de servidor disponible; por ello no se publican ratings Google.
- Tripadvisor no se ejecutó porque no había credencial ni aprobación explícita para combinar su contenido; no se realizó scraping.
- Los negocios rurales sin presencia digital reciente siguen dependiendo de verificación telefónica o visita local.
- El mapa interactivo usa teselas OpenStreetMap, geometría N-55 y agrupación local de marcadores. No reemplaza una aplicación de navegación vial ni confirma servidumbres de acceso.

## Inventario completo publicado

| ID | Nombre | Categoría | Comuna/localidad | Estado de evidencia | Proveedores |
|---|---|---|---|---|---|
${placeRows}

## Artefactos y reproducibilidad

- Geometría: \`01-landing-page-cordal-sur-andes-chillan/data/destination-geometry.json\`
- Catálogo: \`01-landing-page-cordal-sur-andes-chillan/data/destination-guide.json\`
- Métricas: \`.research/20260717-destination-guide/discovery-metrics.json\`
- Auditoría de fusiones: \`.research/20260717-destination-guide/merge-audit.json\`
- Evidencia investigada: \`.research/20260717-destination-guide/child_outputs/\`
- Esquema: \`scripts/destination/destination-guide.schema.json\`

Regenerar con \`npm run sync:geometry\`, \`npm run sync:destination\` y \`npm run report:destination\`.
`;

for (const output of [REPORT_PATH, RESEARCH_REPORT_PATH]) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp`;
  fs.writeFileSync(temporary, report);
  fs.renameSync(temporary, output);
}
console.log(`Wrote ${path.relative(ROOT, REPORT_PATH)}`);
console.log(`Wrote ${path.relative(ROOT, RESEARCH_REPORT_PATH)}`);
