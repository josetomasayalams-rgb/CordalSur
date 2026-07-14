# Changelog — CordalSur Casco

All notable changes to the CordalSur canonical files (HTML, CSS, JS in `*.html`, `css/styles.css`, `js/lang.js`, `js/restaurants.js`, `staff/README.md`).

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/), trimmed to the project's needs.

## [Unreleased] — Landing invernal: fondos rotativos + Liquid Glass

Orientación visual del home hacia invierno/otoño, con fondos reales de Chillán/Nevados y recuadros tipo Liquid Glass.

### Added
- `css/bg/winter/`: 15 fondos procesados en pares JPG/WebP a 2400×1600.
- `js/backgrounds.js`: rotador ES5 para el home, con dos capas, crossfade de 1200ms, cambio cada 10s, preload de la siguiente imagen y pausa con `prefers-reduced-motion`.
- `index.html`: preload del primer fondo invernal, `data-bg-rotator="winter-home"` y carga de `js/backgrounds.js`.

### Changed
- `css/styles.css`: fondos internos apuntan a `css/bg/winter/*`; home usa carrusel invernal y cards scoped con material Liquid Glass (`backdrop-filter`, borde luminoso, brillo interno y fallback sin blur).
- Home visual: más nieve/ice, menos cobre, manteniendo contraste sobre fotos reales.
- Liquid Glass extendido a todas las secciones guest-facing: cards, quick contact, enlaces externos, clima, acordeones, filtros, módulos, restaurantes y fichas compactas. Los catálogos densos usan una mezcla más opaca para preservar lectura.

### Test final
- `node -c js/backgrounds.js`
- Assets `css/bg/winter/*.{jpg,webp}` verificados en 2400×1600.
- QA visual con Chrome/Playwright en 390/600/900px: 2 capas de rotador, 1 activa, 0 overflow, 0 console errors.
- `prefers-reduced-motion: reduce` verificado: el fondo queda fijo.
- Gates limpios tras re-freeze de baseline CSS.

## [Unreleased] — Catálogo v3.3: Top section Hero + Grid + Google Maps link

Rediseño completo del Top section (Hero + Grid en vez de lista vertical plana) y link Google Maps en cada actividad con ubicación útil.

### Added
- **Top section Hero + Grid (responsive)**:
  - **Hero card** (1, Prioridad 1) destacada con borde copper, badge "★ TOP 1" amarillo en top-left, fondo con gradiente sutil verde/copper, padding amplio, meta + tech + details + CTAs visibles.
  - **Grid** (9 cards, Prioridad 2-3) simplificadas: icono + nombre + subcat + stars + copy corta + CTA + Maps link. Sin meta, sin tech, sin details (estos siguen disponibles en cada módulo).
  - Layout responsive: 1 col mobile → 2 col tablet (≥480px) → 3 col desktop (≥720px). En desktop, grid cards usan layout vertical (icono centered, name + subcat centrados) para caber en 177px de ancho.
  - Header del Top: h2 + subtítulo "Curado por el host. Empieza por aquí." (chrome key `act.top.sub`).
- **Google Maps link por actividad**:
  - Nuevo campo `google_maps_url` en cada `activities[]` de `host-data.json`. Auto-generado por `getGoogleMapsUrl()`: prioriza `mapa.fallback_url` con google.com/maps; sino genera `https://www.google.com/maps/search/?api=1&query=<encoded nombre+zona>`. 53/53 activities tienen URL.
  - CTA secundario en cada card: `.cta-maps` con icono 📍 + texto "Cómo llegar" (chrome key `act.maps.label` / `act.maps.aria`).
  - `target="_blank" rel="noopener"` para abrir Maps en nueva pestaña.
- **Hero id parametrizable**: constante `HERO_ID = 'term-parque-agua'` en apply-host-data.mjs (fácil de cambiar).

### Changed
- `host-data.json`: 53 entries con `google_maps_url` agregado. Auto-generado, no requiere edición manual.
- `scripts/build-host-data-v3.mjs`: nueva función `getGoogleMapsUrl()` con lógica de prioridad (fallback > auto-gen). Filtra zonas inútiles ("por confirmar", "n/a", etc.).
- `scripts/apply-host-data.mjs`: top section split en `top-hero` (1 card) + `grid-top` (9 cards). Render de `.cta-maps` en CTAs row de cada card (después de primary, antes de fallback).
- `css/styles.css` (~150 líneas nuevas): `.top-header`, `.top-subtitle`, `.top-hero`, `.hero-badge` (gradiente amarillo), `.ficha-card--hero` (border copper + shadow + padding amplio), responsive grid (1/2/3 cols), `.cta-maps` (tinte ice + hover), grid card variant para desktop vertical.
- `lang.js`: 5 chrome keys × 3 langs = 15 keys nuevas (`act.top.t/sub/badge`, `act.maps.label/aria`).
- `.baseline/BASELINE.md`: SHA-256 re-frozen para css + lang + actividades.

### Pendientes (para el host)
- Validar manualmente que el link Maps lleva al lugar correcto para los 53 IDs. Las 6 con URL explícita (atr-rucapiren, atr-diguillin, atr-garganta-diablo, atr-gruta-pangues, atr-mirador-regalo, mtb-pumptrack) usan el fallback del catastro MD. Las otras 47 son auto-generadas desde `nombre + zona`.

### Test final
- 3 viewports (390, 600, 900): 1 hero + 9 grid + 53 cta-maps, 0 overflow, 0 console errors
- Idempotencia OK
- 3 gates limpios
- Visualmente: hero destaca, grid scannable, cada card tiene Maps link con icono 📍

## [v3.2] — Catálogo v3.1: fixes P1-P3 del análisis post-entrega

Tras análisis post-entrega del catálogo v3, se detectaron y corrigieron 7 issues (3 P1 críticos, 3 P2 importantes, 1 P3 accesibilidad).

### Fixed (P1 — críticos)
- **CTAs rotos al cambiar idioma** — 28 cards tenían `data-i18n="<id>.cta_label"` pero solo 21 keys existían en lang.js. Cuando lang.js hacía lookup() y no encontraba la key, devolvía la key literal como texto visible ("term-parque-agua.cta_label"). Fix: cuando no hay `mapa.cta_label` específica, usar chrome key `act.cta.<cta_key>` (siempre existe). Resultado: 0 CTAs rotos tras switch EN.
- **Rutas MTB no verificadas ahora visibles** — El MD pide cards para mtb-grunidor, mtb-otonal, mtb-garganta, mtb-enlace-garganta. Antes estaban con `visible: false`. Ahora son visibles con: (a) flag `data-validacion="local"`, (b) clase `.ficha-card--validacion` con borde dashed + bg amber suave, (c) badge `mapa-badge--validacion` (3er color), (d) prioridad 99 (al final del módulo bici). El host puede seguir ocultándolas cambiando `visible: false` si prefiere.
- **Campos outdoor visibles** — Faltaba exponer `mapa_provider`, `mapa_estado`, `requiere_login`, `ruta_tipo`, `seguridad_minima` como datos estructurados. Fix: agregada **fila técnica compacta** visible: "Mapa: Trailforks · Estado: verificado · Tipo: singletrack · Login: no". 22 cards con fila técnica. `seguridad_minima` ahora es campo distinto de `notas_seguridad` (uno es técnico outdoor, otro es promocional).

### Added (P2 — importantes)
- **5ª dimensión de filtro: perfil (multi-OR)** — El MD pide perfil_huesped. Implementado como multi-OR: 9 chips (familias, parejas, niños, deportistas, riders, aventura, descanso, naturaleza, fotos). Click en uno lo activa, click en otro lo añade al set OR. Persistencia localStorage. JS-driven (CSS `:not()` no puede expresar UNION). Fix: `applyPerfilMultiOr()` itera cards y toggle `.ficha-card--hidden-perfil` según si `data-perfil` contiene alguno de los valores activos.
- **Disclaimer con texto español real como fallback** — Antes `[disclaimer]` (placeholder feo si lang.js no carga). Ahora: "Precios, horarios y disponibilidad pueden cambiar por clima, temporada y operación. Verifica siempre en la fuente oficial antes de salir."
- **Top recomendado** — Decisión editorial documentada: el top de `actividades.html` contiene SOLO actividades (no rest-sitari/rest-bagual como sugiere el MD). Los restaurantes tienen su propia página (`restaurantes.html`). El MD mezcla tipos en su "Top" pero eso rompe la separación visual "qué hacer" vs "dónde comer" que pide el punto #5 del propio MD.

### Fixed (P3 — accesibilidad)
- **Viewport zoom desbloqueado** — `maximum-scale=1.0, user-scalable=no` removido de 8 HTML canónicos (actividades, check-in, check-out, clima, index, instrucciones, restaurantes, tickets). Permite zoom al huésped con baja visión. Prototipos no canónicos (cafe.html, emergencias.html) no se tocaron.

### Changed
- **host-data.json**: 4 actividades marcadas con `validacion_local: true` derivado de `mapa.estado === "requiere_verificacion_local"`. 22 actividades con `ruta.seguridad_minima` y `ruta.requiere_login`. `restaurants_preserved: 33` (un local nuevo en el catastro v5).
- **apply-host-data.mjs**: 3er badge mapa (`mapa-badge--validacion`), clase `.ficha-card--validacion`, `data-validacion="local"`, fila técnica outdoor visible (`ficha-tech`), `seguridad_tecnica` field en details.
- **lang.js**: ~40 chrome keys × 3 langs añadidos (`act.mapa.validacion`, `act.tech.{mapa,estado,tipo,login}`, `act.field.seguridad_tecnica`, `act.filter.perfil`, `act.perfil.{familias,parejas,ninos,deportistas,riders,aventura,descanso,naturaleza,fotos}`).
- **js/actividades.js**: `FILTER_DIMS` ampliado a 5 (+perfil). Click handler区分 single-select vs multi-OR. `applyPerfilMultiOr()` nueva función.
- **css/styles.css**: ~80 líneas nuevas (`mapa-badge--validacion`, `ficha-card--validacion`, `ficha-tech` + `.tech-item/.tech-label/.tech-val/.tech-sep`, `.ficha-card--hidden-perfil`). Meta row permite wrap (bug overflow).
- **AGENTS.md**: gate 3 exenciones actualizadas (sin cambios respecto a v3).

### Test final (Playwright mobile 390px)
- 53 cards visibles (49 + 4 validación local)
- 4 `ficha-card--validacion` + 4 `mapa-badge--validacion`
- 22 `ficha-tech` rows outdoor
- 5 filter groups (temporada, dificultad, zona, subcategoria, perfil)
- 9 perfil chips + 11 subcat chips
- 0 broken CTAs tras switch ES→EN→ES
- 0 overflow horizontal
- 0 console errors

## [v3] — Catálogo v3: reestructuración con 6 módulos + outdoor subcategorías

Reestructuración completa del catálogo de actividades. Dataset extendido con 22 rutas outdoor priorizadas (Trailforks, Wikiloc, PTI, Trancas.cl) y schema enriquecido. Decisiones UX confirmadas: card compacta+expandible, CTA primario+fallback, mapa badges color-coded, 4ª dimensión de filtro (subcategoría outdoor), restaurantes.html sin cambios estructurales.

### Added
- **6 módulos consolidados** (vs 7 previos): `nieve`, `termas`, `senderos`, `bici`, `aventura`, `servicios`. Reemplazan `act`/`termas`/`nieve`/`mtb`/`atractivos`/`bienestar`/`servicios`. Top section (10 cards curadas) preservada.
- **11 nuevas actividades**: atr-diguillin, atr-laguna-huemul-shangrila, atr-ruta-caballos, mtb-palo-huacho, mtb-cerro-oculto, mtb-pumptrack, mtb-shangrilazo + 4 ocultas (mtb-grunidor, mtb-otonal, mtb-garganta, mtb-enlace-garganta con `visible: false` por `requiere_verificacion_local`). Total: 53 actividades, 49 visibles, 4 ocultas.
- **Campo `mapa{}`** por entrada: `provider`, `estado` (verificado_publico | pendiente_strava | requiere_verificacion_local), `primario_url`, `fallback_url`, `cta_label`. 21 cards con mapa badge (11 verificadas 🟢 + 10 pendientes 🟡).
- **Campo `ruta{}`** para outdoor: `distancia_km`, `desnivel_m`, `ruta_tipo`, `acceso_inicio`. Meta row visible: "11.7 km · ↑ 802 m · alta · invierno".
- **Campo `subcategoria_key`** (11 outdoor subcats): trekking_facil/intermedio/exigente, cascadas_y_agua, geotermia, miradores, mtb_trancas/shangrila/bike_park, pumptrack, ruta_con_guia.
- **4ª dimensión de filtro**: 11 chips en filter bar + CSS rules + persistencia localStorage. Cuando se activa, oculta cards sin subcat Y cards no-matching.
- **Card compacta+expandible** (`.ficha-compact`): visible por defecto — header + copy + meta row + CTAs. `<details>` colapsable con: acceso, zona, edad, horario, reserva, CLP, contacto, seguridad, fuente+fecha.
- **CTAs duales**: `.cta-primary` (botón grande deep-blue) + `.cta-fallback` (link texto "Maps alternativa →"). 49 cta-primary, 19 con fallback.
- **Campos `fuente` + `fecha_verificacion`** para trazabilidad (auditabilidad del dato).
- **CSS v3** (~200 líneas): `.ficha-compact`, `.mapa-badge` + `--verificado`/`--pendiente`, `.ficha-meta` + `.meta-item`/`.meta-sep`, `.cta-primary`/`.cta-fallback`, `.ficha-details` + `<summary>` limpio sin chrome browser, `.ficha-source`, 11 filter rules para subcategoria.
- **lang.js chrome keys** (~25 × 3 langs): `act.module.{senderos,bici,aventura}`, `act.mapa.{verificado,pendiente}`, `act.filter.subcategoria`, `act.subcat.{11 outdoor}`, `act.field.{acceso,horario,reserva,precio,contacto,fuente}`, `act.cta.{detalles,fallback}`.
- **L10N_FIELDS** ampliado de 14 → 16 (+`acceso_inicio`, +`cta_label`).
- **AGENTS.md gate 3 exenciones**: wikiloc.com, trailforks.com, andeshandbook.org, wikiexplora.com, tripadvisor.es, backchillan.com (map providers outdoor v3).
- **`scripts/build-host-data-v3.mjs`**: mergea `/tmp/catastro-with-translations.json` (42 acts) + `/tmp/catastro-v3-extensions.json` (11 nuevas + extensiones de campo) → `host-data.json` con activities[] poblado.

### Changed
- **`apply-host-data.mjs` fichaCard()** reescrita: 3 variantes implícitas por tipo (ruta outdoor, producto operado, servicio). Meta row compacta reemplaza los 6 fields visibles previos. `<details>` para detalles.
- **`moduleOrder`**: 6 módulos nuevos (nieve, termas, senderos, bici, aventura, servicios).
- **`moduleSecure`**: nieve + senderos (callout de seguridad arriba).
- **Filter visible:false**: activities con `visible === false` se skipan en loop de lang.js y en @LISTINGS HTML.
- **`actividades.html` filter-bar**: añadido 4º `.filter-group--subcat` con 11 chips outdoor. Grupos ahora 4 (vs 3).
- **`js/actividades.js`**: `FILTER_DIMS` ampliado a 4 (añadido `subcategoria`).

### Decisión de diseño
- **Rutas `requiere_verificacion_local`** (mtb-grunidor, otonal, garganta, enlace-garganta) se mantienen en `host-data.json` con `visible: false`. El host puede activarlas cuando valide con Club Deportivo / Renegado Bikes. Pendiente documentado en `BASELINE.md`.
- **Mapa badges** son informativos, no alarmistas. Green = "ruta verificada", amber = "en validación". Reducen expectativa sin asustar al huésped.
- **Subcategoria filter**: cuando activo, oculta cards sin subcat (servicios/restaurantes). UX más predecible: "filtrar por trekking_exigente muestra SOLO trekking exigente, no también rentals".

## [v2] — Sección Restaurantes: action links + sin selector de precios (v4)

Honra el feedback del usuario: "estén en listado, sacarle el selector de precios y que haya acceso directo a dirección de Google Maps y al Instagram de forma estética y con hipervínculo."

### Changed
- **`fichaCard()`** ya no renderiza la fila de CLP / `precio_referencia` — 4 fields en `ficha-fields` (Zona, Temporada, Duración, Edad). El `precio_referencia` se removió de `L10N_FIELDS` → 96 keys menos inyectadas en `lang.js` (32 items × 3 langs).
- **Nuevo bloque `<div class="ficha-links">`** después de `copy_card` con hasta 3 `<a class="ficha-link">`:
  - `--maps` (siempre si `googleMapsUrl`): texto "Cómo llegar" + `zona` como detail visible. Hipervínculo real `<a href="googleMapsUrl">` con `target="_blank" rel="noopener"`.
  - `--ig` (si `instagramUrl`): texto "Instagram" + `@handle` como detail. Hipervínculo real `<a href="instagramUrl">`.
  - `--web` (si `link_oficial`): texto "Sitio oficial" sin detail. Hipervínculo real `<a href="link_oficial">`.
- **CSS extendido** (~50 líneas): `.ficha-links` (flex column, gap 6px), `.ficha-link` (chip con padding 10×14, radius-md, background tint-ice, hover translateX 2px), `.ficha-link--maps/--ig/--web::before` con 📍/📷/🔗. `.ficha-link__detail` (margin-left auto, text-align right, ellipsis, max-width 60%).

### Added
- **`host-data.json`**: 32 locales del catastro (23 publicar + 8 validar + 1 no_publicar). Cada local con `googleMapsUrl` (32 con Maps) y `instagramUrl` (23 con IG, los validar no tienen IG por falta de fuente verificada). Parcheado in-place.
- **`js/lang.js`**: 1 key nueva × 3 idiomas = 3 entries (`ficha.link.label.web`).
- **`AGENTS.md` Gate 3** ampliado con 2 dominios públicos exentos: `turismovallelastrancas.com` (portal oficial PTI) y `instagram.com` (perfil del local).
- **`BASELINE.md`** re-frozen con los 4 archivos modificados y los nuevos SHA-256.

### Fixed
- **Idempotencia del script**: el `regenListings` original acumulaba 1 newline por corrida (SHA crecía en cada run). Reemplazado con un regex que captura el START comment + trailing newline (g1) y el leading whitespace + END comment (g3), con body trimeado. Ahora la 3ª corrida produce el mismo SHA-256 que la 2ª. El script es **idempotente byte a byte** desde la corrida #1.

### Why
- El usuario pidió "estén en listado" — la card ya estaba en grid, ahora se simplificó con chips de links en vez de campos redundantes.
- "Sacarle el selector de precios" — el campo `precio_referencia` era inconsistente (siempre "por confirmar" en el data) y agregaba ruido visual. La info útil para decidir un restaurant es: ¿dónde está? (Maps) y ¿cómo lo contacto? (IG). El precio es secundario.
- "Acceso directo a dirección de Google Maps" — el link de Maps ahora muestra la dirección visible (`zona`) y abre Google Maps con búsqueda directa.
- "Al Instagram de forma estética y con hipervínculo" — el link de IG tiene emoji + texto + @handle, con hover state, semanticamente un `<a>` real (no un `<button data-url>` que tampoco es hyperlink).

## [Unreleased] — Sección Restaurantes: catastro v3 (32 locales, status + recos)

Honra la orquestación del catastro (`catastro_gastronomico_valle_las_trancas_orquestacion.md`): 32 locales del Valle Las Trancas con filtro por status, 3 recomendaciones curadas al inicio, `<details>` colapsado con los validar.

### Changed
- **`host-data.json` poblado con 32 locales del catastro**:
  - 23 `publicar` (11 Tabla A + 8 Tabla B + 4 Tabla C): Sitari, Bagual, Borde Andino, Los Hualles, Oliva's, Miski Lirio, Chil'in, Pizzas & Beers, Steak House, Shangrila, Snow Pub, Las Bravas, Dulce Montaña, Koiwe, Lux/Petit Club, Las Cachañas, Caramba, Che Cami, Valdo, Cervecería Garganta del Diablo, Cervecería Shangrila, La Cava de la Montaña, Charcutería Las Cabras.
  - 8 `validar` (Tabla D sin contar Muelle 41 y dup de Lux): Patio Tranquino, Charlie Bowl, El Tren, Monte Carla, Alto Las Trancas, El Paredón, Malcontenta, Gastronomía en Nevados.
  - 1 `no_publicar` (Muelle 41 — Tripadvisor 2.3/5).
  - Cada local trae 22 campos en 3 idiomas (ES/PT/EN), incluyendo `status`, `prioridad_landing`, `estrellas_airbnb`, `link_oficial`, `perfil_huesped[]`, `cta_key`, `module_id`, `secure_required`, `fuente`, `fecha_verificacion`.
- **`apply-host-data.mjs` filtra por status en `restaurantes.html`**:
  - `publicar` → grid principal, ordenado por `prioridad_landing`.
  - `validar` → bloque `<details class="details-pending">` colapsado al final con `rest.validar.t` + `rest.validar.body`.
  - `no_publicar` → filtrado completamente.
- **3 bloques de recomendaciones rápidas curados al inicio** de `restaurantes.html` (no ranking inventado, listas humanas):
  - `reco.cena.t` (Cena contundente): Sitari, Steak House, Miski Lirio, Borde Andino.
  - `reco.simple.t` (Algo simple y rico): Pizzas & Beers, Bagual, Los Hualles, Las Bravas.
  - `reco.depto.t` (Para llevar al departamento): La Cava, Charcutería Las Cabras, Garganta del Diablo, Cervecería Shangrila.

### Fixed
- **Bug crítico en `esc()`** del `apply-host-data.mjs`: la función no escapaba `$`, por lo que valores con `$` literal (como `precio_referencia: '$'`) hacían que `String.replace` interpretara `$` como backreference (`$&`, `$1`, `$\``, `$'`). Resultado: el lang.js crecía a >1M líneas en una sola corrida. Fix: `esc()` ahora también escapa `$`.
- **Bug en `String.replace` con template literal**: el replacement `${m[1]}${cleaned}${m[3]}` se interpretaba como string con backreferences. Con `cleaned` conteniendo valores con `$`, la misma explosión ocurría en el DBL_RE / DEAD_RE / setKeyInBlock / appendKeys. Fix: usar function callback en todos los `String.replace` (5 sitios) en vez de template literal.
- **Bug de performance en `appendKeys`**: el loop de per-listing keys llamaba `appendKeys` 1344 veces (32 items × 14 fields × 3 langs), cada una re-matcheando el lang.js entero. Fix: batch por lang → 3 llamadas totales.
- **Gate 3 ampliado** con `bordehoteles.cl`, `cabanaslascabras.cl`, `trancas.cl` (sitios oficiales de venues y portal local público).

### Why
- El plan acordado ("hook HTML-driven + 3 adiciones del catastro") se completa con: (a) status field con filtro, (b) locales del catastro agregados, (c) 3 recos hardcoded-curados. El gate 3 se amplía para no romper por los `link_oficial` que el script ahora escribe.
- Los 3 recos son listas humanas (no scoring): el Lead curó los IDs por escenario. No hay "ranking inventado" como advertía el markdown §7.
- El bug del `$` en `String.replace` es un footgun clásico de JS — el template literal del replacement se interpreta como backreference string. Vale la pena documentarlo en el `esc()` para que el próximo cambio no lo reintroduzca.


## [Unreleased] — Catastro orquestado v2 (60 fichas del catastro 2026-07-04)

### Added
- **`actividades.html` reestructurado** con 8 módulos anchor: `#act`, `#termas`, `#nieve`, `#mtb`, `#atractivos`, `#bienestar`, `#servicios`. Top section con 10 fichas curadas (catastro §"Top recomendado") en grid responsive. TOC interno (`<nav class="modulo-toc">`) con anchors por módulo. Disclaimer fijo (`act.disclaimer`) en callout copper @10%. FilterBar real de 3 dimensiones (temporada, dificultad, zona) con persistencia en `localStorage["gh-filters-actividades"]`. Módulos `nieve` y `atractivos` llevan callout de seguridad fijo (regla #7 del catastro).
- **`restaurantes.html` reestructurado** con disclaimer `rest.disclaimer` y grid de 18 locales (catastro gastronomy) ordenados por `prioridad_landing`.
- **`js/actividades.js`** (nuevo, canónico): lee los 3 filter dimensions, persiste en localStorage, sincroniza aria-pressed, aplica `body[data-filter-*]` para que CSS haga display:none de cards no-matching. Inserta bloque `.ficha-empty` cuando 0 cards matchean con texto i18n (`act.noresults`).
- **`host-data.json` poblado** desde el catastro orquestado 2026-07-04: 18 restaurants (gastronomy) + 42 activities/attractions/services = 60 fichas totales, todas en ES/PT/EN.
- **Traducción completa ES/PT/EN** de los 14 campos textuales por ficha. 60 × 14 × 3 = 2.520 keys per-listing nuevas en `lang.js` (1.764 para activities + 756 para restaurants).
- **Per-listing i18n keys id-based** (estables): `act.${id}.${field}` y `rest.${id}.${field}`. No más keys indexadas.
- **Stars (1-5) visibles** en cada card, alineado a la regla editorial del catastro.
- **Safety badge 🛡️** en fichas con `data-secure="true"` (trekking, randonée, canyoning, escalada, laguna huemul, fumarolas, aguas calientes, etc.).
- **Safety callout fijo** en `#nieve` y `#atractivos` (regla #7).
- **Disclaimer fijo** en ambas páginas (regla #6).
- **CTAs por tipo de reserva**: `act.cta.ver` (web oficial), `act.cta.consultar` (operador), `act.cta.comprar` (boletería/web), `act.cta.guia` (con guía).

### Changed
- **`apply-host-data.mjs` reescrito** con el nuevo schema: text fields como objetos `{es,pt,en}`. Per-listing keys id-based. 14 L10N_FIELDS por ficha. fichaCard HTML template con data-attrs. Idempotente: `setKeyInBlock` usa regex global, `appendKeys` deduplica por key existente. `node -c` post-write.
- **`js/lang.js` pasa de 612 a 3.134 líneas** (excede el límite de 500 por diseño: data, no código; documentado en AGENTS.md).
- **`css/styles.css` ~213 líneas de extensiones**: `.modulo`, `.modulo-top`, `.modulo-toc`, `.grid-top`, `.callout`, `.callout-alert`, `.callout-secure`, `.stars`, `.ficha-secure`, `.ficha-secure-callout`, `.ficha-copy`, `.filter-bar--multi`, `.filter-group`, `.filter-label`, `.filter-bar-foot`, `.filter-clear`, `.filter-count`, y 13 reglas `[data-page="actividades"][data-filter-*] { ... }` para ocultar cards no-matching.
- **`apply-host-data.mjs` ya no emite JSON embebido en `restaurantes.html`** (diseño v1 con `js/restaurants.js`). El nuevo diseño escribe HTML directo en el `@LISTINGS`. `js/restaurants.js` queda en baseline como archivo inerte (early-return si `#restaurants-data` no existe).

### Gate updates
- Gate #2 (prototype-leak) ahora grepea también `js/restaurants.js` y `js/actividades.js` además de `lang.js`.
- Gate #3 (real http hrefs) ahora exenta `turismovallelastrancas.com` (PTI) y `conaf.cl` (CONAF) además de los servicios públicos ya legitimados.

## [Unreleased] — Sección Restaurantes: orquestación catastro v1

Honra la orquestación de `catastro_gastronomico_valle_las_trancas_orquestacion.md` (8 roles, 6 escenarios, 32 locales). "No inventar ranking" → recomendaciones se generan desde tags, no hardcodeadas. "Validación visible para el host (no perdida) pero fuera de la lectura del huésped" → `<details>` colapsado al final de la página.

### Added
- **`js/restaurants.js` (canónico, 12º archivo en baseline).** Lee `<script type="application/json" id="restaurants-data">` al boot, renderiza 4 zonas: (a) FilterBar con 6 categorías + 3 opciones de sort; (b) "3 ideas rápidas" computadas desde 6 reglas de tags/bestFor (kids, cena, simple, café, bar, depto); (c) listado público de cards con chips, whyGo, rating pending + fallback, hasta 4 botones de acción; (d) `<details>` colapsado con candidatos a validar. Re-renderiza al cambiar idioma vía `GH_I18N.subscribe`. ~290 líneas, ES5 plain, no deps.
- **FichaCard extendida** con 7 features nuevos: chips de tags (top), whyGo (italic), rating pending (`var(--rock)` italic) + fallback secundario (`ficha.rating.pending` × 3), 4 botones de acción (Maps `<a>`, Instagram `<button data-url>` para no entrar al Gate 3, tel: `<a>`, Web `<a>`), CLP si `r.price` / `r.priceLevel` (`$` / `$$` / `$$$`) / `—` missing, horas + teléfono cuando existen, `data-*` attributes (`data-category`, `data-tags`, `data-rating`, etc.) en cada card.
- **FilterBar con 5 categorías + "Todos"** (restaurante, pizza, café, bar, compras) + **3 opciones de sort** (rating con `null` al final, reviews, cerca/ruta).
- **Bloque "3 ideas rápidas para decidir ahora"** con 6 sub-bloques (`reco.kids.t`, `reco.cena.t`, `reco.simple.t`, `reco.cafe.t`, `reco.bar.t`, `reco.depto.t`) — 3-4 locales por bloque, ordenados por confidence.
- **Bloque "Candidatos a validar antes de recomendar"** en `<details>` colapsado, muestra 9 locales `validar` + 1 `no_publicar` (Muelle 41) con copy en gris italic.
- **30 nuevas keys i18n × 3 idiomas = 90 entries** en `js/lang.js`: chrome (rest.title, rest.subtitle, rest.sources.note, rest.validar.*, rest.filter.*, reco.*), ficha (ficha.maps, ficha.open, ficha.call, ficha.website, ficha.whyGo.t, ficha.rating.pending, ficha.rating.check, ficha.hours.t, ficha.phone.t).
- **CSS extendido ~40 líneas:** `.ficha-tags`, `.ficha-card__why`, `.ficha-card__rating` (+ `--pending`), `.ficha-card__actions`, `.btn--sm`, `.reco-block` (+ `__title`, `__list`), `.filter-bar--sort`, `.details-pending`. Mantiene 8px grid, squircle formula, motion tokens.

### Changed
- **`apply-host-data.mjs` ya no genera HTML de cards** para `restaurantes.html`. Ahora emite un `<script type="application/json" id="restaurants-data">…</script>` con los locales (filtrados los `no_publicar`) + 4 containers vacíos (`#restaurants-toolbar`, `#restaurants-recos`, `#restaurants-list`, `#restaurants-validar`). El JS reconstruye el DOM. Activities siguen con el viejo path de fichaCard HTML.
- **Bug fix en `setKeyInBlock`:** el regex de value no manejaba `\'` (escaped apostrophe), truncando scalars como `rest.validar.body` (`"haven't confirmed"`) en el primer `'`. Cambiado a `'(?:[^'\\]|\\.)*'` para consumir el escape completo. Idempotente tras el fix.
- **`restaurantes.html` markup reescrito** — `rest.intro` reemplazado por `rest.title` + `rest.subtitle` + `rest.sources.note` (copy editorial de §10 del catastro). Carga `js/restaurants.js` defer. `restaurantes.html` pasa a 51 líneas.
- **12 archivos canónicos** (antes 11). `BASELINE.md` actualizado con los nuevos hashes y la entrada de cambios.
- **`js/lang.js` excede el límite de 500 líneas del sistema** (~614 líneas). Excepción documentada: mantener el i18n como un solo archivo preserva la apertura `file://` del proyecto (sin HTTP server, sin `fetch`). Dividir requeriría build step o fetch, violando "no frameworks, no build".
- **AGENTS.md actualizado** — gate 1 itera 12 archivos; gate 3 ahora exime `wa.me` (WhatsApp del host, una vez provisto en `data.urls.quick_wa`).

### Data
- **`host-data.json` poblado con 32 locales** del catastro: 23 `publicar` + 8 `validar` + 1 `no_publicar` (Muelle 41). Cada local trae 22 campos (id, name, status, category, tags[], shortDescription, whyGo, addressOrKm, googleMapsUrl, googleRating, googleReviewCount, ratingCheckedAt, publicRatingFallback, instagramUrl, websiteUrl, phone, hours, priceLevel, bestFor[], petFriendly, openAllYear, sourceUrls[], confidence). Duplicado Lux/Petit Club consolidado (Q6: humano consolida).
- **`host-data.sample.json` extendido** a la nueva forma con 2 publicar + 1 validar, para dry-runs del swarm.

### Por qué JSON-driven (no HTML-driven)
El viejo approach generaba HTML estático en el `@LISTINGS` block, que el cliente solo podía leer pero no filtrar. El nuevo approach emite datos puros (JSON) + containers vacíos; el cliente decide la presentación (filter, sort, escenarios computados, re-render al cambiar idioma). Costo: +1 archivo canónico. Beneficio: filter/sort sin reload, 3 recomendaciones desde reglas (no strings), idioma-switch sin parpadeo.
