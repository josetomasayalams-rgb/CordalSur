---
id: GH-GRAPHIFY-001
type: information-architecture-map
status: active
project: Andes Chillán Guest Hub
location: Las Trancas / Nevados de Chillán
design_dna: APPLE_LIKE_DESIGN_FOUNDATION.md  (→ adaptado en DESIGN.md)
languages: [ES, PT, EN]
access: QR → Home
scope: carcasa base / blueprint — NO desarrollo de contenido final
created: 2026-06-29
---

# Graphify Maestro — Guest Hub Andes Chillán

Mapa lógico/visual del ecosistema HTML del Guest Hub (acceso por QR). Define la **carcasa** (arquitectura, navegación, módulos, componentes, reglas) para construir después cada HTML. Es un plano, no contenido final.

> **ADN obligatorio:** `D_Fundamentos_Diseno_APPLE copy/APPLE_LIKE_DESIGN_FOUNDATION.md` (15 principios + tokens). **Adaptación canónica al territorio:** `GuestHub/DESIGN.md`. Este mapa los respeta y aterriza; no los re-deriva.

Leyenda de estado por módulo: `[EXISTS]` ya construido en `GuestHub/` · `[TODO]` por construir.

---

## 1. Nodo central

```
        ┌─────────────────────────────────────────────┐
        │   🏔️  GUEST HUB · Andes Chillán              │
        │   Las Trancas / Nevados de Chillán           │
        │   Acceso:  QR  ──►  Home (index.html)        │
        │   ADN: Fundación Apple ▸ Refugio de montaña  │
        │   i18n: ES / PT / EN   ·   Mobile-first       │
        └─────────────────────────────────────────────┘
```

- **Qué es:** un único punto de entrada digital (QR físico en el depto) que desemboca en un **hub central** (Home). Todo módulo es una hoja a 1 nivel de profundidad desde el hub.
- **Principio rector:** *deferencia al contenido* + *calma visual*. El huésped busca resolver una necesidad concreta en <10s desde el escaneo. El diseño es el marco silencioso; la información útil es la protagonista.
- **Sensación:** refugio moderno de montaña, todo el año — descanso, aventura y comodidad. Estética 50/50 invierno/verano, **sutil** (no literal, no folleto turístico).

---

## 2. Ramas principales

Tres ramas troncales cuelgan del nodo central:

| Rama | Contiene | Color semántico |
|---|---|---|
| **A · Sistema & Fundación** | ADN visual, App Shell, i18n, Tokens, Biblioteca de componentes | Cian (estructura) |
| **B · Módulos Base** | Los 8 módulos orientados al huésped (1–8) | Verde (producto) |
| **C · Módulos Futuros** | Rama escalable Staff/Operación (9) — sin desarrollar | Púrpura (reserva) |

Nodos transversales (no pertenecen a una rama, rigen a todas): **Reglas de diseño**, **Flujo de navegación**, **Notas de implementación**.

---

## 3. Subnodos por módulo

### Rama B — Módulos Base

**1 · Home / Bienvenida** `[EXISTS=index.html]`
- Entrada principal desde QR. Accesos rápidos a todos los módulos.
- Selector de idioma **ES / PT / EN** (persistente). **`[TODO]`**
- Contacto rápido (WhatsApp/tel). Tag de temporada activa.
- Premium, simple, mobile-first. Es el único hub de navegación.

**2 · Check-in** `[EXISTS=check-in.html]`
- Llegada: acceso, estacionamiento, horarios, recomendaciones.
- Link Google Maps. Breve, visual, accionable.

**3 · Check-out** `[TODO]`
- Hora de salida, llaves, luces, ventanas, basura (si aplica).
- Mensaje amable + confirmación final.

**4 · Restaurantes** `[EXISTS=restaurantes.html]`
- Carcasa de fichas. Cada ficha: **nombre · tipo · ubicación · Maps · IG/web/carta · recomendación personal · precio aprox · ocasión ideal**.
- Componente: `FichaCard`.

**5 · Actividades** `[EXISTS=actividades.html]`
- Invierno: ski, snowboard, nieve. Verano: downhill, senderos, termas, trekking, familiar.
- Ordenable por **temporada · tipo de viaje · clima**. Componente: `FilterBar` + `FichaCard`.

**6 · Clima / Nieve** `[TODO]`
- Pronóstico de clima + nieve. Acceso directo a **Snow Forecast**.
- Simple, visible, útil. Priorizar links claros sobre exceso de datos.

**7 · Tickets / Ski** `[TODO]`
- Compra/revisión de tickets de ski.
- **Destaca en invierno**, discreto fuera de temporada (énfasis estacional en Home, no dominio global).

**8 · Información del Departamento** `[EXISTS=instrucciones.html]`
- Wi-Fi, calefacción, agua caliente, normas, emergencias, uso general.
- FAQ resuelta por progressive disclosure (`Accordion`).

### Rama C — Módulos Futuros

**9 · Staff / Operación** `[TODO · reservado]`
- Rama **escalable, no desarrollada**: mucamas, inventario, checklist, control de calidad, operación.
- Se deja la rama prevista para crecer sin tocar la arquitectura del huésped.

---

## 4. Componentes reutilizables

Anclados a `css/styles.css` (tokens únicos, sin frameworks). Se respetan las clases existentes; se añaden las marcadas `[NUEVO]`.

| Componente | Clase / Rol | Notas de diseño |
|---|---|---|
| **App Shell** | `.app-container` | `max-width:600px`, padding 24px, scroll suave. Marco silencioso. |
| **Card** | `.card` | Glassmorphism **sutil** (`rgba(255,255,255,.88)`, blur 12px). Radio 20px, `--shadow-soft`. Hover: lift −4px. |
| **Card Header** | `.card-header` + `.icon-box` | Icono 48px (radio 16) + título + subtítulo. |
| **IconBox** | `.icon-box.bg-winter\|.bg-summer\|.bg-warm` | Gradiente estacional. Emoji pragmático hoy; *upgrade path* a ícono outline 1.5px. |
| **Button** | `.btn.btn-forest\|.btn-wood\|.btn-outline` | Pill 999px, full-width mobile. Forest=primario, Wood=secundario. |
| **Back / Header** | `.btn-back` (pill 44px) | Navegación de retorno en cada hoja. |
| **Tag** | `.tag.tag-winter\|.tag-summer\|.tag-alert` | Info rápida: `[Invierno]`, `[Huésped]`. Color semántico @10–15% opacidad. |
| **Grid** | `.grid-2` | Sub-accesos pareados (ej. Actividades/Restaurantes). |
| **Language Selector** `[NUEVO]` | segmented `ES \| PT \| EN` | Persiste en `localStorage`, fallback ES. |
| **Season Tag** `[NUEVO]` | tag activo invierno/verano en Home | Gobierna énfasis de Tickets/Actividades. |
| **Quick Contact** `[NUEVO]` | barra WhatsApp/tel | Siempre visible desde Home. |
| **FichaCard** `[NUEVO]` | Card + campos estructurados | Restaurantes/Actividades (Maps, IG, precio, ocasión). |
| **FilterBar** `[NUEVO]` | filtros temporada/tipo/clima | Actividades. |
| **ExternalLinkRow** `[NUEVO]` | fila link externo | Snow Forecast, Maps, tickets ski. |
| **Emergency Card** `[NUEVO]` | Card accentuada `--copper` | Acción directa (tel). `[EXISTS` en index`]`. |
| **Accordion (FAQ)** `[NUEVO]` | progressive disclosure | Info del depto. |
| **Empty State** `[NUEVO]` | ilustración + CTA | Fichas sin dato aún. |

---

## 5. Reglas de diseño

De la fundación Apple, aterrizadas a Chillán vía `DESIGN.md`.

**Tokens de color (Invierno = base · Verano = acentos):**
- ❄️ Invierno: `--snow #F7FAFC` · `--ice #DDEAF3` · `--deep-blue #12344D` · `--night #0B2538`
- 🌲 Verano: `--forest #1F4D3A` · `--wood #B7793E` · `--rock #6B7280` · `--copper #C46A3A`

**Reglas no negociables:**
1. **Grilla 8px** — todo espaciado múltiplo de 4/8 (`--max-w 600px`, paddings 24, gaps 16/12).
2. **Tabular-nums** — todo número/fluctuante usa `font-variant-numeric: tabular-nums` (horarios, precios, °C, cm de nieve).
3. **Squircle** — radio interno = radio externo − padding. Radios: pill 999 · sm 14 · lg 20 · xl 28.
4. **Color semántico @10–15%** — estados (alerta copper, éxito forest) nunca como fondo saturado de área completa; solo diluidos + texto/icono al 100%.
5. **Jerarquía por opacidad** — título `--night` bold (letter-spacing −0.04em); cuerpo `--rock`; unidades devaluadas 10–30%.
6. **Tipografía:** Inter (400/600/700/800). Body line-height 1.6. Mono sólo para datos técnicos.
7. **Progressive disclosure** — nunca exponer todo; FAQ en `Accordion`, detalle de ficha tras un tap.
8. **Calma visual** — fondos winter (snow/ice) con acentos summer (wood/forest/cobre). **50/50 sutil**: fondo frío + botones/tags cálidos, NO pantalla partida literal.
9. **Anti-patrones prohibidos:** sin saturación, sin caricatura, sin folleto turístico genérico, sin estética deportiva extrema, sin glassmorphism sobre texto numérico, sin bordes verticales en listas.
10. **Sombras:** ultra-bajas (3–10%) para elevación; sin sombras duras.
11. **Movimiento:** ≤300ms ease-out; hover lift sutil; fade-in de tooltips. Sin rebote.
12. **Iconografía:** emoji pragmático hoy (render universal, peso cero, mobile/QR); *upgrade* a set outline 1.5px cuando se quiera premium total.

---

## 6. Flujo de navegación

```
   QR ──► [ HOME ] ──► { selector ES/PT/EN persistente }
              │
              ├──► 1  Check-in      ──► Google Maps
              ├──► 2  Check-out     ──► confirmación
              ├──► 3  Restaurantes  ──► Maps / IG / carta   (FichaCard)
              ├──► 4  Actividades   ──► filtros ──► Maps     (FilterBar)
              ├──► 5  Clima/Nieve   ──► Snow Forecast (ext.)
              ├──► 6  Tickets/Ski   ──► sitio ski (ext.)   [énfasis invierno]
              └──► 7  Info Depto    ──► FAQ (Accordion)

   [ BACK / btn-back ] ──► vuelve a HOME en toda hoja
   [ Quick Contact ]    ──► WhatsApp/tel, siempre accesible desde Home
```

- **Profundidad:** 1 nivel. Home = hub; cada módulo = hoja. Sin menús anidados.
- **Énfasis estacional:** Home muestra tag de temporada y reordena/realza módulos (Tickets en invierno, Actividades outdoor en verano) **sin dominar** fuera de temporada.
- **i18n:** el selector conmuta cadenas en cualquier pantalla; persiste entre sesiones; fallback ES.

---

## 7. Notas de implementación

1. **1 HTML por módulo**, todos comparten `css/styles.css` (tokens únicos, cero frameworks). Sin build step.
2. **i18n sin dependencias:** atributo `data-i18n="key"` + un `lang.js` con diccionarios `{es,pt,en}`; guarda `lang` en `localStorage`.
3. **Links externos críticos (valor real):** Google Maps (Check-in, fichas), Snow Forecast (Clima), sitio de tickets (Ski), WhatsApp/tel (Contacto, Emergencias). Mantener siempre actualizados.
4. **`maximum-scale=1`** (ya en index) por QR/mobile — revisar contraste WCAG para compensar zoom bloqueado.
5. **Valores faltantes:** em-dash `—` en gris claro, nunca 0 ni vacío.
6. **Calibración de glassmorphism:** el `.88` actual es casi opaco (aceptable); **nunca** aplicar blur sobre texto numérico/tabular. Subir a `.92+` si se ve texto borroso.
7. **Énfasis estacional vía dato, no vía código quemado:** `Season Tag` + clase condicional (`is-winter`/`is-summer`) controla prominencia de Tickets/Actividades.
8. **Escalabilidad Staff (Rama C):** crear `/staff/` separado del árbol del huésped para no contaminar la carcasa orientada al guest.
9. **Accesibilidad:** cada módulo pasa el checklist (propósito en 5s, squint test, densidad de aire, cifras tabulares, contraste, jerarquía por opacidad).

---

## ✅ Verificación final

- [x] **No sobrecargada** — 9 módulos, 1 nivel de profundidad, ~16 componentes.
- [x] **Escalable** — Rama C reservada; nuevos módulos = nueva hoja sin tocar el hub.
- [x] **Respeta la fundación Obsidian** — 15 principios + tokens aterrizados vía `DESIGN.md`.
- [x] **Representa Chillán invierno/verano** — paleta dual + énfasis estacional sutil, no literal.
- [x] **ES / PT / EN** — selector persistente, cadenas traducibles, fallback ES.
- [x] **Snow Forecast + Tickets de ski** — módulos 6 y 7, con links externos explícitos.
- [x] **Carcasa base, no desarrollo final** — sin contenido inventado; sólo estructura, campos y reglas.

> Archivo visual complementario: **`GRAPHIFY_MAESTRO.canvas`** (Obsidian JSON Canvas) — grafo navegable del mismo mapa.
