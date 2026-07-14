# CordalSur — Fundamentos

> Documento de fundamentos: qué es, cómo funciona, cómo mantenerlo, y por qué cada decisión técnica existe. Si solo querés abrir el proyecto, lee el [README.md](README.md) (quick start). Si querés entenderlo, seguí leyendo.

---

## 1. ¿Qué es esto?

Es la **landing page de un hospedaje en el Valle Las Trancas, Chile** (región de Ñuble, camino a Nevados de Chillán). El hospedaje es un Airbnb/departamento y la landing es la guía de llegada + servicios del destino: cómo llegar, dónde comer, dónde abastecerte, qué hacer, clima en vivo, etc.

La URL final de la landing es el `index.html` en la raíz. Cada `*.html` es una pantalla accesible directamente (sin router, sin SPA):

| Pantalla | Archivo | Para qué sirve |
|---|---|---|
| Hub / inicio | `index.html` | Presentación del hospedaje, accesos directos a las otras secciones |
| Cómo llegar | `check-in.html` | Instrucciones de llegada, dirección, puerta, parking |
| Cómo irse | `check-out.html` | Instrucciones de salida, llaves, basura |
| Dónde comer | `restaurantes.html` | Comida y provisiones (restaurantes, cafés, panaderías, supermercados) con filtros |
| Qué hacer | `actividades.html` | Nieve, termas, senderos, bici, aventura, servicios con filtros |
| Clima | `clima.html` | Widget del tiempo en vivo (Open-Meteo + fallback) |
| Tickets de ski | `tickets.html` | Link al resort |
| Manual del depto | `instrucciones.html` | Wi-Fi, calefacción, reglas |

Hay 8 pantallas en total. Son 8 HTMLs independientes que comparten CSS y JS.

## 2. Principios de diseño (no negociables)

### 2.1 Sin framework, sin build, sin npm

- **No** React, Vue, Svelte, Next, Gatsby, ni nada similar.
- **No** Tailwind, Sass, ni pre-procesadores.
- **No** bundler, transpiler, ni `node_modules`.
- **No** backend, base de datos, ni servidor.

Razón: el hospedaje es un negocio pequeño. El dueño del depto **no** es desarrollador. Cada dependencia que agrego es una dependencia que puede romperse en 3 años, que requiere actualizaciones, que ocupa espacio, y que hace que un freelancer cualquiera no pueda mantener la página. La página tiene que sobrevivir 5+ años sin mantenimiento técnico significativo. Para eso, la página tiene que ser **lo más simple posible**.

La interfaz sigue siendo HTML/CSS/JavaScript estático y se sirve por HTTP desde
GitHub Pages. El control de acceso y el calendario consultan un Cloudflare
Worker, por lo que producción necesita conexión a internet; no existe un build
step para la interfaz.

### 2.2 Mobile-first

- El huesped típico es alguien que está volando a Santiago, manejando 5 horas a Las Trancas, llega cansado al depto a las 10pm, abre el celular, escanea el QR del welcome card y necesita: Wi-Fi, código de puerta, dónde pedir delivery ahora. **Todo eso tiene que caber en una pantalla de 6.5 pulgadas con luz baja**.
- Diseño mobile-first, después se mejora para desktop. NO al revés.
- Botones táctiles ≥ 44×44px. Texto ≥ 16px. Inputs con `font-size: 16px` (para que iOS no haga zoom-in en focus).

### 2.3 Trilingüe (ES/PT/EN)

- **ES** es el idioma principal. Es el huésped más común (Chile, Argentina, Brasil hispanohablante).
- **PT** es el segundo más común. Es el mercado brasileño grande (São Paulo, Río).
- **EN** es el tercero. Para turistas de USA/EU.

El copy global vive en `data/host-data.json#scalar`; el copy específico de cada
ficha vive en los registros localizados de restaurantes y actividades. El
generador materializa ambos en `js/lang.js`. El texto español presente en HTML
es un fallback progresivo: cada nodo traducible usa `data-i18n*` y queda
localizado antes de liberar la interfaz. Esto se valida en el `Gate 2`.

### 2.4 Datos del host, no del sistema

- Hay datos que el **dueño** del hospedaje controla y son sensibles (código de puerta, Wi-Fi password, teléfono personal, ratings de Tripadvisor). El resto son datos del **sistema** (textos de UI, color del tema, traducciones). Mezclar ambos significa que cualquier cambio de un dato del dueño requiere tocar el código.
- La división es: `data/host-data.json` es la **única** fuente de datos del host. Todo lo demás es código del sistema.
- El script `apply-host-data.mjs` propaga `data/host-data.json` → `js/lang.js` + HTML regenerado. El dueño puede editar `data/host-data.json` y correr el script; no toca el código.
- Datos sensibles del host (código de puerta, Wi-Fi) **nunca** se inventan: si no están en el JSON, el UI muestra `[TODO(host): ...]` en gris italic, esperando que el host los complete.

### 2.5 Estética: refugio de montaña moderno

- **Tono visual**: sobrio, premium, moderno. NO folleto turístico con emojis y fondo con olas. NO "página web de restaurante" con 15 fotos de stock.
- **Paleta**: 50/50 invierno/verano. Invierno (snow/ice): #F7FAFC, #DDEAF3, #12344D, #0B2538. Verano (forest/earth): #1F4D3A, #B7793E. Acentos cálidos para los CTA: #C46A3A.
- **Tipografía**: Inter (una sola familia). 700-800 para títulos (tight letter-spacing), 400 para body.
- **Iconografía**: emoji unicode (🍽️, 📍, 📷) o SVG inline para los logos de marca (Google Maps, Instagram). NO icon fonts, NO sprite sheets.
- **Sombras**: 3-10% opacity, nunca duras. La profundidad es por sombra, no por gradiente.
- **Animaciones**: ≤ 300ms ease-out, sin bounce. Respeto `prefers-reduced-motion`.

Los detalles de diseño están documentados en `docs/DESIGN.md` y los tokens están en `css/styles.css#:root`.

## 3. Arquitectura técnica

### 3.1 Stack

- **HTML** estático, escrito a mano, sin templating.
- **CSS** plano en un solo archivo `css/styles.css`. Custom properties (variables CSS) en `:root` para los tokens de diseño.
- **JS** plano en 3 archivos: `lang.js` (i18n), `restaurants.js` y `activities.js` (filter bars). ES5 (no arrow functions, no classes, no modules). Compatible con navegadores viejos.
- **Node script** (`scripts/apply-host-data.mjs`) para regenerar HTML desde los datos. Plain Node, sin dependencias, sin npm install.

### 3.2 Flujo de datos

```
data/host-data.json
        │
        ▼ (node scripts/apply-host-data.mjs)
        │
        ├─→ js/lang.js          (i18n: scalar keys + per-listing keys)
        ├─→ restaurantes.html   (@LISTINGS: JSON + cards)
        ├─→ actividades.html   (@LISTINGS: JSON + cards)
        └─→ (valida con node -c)
```

El script:
1. Lee `data/host-data.json`.
2. Para cada `key` en `data.scalar`, hace `setKeyInBlock` en `js/lang.js` (3 langs: ES/PT/EN).
3. Para cada restaurant/activity con `status: "publicar"`, emite un `<script type="application/json">…</script>` con el array de items, y un set de `<article>` cards dentro de `@LISTINGS`.
4. Valida `js/lang.js` con `node -c` antes de salir (cualquier typo de sintaxis mata el script).

### 3.3 Filter bar (cómo funciona la búsqueda interactiva)

`restaurantes.html` y `actividades.html` tienen una filter bar en la parte superior. El flujo es:

1. El script `apply-host-data.mjs` emite:
   - Un `<div id="rest-filter-bar">` con botones (`data-filter="restaurante"`, `data-filter="café"`, etc.)
   - Un `<script type="application/json" id="restaurants-data">` con el array de items
   - Un set de `<article class="rest-card" data-categories="restaurante bar">` (uno por item)

2. El archivo `js/restaurants.js` lee el JSON, construye los items, y hace:
   - `applyFilter('all')` inicial: muestra todos los cards
   - Click en un botón del filter bar: filtra los cards por `data-categories`
   - El contador `#rest-filter-count` muestra "X / Y" (visibles / total)

La idea es: **sin JS, todos los cards se ven** (progressive enhancement). El filter bar es solo una mejora. Si el JS falla o el usuario tiene JS desactivado, la página sigue siendo navegable.

### 3.4 i18n sin framework

`js/lang.js` es un solo IIFE (immediately-invoked function expression) que define un objeto `I18N` con 3 keys top-level (es/pt/en) y cada uno un objeto plano de strings. El script `apply-host-data.mjs` hace `setKeyInBlock` para mutar las keys en su lugar.

En el HTML, los elementos traducibles tienen `data-i18n="key"`. La función `apply(lang)` de `js/lang.js` itera todos los `[data-i18n]` y los reemplaza con el valor del dict. Se llama con el idioma del localStorage (default ES).

Para el selector de idioma, hay un `<div class="lang-selector">` con botones `data-lang="es"`, `data-lang="pt"`, `data-lang="en"`. Click → `setLang(lang)`.

## 4. Sistema de diseño (design system)

Los tokens viven en `css/styles.css#:root`. Los más importantes:

```css
:root {
  --snow:      #F7FAFC;  /* fondo principal (invierno) */
  --ice:       #DDEAF3;  /* fondo sutil, tints */
  --deep-blue: #12344D;  /* texto principal, headers */
  --night:     #0B2538;  /* texto alto contraste */
  --forest:    #1F4D3A;  /* acento verano */
  --wood:      #B7793E;  /* acento cálido */
  --copper:    #C46A3A;  /* CTAs, alertas */
  --rock:      #5A626C;  /* texto muted */

  --card-bg:      rgba(255, 255, 255, 0.92);
  --shadow-soft:  0 12px 35px rgba(18, 52, 77, 0.10);
  --shadow-lift:  0 18px 44px rgba(18, 52, 77, 0.16);

  --radius-sm:  14px;
  --radius-md:  20px;
  --radius-lg:  28px;
  --radius-pill: 999px;

  --motion-snap:  150ms ease-out;
  --motion-slide: 300ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

Reglas de uso (NO negociables):
- **Spacing**: grid 8px. `padding`, `margin`, `gap` siempre múltiplos de 4 u 8.
- **Typography**: 1 familia (Inter), 4 pesos (400/600/700/800). Letter-spacing tight en títulos (-0.02em), normal en body.
- **Sombras**: 3-10% opacity. La profundidad es por sombra, no por gradiente.
- **Border-radius**: solo 4 valores canónicos (sm/md/lg/pill). No valores custom.
- **Colores**: solo tokens. NO hex literales en CSS.
- **Motion**: solo 2 easings (snap, slide). Sin bounce. Sin paralax. Sin rotación.

## 5. Estructura del proyecto

```
CordalSur/
├── README.md                    ← quick start (cómo regenerar, estructura)
├── index.html                   ← home / hub
├── admin.html                   ← calendario privado de estadías
├── check-in.html
├── check-out.html
├── actividades.html
├── clima.html
├── tickets.html
├── instrucciones.html
├── restaurantes.html
│
├── css/
│   ├── styles.css               ← único stylesheet, todos los tokens aquí
│   ├── access.css               ← acceso de huéspedes + Administración
│   └── bg/                       ← fotos de fondo por página (CC0/Unsplash)
│
├── js/
│   ├── lang.js                  ← i18n ES/PT/EN (un solo archivo, todos los strings)
│   ├── access.js                ← validación de sesión de huésped o administrador
│   ├── admin.js                 ← calendario de estadías
│   ├── whatsapp.js              ← mensaje localizado al anfitrión
│   ├── restaurants.js            ← filter bar de restaurantes.html
│   └── activities.js             ← filter bar de actividades.html
│
├── scripts/
│   └── apply-host-data.mjs       ← propaga data/host-data.json → lang.js + HTML
│
├── data/
│   ├── host-data.json            ← ÚNICA fuente de datos del host (NO tocar desde código)
│   ├── host-data.sample.json     ← fake data para dry-runs
│   └── .baseline/                ← 15 snapshots canónicos + 4 aliases verificados
│
├── docs/                         ← constitución del proyecto
│   ├── DESIGN.md                 ← tokens, typography, grid
│   ├── GRAPHIFY_MAESTRO.md       ← arquitectura por módulo
│   ├── CHANGELOG.md              ← qué hay en cada versión
│   └── PROMPT_CASCO_HTML.md      ← el prompt histórico que generó el casco
│
├── tests/
│   └── verify-gates.sh          ← corre los 5 gates de no-regresión
│
├── worker/                       ← API Cloudflare + D1, migración y tests
└── staff/README.md               ← stub para Rama C (futuro)
```

## 6. Cómo mantener el proyecto

### 6.1 Actualizar datos del host

El dueño (o el operador) edita `data/host-data.json` con la info que cambió. Por ejemplo:
- Horario de un restaurant
- Teléfono de un supermarket
- Nuevo local para recomendar
- Nuevo texto del welcome message

Después corre:
```bash
node scripts/apply-host-data.mjs . data/host-data.json
```

Y revisa con:
```bash
bash tests/verify-gates.sh
```

El script regenera `js/lang.js` y el bloque `@LISTINGS` de los HTMLs. El dueño no toca código del sistema.

### 6.2 Cambiar estética

Los tokens de diseño están en `css/styles.css#:root`. Si necesitás cambiar un color, un radio, una sombra, ese es el único lugar. No hay un sistema de "tema" — hay una sola hoja de estilos y un solo set de tokens.

Si necesitás un componente nuevo, agregalo en `css/styles.css` con la convención `ponytail: <decisión>` como comentario. El estilo nuevo sigue el mismo set de tokens.

### 6.3 Cambiar lógica de filtros

Los filtros viven en `js/restaurants.js` y `js/activities.js`. Son 2 archivos chiquitos (~50 líneas cada uno). El filtro por categoría es un `data-categories` en el HTML, y el JS lee el atributo y muestra/oculta según el botón.

Para cambiar la lógica de filtrado (sort, multi-select, etc.) se modifica el JS. No se toca el HTML.

### 6.4 Versionar

El proyecto usa git (subdirectorio `.git/`). Convención de commits:
- `feat: ...` — nueva feature
- `fix: ...` — bug fix
- `chore: ...` — cleanup, no functional change
- `docs: ...` — solo documentación
- `refactor: ...` — refactor sin cambio de comportamiento

NUNCA:
- `Co-Authored-By: ...` trailer
- merge commits con historia larga
- force push a main

## 7. Decisiones que parecen raras pero son intencionales

### 7.1 Por qué `lang.js` tiene 3000 líneas

`lang.js` tiene TODOS los strings de TODA la landing en 3 idiomas. Sí, es grande. Pero:
- Está en un solo archivo, fácil de buscar y traducir.
- Cada cambio en un string es local.
- Cualquiera con un editor de texto puede traducir (no necesita framework).

La alternativa (3 archivos separados, lazy loading, tree shaking) agrega complejidad sin valor para un proyecto de 8 páginas. Si esto creciera a 50+ páginas, consideraría separar.

### 7.2 Por qué el script `apply-host-data.mjs` está en ESM con `<script type="application/json">` inline

`restaurantes.html` emite un JSON dentro de `<script type="application/json">` con los datos de los restaurants. Esto le permite a `restaurants.js` (un script `<script src="...">`) leer los datos y renderizar los cards sin un server.

La alternativa (usar `fetch()` para cargar un JSON externo) requiere un server. La inline no requiere. La "desventaja" es que el JSON se duplica en el HTML (visible + data), pero la duplicación es ~50KB en 28KB = trivial.

### 7.3 Por qué las imágenes son JPG + WebP (no solo WebP)

`css/bg/` tiene tanto `.jpg` como `.webp` para cada imagen. El script podría elegirlas según soporte del navegador, pero eso requiere `<picture>` + JS. Por simplicidad, dejamos JPG: el `<picture>` element elige WebP automáticamente solo si la fuente es WebP con fallback JPG. No estamos usando `<picture>`.

Si el ancho de banda importa (no debería, en el hospedaje el huesped está conectado a Wi-Fi de la casa), migrar a WebP solo. Si no, JPG es más simple y universal.

### 7.4 Por qué hay staff/ si no hay nada construido

`staff/README.md` es un placeholder para la futura Rama C (housekeeping, inventario, checklists). El hospedaje podría necesitar un módulo interno para que la persona que limpia el depto marque "limpio" o el operador registre inventario. La estructura del proyecto ya está pensada para que `staff/` crezca sin afectar la `rama guest`. Cuando se construya, las páginas de staff usan `../css/styles.css` y `../js/lang.js` para compartir el sistema de diseño.

Por ahora `staff/README.md` está vacío. La baseline lo incluye porque es parte del snapshot congelado de los archivos canónicos.

## 8. Decisiones de scope (qué NO está construido)

- **No hay CMS**: el dueño no edita la página en un browser. Edita `data/host-data.json` en su editor y corre el script. Es 1 vez por mes.
- **No hay analytics**: no hay tracking de clicks, no hay Google Analytics, no hay Plausible. Si el dueño quiere saber qué páginas se ven, lo agrega después. Por ahora cero tracking.
- **No hay PWA / offline mode**: la página es HTML puro, no service worker, no manifest. El huesped tiene Wi-Fi.
- **No hay búsqueda global**: 8 páginas, navegación con botones. No hay buscador.
- **No hay comentarios / reseñas**: la landing no es un marketplace. Es info del hospedaje, no reseñas.
- **No hay chat / contacto en tiempo real**: el botón de WhatsApp es un link `https://wa.me/...` que abre WhatsApp. No hay chat embebido.

## 9. Próximos pasos posibles (no planeados activamente)

1. **Filtros sticky al scrollear**: el filter bar se queda fijo en el top cuando scrolleas. Posible con `position: sticky` (ya implementado en parte).
2. **Mapas embebidos**: un mini-mapa en `check-in.html` mostrando dónde está el depto. Requiere API key de Google Maps (de pago) o usar Leaflet con OpenStreetMap (gratis).
3. **Module federation para staff/**: si staff/ crece, separar el bundle de JS de staff del de guest para que no se cargue cuando no se necesita.
4. **i18n dinámico**: cargar `lang.json` desde un server cuando hay cambios (en lugar de regenerar `js/lang.js`). Requiere server. Por ahora el script regenera estático.
5. **Imágenes optimizadas**: usar WebP con `<picture>`, lazy-loading, srcset para responsive images. La landing actual usa JPG a tamaño completo, lo que es OK en Wi-Fi pero subóptimo en cellular con datos.

Estos son nice-to-have, no requeridos. El proyecto está completo y funcional.

## 10. Cómo migrar esta carpeta a otro lugar

La carpeta `CordalSur/` es **autocontenida**. No tiene referencias hardcoded a paths absolutos fuera de sí misma. Para migrar a otro lugar:

1. **Copiar toda la carpeta** a otro directorio.
2. **Verificar permisos**: que el script `apply-host-data.mjs` sea ejecutable (en Linux: `chmod +x`).
3. **Verificar Node**: requiere Node.js v18+ (no es requisito de versión, solo v18+ funciona).
4. **Correr los gates**: `bash tests/verify-gates.sh`. Si todo pasa, está OK.
5. **No requiere npm install** ni dependencias. El script es plain Node, el sitio es plain HTML.

## 11. Referencias

- `README.md` — quick start, estructura, cómo regenerar
- `docs/DESIGN.md` — sistema de diseño detallado
- `docs/GRAPHIFY_MAESTRO.md` — arquitectura por módulo
- `docs/CHANGELOG.md` — historia de cambios
- `docs/PROMPT_CASCO_HTML.md` — el prompt que generó el casco
- `tests/verify-gates.sh` — 5 gates de no-regresión
- `AGENTS.md` (en el directorio padre `Skills/`) — convenciones globales del monorepo
