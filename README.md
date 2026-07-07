# Landing Page Andes Chillán

A static, multilingual (ES/PT/EN) landing page for the Las Trancas Airbnb guest hub. No build framework, no npm, no backend. Just HTML, CSS, vanilla JS, and a single Node script to propagate host-provided data.

> **¿Querés entender el proyecto desde cero?** Lee [`FUNDAMENTOS.md`](FUNDAMENTOS.md). Cubre el "por qué" de cada decisión técnica, el sistema de diseño, y cómo migrar esta carpeta a otro lugar.

## Quick start (regenerate everything)

```bash
# 1. Apply host-provided data to lang.js + regenerate @LISTINGS blocks
node scripts/apply-host-data.mjs . data/host-data.json

# 2. Open index.html in a browser
# (works file:// directly, no server needed)
```

For the filter bar (restaurantes.html / actividades.html) to work, the browser must support `defer` scripts — all modern browsers do.

## Project structure

```
landingpage/
├── README.md                    ← this file
├── index.html                   ← home / hub
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
│   └── bg/                       ← per-page background photos (CC0/Unsplash)
│
├── js/
│   ├── lang.js                  ← i18n (ES/PT/EN), all keys live here
│   ├── restaurants.js            ← filter bar for restaurantes.html
│   └── activities.js             ← filter bar for actividades.html
│
├── scripts/
│   └── apply-host-data.mjs       ← propagates data/host-data.json → lang.js + HTML
│
├── data/
│   ├── host-data.json            ← live data (the "truth" the script reads)
│   ├── host-data.sample.json     ← fake data for dry-runs
│   └── .baseline/                ← frozen snapshot of canonical files (12 files)
│       ├── index.html
│       ├── check-in.html
│       ├── check-out.html
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
│
├── docs/                         ← design constitution + catastro source
│   ├── DESIGN.md                 ← color tokens, typography, grid (the visual contract)
│   ├── GRAPHIFY_MAESTRO.md       ← module-by-module architecture map
│   ├── CHANGELOG.md              ← what's in each version
│   ├── PROMPT_CASCO_HTML.md      ← the one-shot prompt that generated the casco
│   └── catastro/                 ← catastro source (markdown tables)
│
└── tests/
    └── verify-gates.sh          ← runs all 3 no-regression gates
```

## Canonical files (12)

`apply-host-data.mjs` regenerates these from `data/host-data.json`:

| File | Purpose |
|---|---|
| `index.html` | Home / hub |
| `check-in.html` | Arrival instructions |
| `check-out.html` | Departure instructions |
| `actividades.html` | Activities (filtros: Todos/Nieve/Termas/Senderos/Bici/Aventura/Servicios) |
| `clima.html` | Weather widget |
| `tickets.html` | Ski tickets |
| `instrucciones.html` | Apartment manual |
| `restaurantes.html` | Comida y provisiones (filtros: Todos/Restaurantes/Café/...) |
| `css/styles.css` | All design tokens + component styles |
| `js/lang.js` | i18n ES/PT/EN (single source of truth for all translatable strings) |
| `js/restaurants.js` | Filter bar for restaurantes.html |
| `js/activities.js` | Filter bar for actividades.html |

Everything outside this list is **not** canonical — it's a design artifact, a backup, or runtime state.

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

`bash tests/verify-gates.sh` runs three checks:

- **Gate 1 (snapshot drift):** All 12 canonical files must match `.baseline/`.
- **Gate 2 (prototype leak):** No forbidden names (Tienda Café, Stripe, etc.) in the HTML or lang.js.
- **Gate 3 (real http hrefs):** All real URLs are in the exemption list (Google Maps, Instagram, etc.).

All three must return 0 hits.

## Design philosophy

- No frameworks, no build pipeline, no npm install. Just plain HTML/CSS/JS that runs in any browser via `file://`.
- Spanish (es) is the primary language. Portuguese (pt) and English (en) are full translations.
- Every translatable string lives in `data/host-data.json#scalar` and gets propagated to `js/lang.js` by the script. No hardcoded strings in HTML.
- The `staff/` directory is a stub for a future staff operations module — it lives inside the baseline because the `staff/README.md` is part of the canonical snapshot, but no other staff functionality is built yet.

## What is NOT in this folder

- Runtime state (`ruvector.db`, `agentdb.rvf`, `*.rvf.lock`).
- Backup files (`*.backup-v2`, `*.backup-v3`).
- Old prototypes (`cafe.html`, `emergencias.html`, `graphify.html`).
- Design iteration logs (`artifacts/`, `graphify-out/`).
- The messy history that lived in the parent `GuestHub/` directory (hooks, agent state, etc.).

If you need to recover any of those, they're in the original `GuestHub/` directory.
