# Guest Hub "Andes Chillán" — Prompt One-Shot: Generar el CASCO HTML de Diseño

> **Pega este prompt tal cual en una sesión nueva de Claude Code.** Produce SOLO el casco de diseño (shell + tokens + componentes vacíos + navegación esqueleto + placeholders tipados). **NUNCA rellena contenido real.**

---

## 1. ROL Y OBJETIVO

Actúas como **Arquitecto de Información + Diseñador UX/UI premium** (registro: *product app shell*, no brand marketing). Tu único entregable es el **CASCO HTML de diseño** del Guest Hub: el marco silencioso de una app a la que se accede por QR.

- **Generas:** design tokens, app shell, biblioteca de componentes, layout y navegación esqueleto, sistema de placeholders tipados, esqueleto i18n ES/PT/EN.
- **NO generas:** contenido real de módulos (textos, horarios, nombres, precios, links externos de producción, teléfonos, SSID). Los valores ausentes se representan como placeholders tipados, nunca como 0, vacío ni lorem.
- Principio rector: **deferencia al contenido**. La información útil es la protagonista; la UI es el marco. El huésped resuelve una necesidad concreta en <10s desde el escaneo.

Antes de escribir una sola línea, ejecuta la **secuencia de ejecución obligatoria** de §6.B (no invertir). Resumen conceptual del flujo: **Graphify (alineación) → Ponytail (disciplina, primero) → Impeccable shape → implementar casco → design-taste-frontend (gatekeeper de tells) → Impeccable critique/polish → Playwright (QA visual)**. Ruflo Swarm queda como bloque **OPCIONAL** (no bloqueante); el casco se completa perfectamente en un solo agente secuencialmente siguiendo el orden topológico de §4.

---

## 2. CONTEXTO

**Guest Hub Andes Chillán** — un Airbnb en Las Trancas / Nevados de Chillán. Ecosistema de páginas HTML estáticas, cada una accesible por un **código QR físico** en el departamento. **Mobile-first** (el huésped llega por el celular), **multilenguaje ES/PT/EN**, estética de **refugio de montaña moderno 50/50 invierno/verano** (sutil, no literal, no folleto turístico).

- Acceso: `QR → index.html` (hub central). Cada módulo es una hoja a **1 nivel de profundidad**. Cero menús anidados.
- Sin frameworks, sin build step, sin bundlers, sin preprocesadores, sin npm install. HTML + CSS vainilla + un `lang.js` plano para i18n. `maximum-scale=1` (QR/mobile).

**Archivos fuente obligatorios a Read antes de generar (rutas absolutas):**
- `/Users/josetomasayala/Desktop/Skills/D_Fundamentos_Diseno_APPLE copy/APPLE_LIKE_DESIGN_FOUNDATION.md` — ADN visual indiscutido (15 principios + tokens).
- `/Users/josetomasayala/Desktop/Skills/GuestHub/DESIGN.md` — adaptación canónica al territorio (la instancia de marca PROPIA del proyecto; no es una marca de catálogo externo).
- `/Users/josetomasayala/Desktop/Skills/GuestHub/GRAPHIFY_MAESTRO.md` — mapa de arquitectura (la verdad sobre módulos/orden/flujo).
- `/Users/josetomasayala/Desktop/Skills/GuestHub/css/styles.css` — tokens reales existentes (respeta los tokens de color canónicos; completa la capa semántica/funcional que falta — verificadamente **no contiene `tabular-nums`**, añádelo).

> **Fuentes visuales: solo dos.** `GuestHub/DESIGN.md` + `APPLE_LIKE_DESIGN_FOUNDATION.md`. No invoques ninguna skill externa que reemplace o sobrescriba `GuestHub/DESIGN.md` (ver la fila ⚠️ `design-md` de la tabla §6.A).
> **Nota sobre el encabezado del archivo:** `GuestHub/DESIGN.md` se autodenomina `(awesomedesign.md)` en su cabecera **por herencia de plantilla**, no porque haya sido generado por `/design-md`. Es la instancia PROPIA del proyecto. No la "actualices" con `/design-md`.

---

## 3. ADN VISUAL OBLIGATORIO (tokens exactos)

Lee y respeta los **15 principios Apple** (claridad antes que decoración, deferencia al contenido, jerarquía silenciosa por opacidad, calma visual, precisión técnica grilla 8px, profundidad sutil sombras 3-10%, progressive disclosure, belleza silenciosa) de `D_Fundamentos_Diseno_APPLE copy/APPLE_LIKE_DESIGN_FOUNDATION.md`. Aterrízalos con la paleta dual de `GuestHub/DESIGN.md`.

**Tokens de color (canónicos, en `:root` de `css/styles.css`):**
- **Invierno (base / estructura, frío):** `--snow #F7FAFC` (bg principal) · `--ice #DDEAF3` (bg sutiles/cards secundarias) · `--deep-blue #12344D` (texto primario, headers estructurales) · `--night #0B2538` (texto alto contraste, h1/h2/h3, footers).
- **Verano (acentos / calidez, cálido):** `--forest #1F4D3A` (botones primarios, success) · `--wood #B7793E` (botones secundarios, acentos, íconos) · `--rock #6B7280` (texto muted/body) · `--rock-light #E5E7EB` · `--copper #C46A3A` (alerts, urgentes).
- **UI:** `--card-bg rgba(255,255,255,0.88)` · `--card-border rgba(255,255,255,0.82)` · `--shadow-soft 0 12px 35px rgba(18,52,77,0.10)` · radios `--radius-xl 28px` · `--radius-lg 20px` · `--radius-md 14px` · `--radius-pill 999px` · `--max-w 600px`.

**Tipografía:** `Inter` (400/600/700/800), `system-ui, -apple-system, sans-serif` fallback. JetBrains Mono/Fira Code **solo** para datos técnicos/logs. Headings `h1,h2,h3` color `--night`, `letter-spacing: -0.04em`, bold. Body color `--rock`, `line-height: 1.6`. `h1=2.2rem/1.1/mb12` · `h2=1.5rem/mb16`. Enlaces `--wood`, weight 600. `-webkit-font-smoothing: antialiased`. **OBLIGATORIO añadir `font-variant-numeric: tabular-nums`** en todo número fluctuante (horarios, precios, °C, cm de nieve) — falta en `styles.css` actual.

**Grilla 8px estricta.** Múltiplos de 4/8: secciones macro 48/64, cards padding 24 / gap interno 12-16, micro 8 (label-input) y 4 (texto-icono). `.app-container` padding 24 / padding-bottom 80.

**Radios squircle (regla de anidación: radio interno = radio externo − padding):** pill 999 · sm/md 14 · lg 20 · xl 28.

**Sombras:** ultra-bajas 3-10%, nunca duras (`--shadow-soft` ya canónico).

**Glassmorphism — USO QUIRÚRGICO, no por defecto.** La `.card` base lleva `background: var(--card-bg)` (.88, casi opaco) con sombra suave. El `backdrop-filter: blur(12px)` se aplica **solo donde aporta jerarquía real** (header fijo, Emergency Card, Quick Contact), nunca a toda `.card` y **NUNCA sobre texto numérico/tabular** (destruye contraste WCAG). Esto es una **excepción justificada y deliberada** a la ban-list de Impeccable (que prohíbe glassmorphism como patrón por defecto), no el patrón por defecto. Si una `.card` con datos tabulares necesita glass, sube la opacidad a `.92+`.

**Movimiento:** `--motion-snap 150ms ease-out` (hover/selecciones) · `--motion-slide 300ms cubic-bezier(0.16,1,0.3,1)` (paneles/acordeones). Hover lift sutil (translateY −2 a −4px). Sin rebote/3D. Respetar `@media (prefers-reduced-motion)`.

**Body background (sistema per-página, NO mesh de radial-gradients):** base neutra única `linear-gradient(180deg, #F8FBFD 0%, #EEF4F8 58%, #E3ECF2 100%)` con `background-attachment: fixed`, sobre la que cada HTML aplica una clase `.bg-*` (`bg-home`, `bg-checkin`, `bg-checkout`, `bg-clima`, `bg-tickets`, `bg-instrucciones`, `bg-restaurantes`, `bg-actividades`). Cada `.bg-*` carga `css/bg/<page>.webp` con fallback a `.jpg`, más un `linear-gradient` superpuesto que va de transparente en el top a `var(--snow)` en el bottom — así las cards siempre aterrizan sobre una superficie calmada. Home = full-bleed (fade suave), las 7 internas = fade fuerte (foto actúa como textura atmosférica, no como visual primario). Photos curadas CC0/Unsplash. El sistema estacional `is-winter`/`is-summer` ya no afecta el fondo (solo el sistema de tags y `.season-*`); la elección fue identidad unificada "mountain" sobre dualidad invierno/verano.

**Reglas no negociables:** (1) grilla 8px; (2) tabular-nums en todo número; (3) squircle con fórmula de anidación; (4) color semántico @10-15% opacidad fondo + texto/icono 100%, nunca saturado a área completa; (5) jerarquía por opacidad (título `--night` bold / cuerpo `--rock` / unidades devaluadas 10-30%); (6) progressive disclosure; (7) calma visual (fondo frío + acentos cálidos); (8) sombras 3-10%; (9) movimiento ≤300ms ease-out.

**Anti-patrones prohibidos:** glassmorphism sobre texto tabular, bordes verticales en listas/tablas, color vibrante puro como fondo de área completa, tablas cebra, sombras duras, skeumorfismo, caricatura deportiva extrema, folleto turístico genérico, íconos extravagantes o degradados multitonos, animaciones rebote/3D >300ms, clon literal macOS/iOS (menubar Mac, SF Pro, vectores Apple propietarios).

---

## 4. ARQUITECTURA GRAPHIFY

Lee `GuestHub/GRAPHIFY_MAESTRO.md` como el **único plano**. El grafo tiene 3 ramas:
- **Rama A · Sistema & Fundación:** tokens, App Shell, i18n, biblioteca de componentes.
- **Rama B · Módulos Base:** nodo Home (módulo 1, hub de navegación) + 7 hojas a 1 nivel de profundidad orientadas al huésped (módulos 2–8).
- **Rama C · Módulos Futuros:** Staff/Operación (módulo 9). **Solo stub reservado, NO se desarrolla en el casco.**

> **Conteo canónico de archivos HTML: 8 en total.** `index.html` (Home/hub, módulo 1) + 7 hojas a 1 nivel de profundidad (módulos 2–8: Check-in, Check-out, Restaurantes, Actividades, Clima, Tickets, Info Depto). Home **NO** es hoja; es el hub de navegación. (El "módulo 9 / Staff" es Rama C y queda como stub sin HTML.)
>
> ⚠️ **DISCREPANCIA CON EL DISCO — RESOLVER ANTES DE GENERAR (no ignorar):** `GuestHub/` contiene en disco **dos archivos HTML adicionales NO listados en el conteo canónico**: `cafe.html` y `emergencias.html`. El `index.html` real **los enlaza** (`href="cafe.html"`, `href="emergencias.html"`). Además, **ambos contienen contenido real que viola el guardrail de pureza** de §7: `cafe.html` incluye copy de marketing ("Tu pack de bienvenida incluye café gratis...") y un stepper funcional; `emergencias.html` incluye alertas reales ("No hay agua caliente", "Falla calefacción") con `onclick="alert('Enviando alerta a Google Workspace...')"`.
>
> **Resolución obligatoria (GRAPHIFY_MAESTRO §3 es la fuente de verdad):** según el maestro, las **emergencias** son un subnodo del **módulo 8 (Info Depto / instrucciones)** (no un módulo independiente), y el módulo Staff es la Rama C. Por tanto:
> - **`emergencias.html`**: **NO es un HTML canónico separado.** Su funcionalidad (Emergency Card) se absorbe en `index.html` y/o `instrucciones.html` (módulo 8). Regenera el Emergency Card allí como casco vacío con placeholders tipados (destino `tel:` como placeholder, ver §7). **No preserves el copy real ni el `onclick` a Google Workspace** (son contenido/prototipo).
> - **`cafe.html`**: **NO aparece en GRAPHIFY_MAESTRO.** Es un prototipo fuera del alcance canónico. **No lo generes, no lo enlaces, no lo modifiques.** Al regenerar `index.html`, su lista de accesos debe contener **solo los 8 módulos canónicos** (Home + 7 hojas). Si decides conscientemente fundir "Tienda Café" como subnodo de Info Depto, documéntalo explícitamente y vacíalo a placeholders; por defecto, **omítelo**.
> - El número mágico "8" es **canónico y no cambia**: la navegación esqueleto de `index.html` enlaza exactamente Home + Check-in, Check-out, Restaurantes, Actividades, Clima, Tickets, Info Depto.

**Orden topológico de construcción del casco (no saltarse):**
1. `css/styles.css` con tokens: **extender** los existentes (no reescribir) + añadir lo faltante de Apple (grilla 8px completa, escala tipográfica, z-index layers, motion tokens, `tabular-nums`, clases de los componentes `[NUEVO]`).
2. App Shell (`.app-container` max-width 600px) + `.header` + `.btn-back` en toda hoja.
3. Esqueleto i18n: atributo `data-i18n="key"` + `lang.js` con diccionarios `{es,pt,en}` cuyos values son **placeholders tipados** (no contenido), fallback ES, persistencia en `localStorage`.
4. Biblioteca de componentes (los `[NUEVO]` de Graphify §4).
5. `index.html` + 7 hojas HTML con placeholders tipados.

**Regla para TODO archivo `[EXISTS]` (crítico, cierra la ambigüedad "respetar existentes" vs "cero contenido"):** preserva **tokens, clases y estructura de navegación** del archivo pre-existente, pero **VACÍA cualquier contenido real a placeholders tipados `[PLACEHOLDER: ...]`**. El casco nunca contiene datos reales aunque el archivo pre-exista. **Antes de asumir que un `[EXISTS]` está vacío, haz un `Read`** y purga copy/horarios/precios/links reales/`onclick` a placeholders. Esto aplica en particular a `cafe.html` y `emergencias.html` (ver arriba).

**Flujo de navegación:** `QR → Home (index.html) → {selector ES/PT/EN persistente}`. Home ramifica a 7 accesos (Check-in, Check-out, Restaurantes, Actividades, Clima/Nieve, Tickets/Ski, Info Depto) a 1 nivel. Cada hoja tiene `.btn-back → Home`. Quick Contact (WhatsApp/tel) siempre accesible desde Home. Énfasis estacional vía `Season Tag` + clase `is-winter`/`is-summer` (realza Tickets en invierno, Actividades outdoor en verano) **sin dominar** fuera de temporada.

---

## 5. ENTREGABLE DEL CASCO (estructura de archivos exacta)

```
GuestHub/
├── css/styles.css          # :root tokens + clases base existentes + clases [NUEVO] + tabular-nums + motion tokens
├── js/lang.js              # diccionarios {es,pt,en} con TODAS las data-i18n keys como placeholders; localStorage; fallback ES
├── index.html              # Home/hub (selector ES|PT|EN, SeasonTag, QuickContact, accesos a los 8 módulos, Emergency Card)
├── check-in.html           # [EXISTS] hoja con btn-back  (vaciar contenido real a placeholders)
├── check-out.html          # [TODO] hoja con btn-back
├── restaurantes.html       # [EXISTS] hoja con FichaCard(s) vacías
├── actividades.html        # [EXISTS] hoja con FilterBar + FichaCard(s) vacías
├── clima.html              # [TODO] hoja con ExternalLinkRow (destino = placeholder)
├── tickets.html            # [TODO] hoja con ExternalLinkRow (destino = placeholder)
├── instrucciones.html      # [EXISTS] Info Depto con Accordion (FAQ) vacío (+ Emergency Card absorbida del antiguo emergencias.html)
└── staff/                  # carpeta reservada Rama C (solo stub .gitkeep/README, sin desarrollo, sin HTML)
```

> **Archivos pre-existentes fuera del conteo canónico (no generar, no enlazar):** `cafe.html`, `emergencias.html`, `graphify.html`, `ruvector.db`, `GRAPHIFY_MAESTRO.canvas`. Son prototipos/artefactos de tooling; el casco no los toca salvo la regla de purga de §4 (vaciar contenido si un `Read` revela copy real que podría fugarse al reference set).

**Biblioteca de componentes (clases aterrizar en `css/styles.css` + markup reutilizable). Respetar las existentes; añadir las `[NUEVO]`:**
- `.app-container` · `.card` (+ `.card-header`) · `.icon-box` (variantes `.bg-winter`/`.bg-summer`/`.bg-warm`) · `.btn` (`.btn-forest`/`.btn-wood`/`.btn-outline`) · `.btn-back` · `.tag` (`.tag-winter`/`.tag-summer`/`.tag-alert`) + `.tag-group` · `.grid-2` · utilidades `.mb-4`/`.mb-8`/`.text-center`.
- **`[NUEVO]`:** Language Selector (segmented `ES|PT|EN`, persiste `localStorage`, fallback ES) · Season Tag (tag activo + clase condicional `is-winter`/`is-summer`) · Quick Contact (barra WhatsApp/tel siempre visible en Home) · FichaCard (Card + campos estructurados: nombre·tipo·ubicación·Maps·IG·precio·ocasión) · FilterBar (filtros temporada/tipo/clima) · ExternalLinkRow (fila link externo; **destino como placeholder, ver §7**) · Emergency Card (Card accentuada `--copper`, acción directa; **destino `tel:` como placeholder, ver §7**) · Accordion/FAQ (progressive disclosure, `<details>` nativo antes que lib) · Empty State (ilustración + CTA).

**QUÉ SE LLENA (diseño + estructura):** tokens, shell, clases de componentes (incluyendo el sistema de fondos per-página `.bg-*` con sus 8 fotos en `css/bg/`), navegación, atributos `data-i18n`, campos tipados, layout responsive mobile-first, estados vacíos.

**QUÉ QUEDA VACÍO (contenido prohibido):** textos de bienvenida reales, horarios, nombres de restaurantes/actividades/senderos/termas, precios, °C, cm de nieve, URLs externos de producción (Maps, Snow Forecast, sitio ski, WhatsApp), teléfonos, SSID wifi, copy marketing, **y los nombres mismos de los servicios externos** (no escribir "Snow Forecast" ni "Google Maps" como texto visible del link — son placeholders). **Links: solo `href="#"` o `href="[PLACEHOLDER: url]"`.**

---

## 6. LLAMADOS A COMANDOS POR SKILL (sintaxis verificada)

> **Verificación:** todos los comandos de esta sección fueron confirmados leyendo el `SKILL.md` / archivo de comando real de cada skill instalada (`/Users/josetomasayala/.claude/skills/**`, `/Users/josetomasayala/.claude/plugins/cache/**`) y contrastados con el **catálogo registrado del sistema** (que expone las skills con su namespace exacto). No hay sintaxis inventada. Donde una skill no es slash-invocable, se dice explícitamente.

Antes de generar una sola línea, declara un **Design Read** de una línea:
> `Reading this as: product app shell for Airbnb guests (ES/PT/EN, mobile-first, QR-accessed), with a mountain-refuge aesthetic, leaning toward native CSS + custom tokens (no framework).`

### 6.A Tabla de comandos por skill (catálogo del usuario)

| Skill (catálogo) | Comando(s) exacto(s) | Cuándo invocarlo | Nota / contraindicación |
|---|---|---|---|
| **Graphify** | `/graphify <path>` · `/graphify <path> --no-viz` · `/graphify <path> --directed` · `/graphify <path> --update` · `/graphify query "<pregunta>"` · `/graphify path "A" "B"` · `/graphify explain "X"` | **PRIMERO.** Lee el material canónico **ya existente** en `GuestHub/` (maestro, design, css, hojas `[EXISTS]`) y alinea tu comprensión con la arquitectura. `query`/`path`/`explain` solo tras existir `graphify-out/graph.json`. | Contrato estricto: **NO** generes `graphify-out/` sobre archivos del casco que aún no existen. `--no-viz` omite el HTML (solo graph.json + reporte), ideal mientras el casco esté vacío. `--directed` modela dependencias tokens→componentes→pantallas. |
| **Obsidian Skills (obsidian-cli)** | `obsidian read file="D_Fundamentos_Diseno_APPLE copy"` · `obsidian search query="<term>" limit=10` · `obsidian vault="<vault>" search query="typography" limit=10` · `obsidian backlinks file="D_Fundamentos_Diseno_APPLE copy"` | **N/A para este proyecto por defecto** (la nota Apple es archivo en disco, ver nota). Se reserva para el caso hipotético en que la nota Apple viva en un vault de Obsidian en vez de en disco: úsala para extraer el ADN Apple y localizar notas relacionadas (tokens, color, tipografía). | ⚠️ **N/A para este proyecto:** el ADN Apple **es archivo en disco** confirmado (`/Users/josetomasayala/Desktop/Skills/D_Fundamentos_Diseno_APPLE copy/APPLE_LIKE_DESIGN_FOUNDATION.md`, ver §2). Haz `Read` directo; **no invoques obsidian-cli** salvo que verifiques que la nota vive en un vault con Obsidian abierto. Es la **única** skill de Obsidian que lee/consulta; `obsidian-markdown` y `json-canvas` NO sirven para leer (ver fila de abajo). Nota de sintaxis: `vault=<name>` puede ir en cualquier posición; el SKILL recomienda ponerlo primero. |
| **Obsidian Skills (obsidian-markdown / json-canvas)** | *(sin slash de lectura; solo sintaxis para escribir)* | **NO las uses para leer el vault.** `obsidian-markdown` es referencia de sintaxis para **escribir** `.md` Obsidian; `json-canvas` solo crea archivos `.canvas` visuales. | ⚠️ **Contraindicadas para la tarea DATA de leer el ADN Apple.** Para leer, usa `obsidian-cli` (fila de arriba). |
| **Ponytail** | `/ponytail:ponytail` (default=full) · `/ponytail:ponytail full` · `/ponytail:ponytail lite` · `/ponytail:ponytail off` · `/ponytail:ponytail-review` · `/ponytail:ponytail-audit` · `/ponytail:ponytail-debt` · `/ponytail:ponytail-gain` · `/ponytail:ponytail-help` | **Después de Graphify, ANTES de generar** cada bloque (shell, tokens, componentes). Cuestiona si la pieza necesita existir (YAGNI), prefiere stdlib/CSS nativo antes que código custom, una línea antes que cincuenta. `/ponytail:ponytail-review` tras cada bloque caza sobre-ingeniería en el diff. | **Usa el namespace `ponytail:` (forma verificada contra el catálogo registrado del sistema).** El nivel va como argumento: `/ponytail:ponytail full` o `/ponytail:ponytail lite`. ⚠️ `/ponytail:ponytail ultra` **CONTRAINDICADO**: puede borrar marcadores estructurales del brief (tokens, placeholders tipados). Desactiva con `/ponytail:ponytail off`. *Nota de ambigüedad:* el skill `ponytail-help` RECLAMA internamente que `/ponytail` (sin namespace) funciona en Claude Code, pero el **registro real** (source of truth) expone `ponytail:ponytail`. Si el slash directo `/ponytail` no resuelve en tu sesión, usa `/ponytail:ponytail`. |
| **Impeccable** (umbrella v3.1.1) | `/impeccable teach` · `/impeccable shape "[target]"` · `/impeccable craft "[target]"` · `/impeccable critique [target]` · `/impeccable audit [target]` · `/impeccable polish [target]` · `/impeccable harden [target]` · `/impeccable clarify [target]` · `/impeccable distill [target]` · `/impeccable extract [target]` · `/impeccable document` | **Eje del flujo de diseño.** `teach` si falta contexto de producto; `shape` planea el UX/UI del shell antes de escribir HTML; `craft` shape-then-build end-to-end; `critique`/`audit`/`polish`/`harden`/`clarify` en QA final. | Regla crítica de routing: el **setup corre primero** (loader `node .claude/skills/impeccable/scripts/load-context.mjs` carga `DESIGN.md`/`PRODUCT.md`); los sub-comandos **no re-invocan** `/impeccable`. Si `PRODUCT.md` falta/vacío → corre `/impeccable teach` antes de cualquier diseño. |
| ⚠️ **Impeccable — pin de sub-comandos como slash cortos** | `node .claude/skills/impeccable/scripts/pin.mjs pin <command>` · `node .../pin.mjs unpin <command>` · (tras pinear:) `/shape` · `/craft` · `/critique` · `/audit` · `/polish` · `/distill` · `/harden` · `/clarify` | **SOLO** si quieres invocar sub-comandos como slash cortos (`/shape` en vez de `/impeccable shape`). | ⚠️ **Contraindicado asumir que existen por defecto.** `/shape`, `/craft`, `/critique`, `/polish`, `/audit`, `/distill`, `/harden`, `/clarify` **NO existen como slash autónomos** salvo que los pinees antes con `pin.mjs`. En el casco, llama siempre `/impeccable <sub>`. |
| **Taste Skill (design-taste-frontend)** | *(no slash-invocable — se dispara por propósito)* | **Gatekeeper de tells / anti-slop** sobre el HTML generado. La IA la lee al detectar front-end de marca/landing/redesign. Pre-Flight Check de ~60 casillas. | **No existe `/design-taste-frontend` ni `/taste-skill`.** No inventes comando. ⚠️ **Tensión documentada:** su propio `SKILL.md §8` declara *"Not dashboards, not data tables, not multi-step product UI"*; un *product app shell* está en el borde de ese out-of-scope. Por ello se aplica como gatekeeper de **tells y bans** (em-dash ban, eyebrow restraint, paleta premium-consumer ban, anti-center-bias, layout-repetition ban) y NO se aplican linealmente sus prescripts de landing/hero. *(El catálogo del usuario la llama "Taste Skill"; `design-taste-frontend` es la skill instalada resultante.)* **Diales recomendados para ESTE casco** (override del baseline `8/6/4` del SKILL, justificado por design-read Apple-y / mountain-refuge / mobile): `DESIGN_VARIANCE 7 · MOTION_INTENSITY 5 · VISUAL_DENSITY 3`. Son una **inferencia razonable, NO un preset canónico** del SKILL: el preset "Premium consumer" del SKILL es `7/6/3` y "Portfolio (Developer)" es `6/5/4`; `MOTION=5` no aparece exactamente en ningún preset. Si duda, respete `7/6/3` (Premium consumer) como referencia canónica más cercana. Eyebrow cap: máx 1 eyebrow por cada 3 secciones. |
| ⚠️ **awesomedesign.md (design-md)** | `/design-md [brand]` · `/design-md apple` · `/design-md airbnb` · `/design-md` (sin arg = recomienda 4-6 opciones) | **SOLO si decides conscientemente** adoptar un DESIGN.md externo de marca probada (74 marcas en `~/.claude/skills/design-md/collection/design-md/`, con carpetas `apple` y `airbnb` verificadas). Ejecutar **antes** de `/impeccable craft` para que el casco se construya sobre ese DESIGN.md. | ⚠️ **CONTRAINDICADO por defecto:** `GuestHub/DESIGN.md` ya existe y es la instancia de marca PROPIA del proyecto. `/design-md apple`/`airbnb` mostraría **diff + confirmación** (el SKILL flow paso 3 **NO** sobrescribe en silencio: copia el `DESIGN.md` de la colección al project root solo tras aceptar el diff). Al aceptarla, **COPIARÍA** su DESIGN.md al project root, **sobrescribiendo `GuestHub/DESIGN.md`** con la definición de marca externa canónica de la colección y rompiendo la adaptación al territorio Chillán. Por defecto **NO lo invoques**; carga tu DESIGN.md propio vía el loader de Impeccable. Update de la colección: `git -C ~/.claude/skills/design-md/collection pull`. |
| **Playwright CLI** | `npx playwright screenshot <url> out.png` · `... --viewport-size=375,812` · `... --viewport-size=390,844` · `... --device="iPhone 15"` · `... --full-page --wait-for-timeout=3000` · `... --color-scheme=dark` · `npx playwright pdf <url> out.pdf` · `npx playwright codegen <url>` · `npx playwright open <url>` · `npx playwright test` · `npx playwright install <browser>` | **Gate final de QA visual.** Captura cada uno de los 8 HTML a viewport mobile y valida el checklist de §8. Ver §8 para rutas `file://`/server estático. | **Siempre `npx playwright`** (el binario global no está en PATH; npx lo resuelve sin descargar). Solo Chromium instalado por defecto (Firefox/WebKit requieren `npx playwright install <browser>`). |
| **Ruflo Swarm** (opcional) | `/ruflo-swarm:swarm` · `/ruflo-swarm:watch` · `npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized` · `npx @claude-flow/cli@latest swarm init --topology hierarchical-mesh --max-agents 15 --strategy specialized` · `npx @claude-flow/cli@latest swarm status` · `npx @claude-flow/cli@latest swarm health` · `npx @claude-flow/cli@latest swarm shutdown` · `npx @claude-flow/cli@latest swarm watch --stream` | **SOLO si paralelizas** el workflow en múltiples agentes (uno tokens, otro componentes, otro navegación). Requiere plugin `ruflo-core` (servidor MCP). | ⚠️ **Contraindicado para el casco por defecto** (HTML único, mobile-first) — es sobre-ingeniería salvo paralelización real. Flags CLI verificados: **solo** `--topology`, `--max-agents`, `--strategy`. ⚠️ `--consensus raft` y `--memory hybrid` **NO están verificados** como flags CLI (son settings conceptuales del README); no los uses sin confirmar con `npx @claude-flow/cli@latest swarm init --help`. `/ruflo-swarm:swarm-init` y `/ruflo-swarm:monitor-stream` **NO existen como slash** (son skills internas). |

### 6.B Secuencia de ejecución numerada (orden exacto de llamados)

Sigue este orden. Cada comando es copiable tal cual.

**FASE 0 — Alineación (sobre lo EXISTENTE, antes de generar):**
1. **(N/A para este proyecto)** `obsidian read file="D_Fundamentos_Diseno_APPLE copy"` — se omite: la nota Apple **es archivo en disco** (`/Users/josetomasayala/Desktop/Skills/D_Fundamentos_Diseno_APPLE copy/APPLE_LIKE_DESIGN_FOUNDATION.md`, ver §2). Haz `Read` directo en su lugar. *(Reservado solo si verificas que la nota vive en un vault de Obsidian con la app abierta.)*
2. `/graphify /Users/josetomasayala/Desktop/Skills/GuestHub --no-viz` — construye el grafo de alineación sobre lo **existente** (maestro, design, css, hojas `[EXISTS]`). Omite HTML (solo `graph.json` + `GRAPH_REPORT.md`). Considera `--directed` para modelar dependencias tokens→componentes→pantallas.
3. **(Solo si editaste archivos puntuales tras el paso 2)** `/graphify /Users/josetomasayala/Desktop/Skills/GuestHub --update` — refresh incremental (requiere `graphify-out/` previo).
4. `/graphify query "¿Cada componente vacío referencia un token declarado? ¿La navegación esqueleto cubre ES/PT/EN? ¿Hay fugas de contenido real en los [EXISTS]?"` — fast-path (ya existe `graph.json`) para validar consistencia antes de generar. Variantes: `--dfs` para trazado puntual, `--budget 1500` para tope de tokens.

**FASE 1 — Disciplina mínima (Ponytail va PRIMERO en cada decisión de implementación):**
5. `/ponytail:ponytail full` — activa la escalera YAGNI→stdlib→native→one-line→minimum antes de generar. Marca cada simplificación con comentario `// ponytail: <decisión, techo, upgrade path>`. *(Si el slash directo `/ponytail` funciona en tu sesión, es equivalente; si no resuelve, usa `/ponytail:ponytail`.)*

**FASE 2 — Forma del shell (antes de escribir HTML):**
6. `/impeccable teach` — **solo si** `PRODUCT.md`/contexto de producto falta o está vacío (el casco es diseño+estructura, sin contenido: registra marca Guest Hub, registro Brand, anti-references). Si el loader ya carga `GuestHub/DESIGN.md` y `GRAPHIFY_MAESTRO.md`, sáltate este paso.
7. `/impeccable shape "casco HTML Andes Chillán: shell + tokens + componentes vacíos + navegación esqueleto + placeholders tipados, mobile-first, ES/PT/EN"` — planea la UX/UI del app shell.

**FASE 3 — Implementar el casco (orden topológico de §4):**
8. Implementa siguiendo el orden de §4: extender `css/styles.css` (respeta existentes + añade `tabular-nums`, grilla 8px, motion tokens, clases `[NUEVO]`) → App Shell + i18n (`lang.js` con todas las keys como placeholders tipados) → biblioteca de componentes → `index.html` + 7 hojas HTML. **Aplica la regla de purga de §4 a TODO `[EXISTS]`** (incluido `cafe.html`/`emergencias.html`): preserva tokens/clases, vacía contenido real a placeholders, elimina `onclick`/copy de marketing.
9. `/ponytail:ponytail-review` — tras **cada bloque** generado (shell, tokens, componentes), caza dependencias innecesarias, abstracciones de una sola implementación, stdlib reinventado, dead code.

**FASE 4 — Gatekeeper de tells + refino:**
10. **design-taste-frontend** *(carga por propósito, NO slash)* — aplica diales (`DESIGN_VARIANCE 7 / MOTION_INTENSITY 5 / VISUAL_DENSITY 3`, inferencia; referencia canónica más cercana `7/6/3` Premium consumer) y el Pre-Flight Check de ~60 casillas al HTML generado, **enfocado en tells/bans** (jerarquía, eyebrow ≤ ceil(sectionCount/3), bans: em-dash en copy, Inter default sin razón, 3 cards idénticas, paleta beige/cream/brass premium-consumer, gradient text, div-fake-screenshots). ⚠️ Recordatorio: su `SKILL.md §8` declara out-of-scope los *product UI / app shells*, así que aplica como gatekeeper de tells, no como prescript de landing/hero.
11. `/impeccable craft "casco HTML Andes Chillán"` — shape-then-build end-to-end (tras confirmar el plan de `shape`).
12. `/impeccable audit` — a11y, perf, responsive, anti-patterns del casco.
13. `/impeccable critique` — UX review con scoring heurístico (Nielsen).
14. `/impeccable polish` — refino final (contraste, espaciado, alineación).
15. `/impeccable harden` — i18n ES/PT/EN, edge cases, text overflow, error/empty states de los placeholders tipados.
16. `/impeccable clarify` — microcopy de navegación y labels.

**FASE 5 — QA visual (gate final):**
17. Para **cada uno de los 8 HTML** (Home + 7 hojas):
    ```bash
    # Opción A: server estático para que css/js relativos resuelvan
    python3 -m http.server 8000 --directory /Users/josetomasayala/Desktop/Skills/GuestHub
    npx playwright screenshot --viewport-size=375,812 http://localhost:8000/<modulo>.html out-<modulo>.png
    # Opción B: rutas file:// absolutas si el casco no depende de fetch/import
    npx playwright screenshot --viewport-size=375,812 "file:///Users/josetomasayala/Desktop/Skills/GuestHub/<modulo>.html" out-<modulo>.png
    # Modo oscuro (validar fotos de fondo + cards sobre cada página)
    npx playwright screenshot --viewport-size=390,844 --color-scheme=dark http://localhost:8000/<modulo>.html out-<modulo>-dark.png
    ```
    Viewport 375×812 simula QR/phone. Valida el checklist de §8 sobre la captura. **Gate duro:** si el squint test muestra cajas/botones estériles dominando → **rechazar y reiterar**.

**FASE 6 — (OPCIONAL) Orquestación multi-agente Ruflo Swarm:**

> Solo si paralelizas el build. Si no, **ignora esta fase** y sigue 1–17 en un solo agente: no hay pérdida de calidad, el swarm es una optimización de tiempo, no un gate.

1. Inicializa el swarm con el comando canónico **exactamente como está** (sin flags inventados):
   ```bash
   npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized
   ```
   > Solo `--topology`, `--max-agents`, `--strategy` están verificados como flags CLI. ⚠️ **NO añadas** `--consensus raft` ni `--memory hybrid` (no existen como flags; fallarían o serían ignorados). Si dudas, corre antes `npx @claude-flow/cli@latest swarm init --help`.
2. Coordinación de agentes — mecanismo verificado, en este orden de preferencia:
   - **(Preferido)** `TeamCreate` crea el equipo → spawnea cada agente con la herramienta `Agent` (`isolation: "worktree"`, git-safe, cada agente en su propio worktree) → `SendMessage` para mensajería inter-agente (agentes nombrados) → `TaskCreate`/`TaskList`/`TaskUpdate` como tracker compartido → `Monitor` con `persistent: true` para wake signals.
   - **(Alternativa simple)** herramienta `Task` con `run_in_background: true` para ejecución paralela sin equipo formal.
   - **(Fallback robusto)** si `claude-flow` no resuelve vía npx cold-fetch o no tienes `TeamCreate`/`Agent`: ejecuta el orden topológico de §4 en un solo agente, secuencialmente. No hay pérdida de calidad.
3. Reparto sugerido: **A1 Tokens/CSS** (extiende `styles.css`, respeta existentes, añade `tabular-nums`) · **A2 App Shell/Layout/i18n** (`.app-container` + `lang.js` con todas las keys) · **A3 Biblioteca de Componentes** (los 9 `[NUEVO]` como markup, glassmorphism quirúrgico, **NUNCA** blur sobre tabular) · **A4 QA Visual/Playwright** (arranca al final; captura los **8 HTML** canónicos — no cafe/emergencias). Memoria compartida en namespace `swarm-state` (kebab-case; nunca sombrear `pattern`/`claude-memories`/`default`).
4. Stream en vivo: `npx @claude-flow/cli@latest swarm watch --stream` (o slash `/ruflo-swarm:watch`). Shutdown: `npx @claude-flow/cli@latest swarm shutdown`.

**Regla de em-dash (acotada, coherente con Foundation §6.4 y GRAPHIFY_MAESTRO §7.5):**
- **PROHIBIDO** el em-dash `—` como separador tipográfico en UI **copy** (títulos, bullets, frases, eyebrows). Usa hyphen `-`.
- **EXCEPCIÓN explícita y obligatoria:** el em-dash `—` **SIEMPRE** se usa como marcador semántico de **valor numérico ausente** en campos tabulares (precio, °C, cm, horario), en gris claro, nunca 0 ni vacío. Esta excepción no es opcional: sin ella los campos vacíos rompen la alineación tabular.

---

## 7. GUARDRAILS DE PUREZA (diseño + estructura únicamente)

1. **Alcance autorizado:** tokens, app shell, componentes vacíos con clases correctas, layout, navegación esqueleto, placeholders tipados, esqueleto i18n.
2. **Contenido prohibido (match-and-refuse):** cero texto real de bienvenida, cero datos de restaurantes/actividades, cero horarios/precios/°C/cm, cero links externos de producción, cero teléfonos/SSID/copy marketing, **cero nombre real de servicio externo como texto visible del link** (no "Snow Forecast", no "Google Maps", no "WhatsApp" en el copy del componente). **Incluye purgar el contenido real ya presente en disco** (copy de `cafe.html`, alertas y `onclick` de `emergencias.html`) — ese estado con datos reales es de prototipo y viola el guardrail; no se preserva contenido, solo estructura/clases (ver §4 regla de purga).
3. **Convención de placeholders (uniforme, obligatoria):** formato `[PLACEHOLDER: <tipo> <descripción corta>]` — ej. `[PLACEHOLDER: título módulo]`, `[PLACEHOLDER: precio CLP]`, `[PLACEHOLDER: url Google Maps]`, `[PLACEHOLDER: nombre servicio externo]`, `[PLACEHOLDER: teléfono WhatsApp]`, `[PLACEHOLDER: SSID wifi]`. **El texto visible del link también es placeholder** (`[PLACEHOLDER: nombre servicio externo]`), no el nombre real del servicio. Renderízalos visibles con clase `.ph` (color `--rock`, opacidad 0.5) para que el casco se vea poblado pero inequívocamente como esqueleto. En `lang.js`, los values del diccionario son esas mismas etiquetas tipadas. Comentario `<!-- TODO: rellenar contenido real de módulo N antes de producción -->` al inicio de cada hoja. Valores numéricos ausentes: em-dash `—` en gris claro (excepción de §6), nunca 0 ni vacío. **Prohibido** lorem ipsum, `xxx` o campos literalmente vacíos.
4. **Sin frameworks/build:** HTML + CSS vainilla, un `styles.css` compartido, un `lang.js` plano. Sin Tailwind/Bootstrap/React/Vue, sin build step, sin npm install. i18n con `data-i18n` + `localStorage` + fallback ES.
5. **Ponytail en cada decisión:** pregunta crítica antes de cada elemento: *"¿Esto necesita existir para que la carcasa de diseño funcione?"* Si no, se corta. Rama C Staff: solo stub `.gitkeep`/README, sin HTML, sin desarrollo. `cafe.html`/`emergencias.html`: fuera del conteo canónico (ver §4); por defecto no se generan ni enlazan.

---

## 8. CRITERIOS DE CALIDAD / GATES

El casco pasa solo si cumple **todos** estos gates (checklist Graphify §9 + Foundation §18 + design-taste pre-flight):

- **Propósito obvio en 5s:** al abrir cada HTML se entiende qué es sin leer texto.
- **Squint test:** el contenido (aunque sean placeholders) es la masa visual principal; las cajas/botones NO dominan. Si el casco se ve estéril o dominado por cajas vacías → rechazar y reiterar.
- **Densidad de aire:** márgenes/paddings 24-32px respetados; no apiñado.
- **Tabular-nums:** presente en todo campo numérico tipado.
- **Squircle:** fórmula de anidación (interno = externo − padding) correcta en cards/botones/icon-box.
- **Color semántico @10-15%** (nunca saturado a área completa) + **jerarquía por opacidad** (`--night` > `--rock` > devaluadas).
- **Contraste WCAG:** AA body (4.5:1) / AAA hero; compensar `maximum-scale=1`. Glassmorphism nunca sobre texto tabular.
- **Shape Consistency Lock:** UNA escala de corner-radius por página.
- **Anti-slop:** cero em-dash como separador en UI copy (la excepción de valor numérico ausente de §6 no cuenta), eyebrow ≤ ceil(sectionCount/3), sin paleta premium-consumer genérica (beige/cream/brass), sin gradient text, sin side-stripe borders, sin grids de cards idénticas.
- **i18n:** `data-i18n` en toda cadena; selector persistente; fallback ES.
- **Calma visual 50/50 sutil:** fondo frío + acentos cálidos, NO pantalla partida.
- **Sin fugas de contenido:** `grep -rE "Google Workspace|agua caliente|Tienda Café|Snow Forecast|Google Maps|WhatsApp" GuestHub/*.html` devuelve cero hits en los 8 HTML canónicos tras el build (todo a placeholders).

**Verificación visual con Playwright (gate final):** ver FASE 5 (paso 17) de §6.B para los comandos exactos por viewport y modo oscuro.

---

## 9. FORMATO DE SALIDA

Entrega:
1. **`css/styles.css`** completo (`:root` con tokens canónicos + capas faltantes + clases `[NUEVO]` + `tabular-nums` + motion tokens).
2. **`js/lang.js`** (diccionarios `{es,pt,en}` con todas las `data-i18n` keys como placeholders tipados, `localStorage`, fallback ES).
3. **8 HTML** (index.html como hub + 7 hojas) con `.app-container`, `.header` + `.btn-back`, componentes correctos y placeholders tipados visibles. Rama C `/staff/` solo como stub `.gitkeep`/README, sin HTML. `cafe.html`/`emergencias.html` fuera del conteo canónico (ver §4).
4. **Resumen de cierre (máx 10 líneas):** qué skills se invocaron y en qué orden (según §6.B), qué se generó vs qué quedó como placeholder, resultado del QA visual con Playwright (gates cumplidos/fallidos), y upgrade paths documentados con comentarios `// ponytail:`.

Código primero, luego el resumen. Cero prosa de más. Cero contenido inventado.