# CordalSur

Guía privada multilingüe (ES/PT/EN) para huéspedes en Las Trancas · Nevados de Chillán. La interfaz se publica como HTML/CSS/JavaScript estático en GitHub Pages; el calendario, las sesiones y las claves se centralizan en Cloudflare Worker + D1.

> **¿Querés entender el proyecto desde cero?** Lee [`FUNDAMENTOS.md`](FUNDAMENTOS.md). Cubre el "por qué" de cada decisión técnica, el sistema de diseño, y cómo migrar esta carpeta a otro lugar.

## Quick start (regenerate everything)

```bash
# 1. Apply host-provided data to lang.js + regenerate @LISTINGS blocks
node scripts/apply-host-data.mjs . data/host-data.json

# 2. Serve the folder over HTTP for local UI work
python3 -m http.server 8765 --bind 127.0.0.1

# 3. Run the complete read-only checks
bash tests/verify-gates.sh
npm --prefix worker test
```

For the filter bar (restaurantes.html / actividades.html) to work, the browser must support `defer` scripts — all modern browsers do.

## Ubicación y mapas

`cerca-de-mi.html`, `restaurantes.html` y `actividades.html` comparten
`js/location-controller.js`. Las coordenadas permanecen sólo en memoria: la
lista se ordena primero con distancia geodésica local y cada resultado se
reemplaza por distancia vial cuando la red privada tiene cobertura. Un fallo
del GPS, del Worker o de OpenStreetMap conserva la lista y permite reintentar o
marcar un punto manual que se elimina al salir.

La red vial `data/driving-network.json` se calcula desde OpenStreetMap y se
resuelve íntegramente en el navegador, sin enviar la posición a un router
externo. El perfil v2 respeta sentidos y restricciones de automóvil, evita
caminos intransitables y penaliza huellas, estacionamientos y accesos de
servicio. Las fichas georreferenciadas distinguen distancia vial, línea recta e
inicio de sendero. Una ficha sin pin confiable conserva su información
editorial, pero no inventa una distancia ni ofrece navegación.

**Explora el Valle** muestra sólo necesidades rápidas y georreferenciadas del
trayecto: comida, combustible, farmacia, salud, supermercado, cajero y otros
servicios. **Actividades** y **Comida y provisiones** son directorios amplios y
mantienen fichas aunque no exista una coordenada confirmada. Los perfiles de
Instagram y accesos directos a rutas SUDA/Trailforks verificados se versionan en
`data/researched-catalog.json`; una ruta digital se mantiene separada de la
navegación vehicular.

La evidencia, los perfiles descartados y la limitación de Strava quedan en el
[informe de investigación](docs/reports/catalog-research-2026-07-19.md).

Para regenerar catálogo, red y reporte:

```sh
npm run sync:destination
npm run sync:driving
npm run report:destination
npm test
```

Si la topología vial ya está vigente y sólo cambiaron fichas o accesos,
`npm run sync:distances` vuelve a enlazar y medir todos los destinos sobre el
grafo validado sin descargar otra vez OpenStreetMap.

`sync:driving` falla sin sobrescribir el artefacto sano si Overpass entrega una
respuesta parcial, cae bajo los pisos de cobertura o pierde más del 25% del
grafo anterior. La guía y la red publican el mismo hash para impedir mezclas de
caché entre versiones.

La suite opcional de navegador requiere Playwright y un servidor local activo:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
CORDALSUR_TEST_URL=http://127.0.0.1:4173 \
CORDALSUR_ACCESS_PIN='<guest-pin>' \
  node tests/playwright-location-smoke.mjs
```

Recorre Chromium y WebKit con GPS emulado, ES/PT/EN, tres tamaños, permiso
denegado, punto manual, teselas fallidas, Worker bloqueado y verificación de que
las coordenadas exactas no aparezcan en almacenamiento, URLs, solicitudes ni
consola.

## Project structure

```
project-root/
├── README.md                    ← this file
├── index.html                   ← home / hub
├── admin.html                   ← private stay calendar administration
├── check-in.html
├── check-out.html
├── actividades.html
├── clima.html
├── tickets.html
├── instrucciones.html
├── restaurantes.html             ← Comida y provisiones
│
├── css/
│   ├── styles.css               ← single stylesheet, all design tokens here
│   ├── access.css               ← guest gate + Administration UI
│   └── bg/                       ← per-page background photos (CC0/Unsplash)
│
├── js/
│   ├── lang.js                  ← i18n (ES/PT/EN), all keys live here
│   ├── access.js                ← guest/admin session gate
│   ├── admin.js                 ← stay calendar UI
│   ├── whatsapp.js              ← localized check-in message
│   ├── restaurants.js            ← filter bar for restaurantes.html
│   └── activities.js             ← filter bar for actividades.html
│
├── scripts/
│   ├── apply-host-data.mjs       ← propagates data/host-data.json → lang.js + HTML
│   └── destination/              ← discovery, deduplication and local road graph generator
├── assets/brand/                ← CordalSur symbol copied into the project
├── worker/                      ← Cloudflare Worker, D1 migration and tests
│
├── data/
│   ├── host-data.json            ← live data (the "truth" the script reads)
│   ├── host-data.sample.json     ← fake data for dry-runs
│   ├── destination-guide.json    ← normalized places and routing eligibility
│   ├── driving-network.json      ← versioned local OSM road graph
│   └── .baseline/                ← synchronized snapshot of 15 canonical files
│       ├── index.html
│       ├── check-in.html
│       ├── check-out.html
│       ├── botiquin.html
│       ├── buggy.html
│       ├── actividades.html
│       ├── clima.html
│       ├── tickets.html
│       ├── instrucciones.html
│       ├── restaurantes.html
│       ├── staff/README.md
│       ├── js/lang.js
│       ├── js/restaurants.js
│       ├── js/activities.js
│       └── css-styles.css         ← (renamed from css/styles.css to keep flat)
│       # Four legacy aliases are also checked for compatibility.
│
├── docs/                         ← design constitution + architecture notes
│   ├── DESIGN.md                 ← color tokens, typography, grid (the visual contract)
│   ├── GRAPHIFY_MAESTRO.md       ← module-by-module architecture map
│   ├── CHANGELOG.md              ← what's in each version
│   ├── PROMPT_CASCO_HTML.md      ← the one-shot prompt that generated the casco
│
└── tests/
    └── verify-gates.sh          ← runs all 5 no-regression gates
```

## Canonical sources

`data/host-data.json` is the source of truth for visible copy, titles, public WhatsApp/Instagram support and listings. `apply-host-data.mjs` propagates it into the ten public pages and runtime JavaScript without language fallback.

| File | Purpose |
|---|---|
| `index.html` | Home / hub |
| `check-in.html` | Arrival instructions |
| `check-out.html` | Departure instructions |
| `botiquin.html` | First-aid kit / emergency supply |
| `buggy.html` | Ski buggy coordination |
| `actividades.html` | Activities (filtros: Todos/Nieve/Termas/Senderos/Bici/Aventura/Servicios) |
| `clima.html` | Weather widget |
| `tickets.html` | Ski tickets |
| `instrucciones.html` | Apartment manual |
| `restaurantes.html` | Comida y provisiones (filtros: Todos/Restaurantes/Café/...) |
| `css/styles.css` | All design tokens + component styles |
| `js/lang.js` | Generated runtime dictionary for ES/PT/EN |
| `js/restaurants.js` | Filter bar for restaurantes.html |
| `js/activities.js` | Filter bar for actividades.html |

Access secrets never belong in this repository. Only digests are stored as Cloudflare Worker secrets; guest/admin PIN placeholders remain neutral in published source.

An authenticated administrator can use **Ingresar a la plataforma** from the
dashboard. The public gate validates that same administrator token with the
Worker and grants access even when there is no active guest stay. The token
remains in `sessionStorage`, so navigation must continue in the same tab and
still expires after 30 minutes.

## Acceso sincronizado con Operaciones

El Worker consulta en servidor la misma fuente operacional que usa CordalSur
Control. Cada arriendo no cancelado habilita la clave predeterminada desde las
15:00 del día anterior al check-in hasta las 12:00 del check-out, siempre en
`America/Santiago`.

Las ventanas superpuestas se fusionan: si una persona sale el mismo día que
llega la siguiente, la guía permanece disponible sin un bloqueo intermedio. La
sincronización ocurre cada cinco minutos, pero las horas guardadas son exactas.
Si la fuente falla o entrega datos inválidos, D1 conserva el último calendario
válido. El Worker solicita solo identificador técnico, fechas y estado; nunca
copia nombres, referencias, notas ni información financiera.

Las estadías creadas desde Administración siguen funcionando como excepciones
manuales. La política, recuperación y despliegue están documentados en
[`worker/README.md`](worker/README.md).

## How the filter bar works

1. The script `apply-host-data.mjs` emits a `<script type="application/json" id="restaurants-data">…</script>` block inside the `@LISTINGS` region of `restaurantes.html`. Same for `actividades.html` with `#activities-data`.
2. The corresponding `js/restaurants.js` (or `js/activities.js`) reads the JSON, builds the filter buttons + cards, and wires the show/hide logic.
3. The cards themselves are also server-rendered (in the `@LISTINGS` block) so the page is still usable without JS — the filter bar is progressive enhancement.

## How to update host-provided data

Edit `data/host-data.json` directly. The fields are documented by example; see the `restaurants[]` and `activities[]` arrays for the schema. Then run `node scripts/apply-host-data.mjs . data/host-data.json`.

The script will:
- Update scalar i18n keys in `js/lang.js` from `data/host-data.json#scalar`
- Update the per-listing text fields in `js/lang.js` from `data/host-data.json#restaurants` and `#activities`
- Replace the `<script type="application/json">…</script>` block with the new data
- Replace the cards inside `@LISTINGS` with re-rendered ones

## How to add a new restaurant

1. Add an object to `restaurants[]` in `data/host-data.json`. See the existing entries for the schema (id, name, status, categories[], tags[], googleMapsUrl, instagramUrl, etc.).
2. Set `status: "publicar"` to make it visible, or `"validar"` / `"no_publicar"` to keep it hidden.
3. Run `node scripts/apply-host-data.mjs . data/host-data.json`.
4. Run `bash tests/verify-gates.sh` to confirm no regressions.

## How to add a new i18n string

1. Edit `data/host-data.json#scalar`. Add a key like `"rest.intro": { "es": "...", "pt": "...", "en": "..." }`.
2. Run `node scripts/apply-host-data.mjs . data/host-data.json` — the script writes the key into `js/lang.js` automatically.
3. Use it in HTML with `data-i18n="rest.intro"`.

## No-regression gates

`bash tests/verify-gates.sh` runs five checks:

- **Gate 1:** sintaxis JavaScript.
- **Gate 2:** paridad y cobertura completa de 1.758 claves ES/PT/EN.
- **Gate 3:** contrato público de marca, títulos, Emergencias y WhatsApp.
- **Gate 4:** idempotencia del generador en una copia temporal.
- **Gate 5:** paridad byte a byte entre fuentes canónicas, snapshots y aliases.

All five must complete successfully.

## Design philosophy

- La interfaz no usa frameworks ni build pipeline; necesita HTTP porque valida sesiones contra el Worker.
- Spanish (es) is the primary language. Portuguese (pt) and English (en) are full translations.
- Global interface copy lives in `data/host-data.json#scalar`; listing-specific copy lives in the localized restaurant/activity records. The generator materializes both into `js/lang.js`. Spanish HTML copy is a progressive fallback; `data-i18n*` attributes replace it before the localized interface is released.
- The `staff/` directory is a stub for a future staff operations module — it lives inside the baseline because the `staff/README.md` is part of the canonical snapshot, but no other staff functionality is built yet.

## What is NOT in this folder

- Runtime state (`ruvector.db`, `agentdb.rvf`, `*.rvf.lock`).
- Backup files (`*.backup-v2`, `*.backup-v3`).
- Old prototypes (`cafe.html`, `emergencias.html`, `graphify.html`).
- Design iteration logs (`artifacts/`, `graphify-out/`).
- El historial de prototipos que vivía fuera de este repositorio (hooks, agent state, etc.).

La guía de despliegue y rotación de secretos está en [`worker/README.md`](worker/README.md).
