// scripts/apply-host-data.mjs — host-data loader for the catastro schema.
// Usage: node scripts/apply-host-data.mjs <projectDir> <host-data.json>
// - Scalars → lang.js per-lang block patch (es|pt|en).
// - Listings (restaurants[] + activities[]) → per-listing i18n keys, id-based:
//     ${id}.${field}  (14 fields)
// - @LISTINGS → rewritten for restaurantes.html and actividades.html with the
//   catastro FichaCard template (stars, safety badge, season/data attrs, CTA).
// - Validates lang.js with `node -c` after writing.
//
// Plain Node, no deps, idempotent.

import fs from 'fs';
import { execSync } from 'child_process';

const [projectDir, dataPath] = process.argv.slice(2);
if (!projectDir || !dataPath) {
  console.error('Usage: node apply-host-data.mjs <projectDir> <host-data.json>');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const LANGS = ['es', 'pt', 'en'];

function asL10n(v) {
  if (v == null) return { es: '', pt: '', en: '' };
  if (typeof v === 'string') return { es: v, pt: v, en: v };
  if (typeof v === 'object') return { es: v.es || '', pt: v.pt || v.es || '', en: v.en || v.es || '' };
  return { es: String(v), pt: String(v), en: String(v) };
}
function tVal(v, L) {
  const o = asL10n(v);
  return o[L] || o.es || '';
}
const esc = (s) => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const attrEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const R = (s) => String(s == null ? '' : s);

// ---------- 1. lang.js patches ----------
const langPath = `${projectDir}/js/lang.js`;
let lang = fs.readFileSync(langPath, 'utf8');

// ponytail: find a lang block by indexOf + manual scan (avoids regex on full file).
function findBlock(L) {
  const marker = `${L}: {`;
  const start = lang.indexOf(marker);
  if (start < 0) return null;
  const bodyStart = start + marker.length;
  const end = lang.indexOf('\n    }', bodyStart);
  if (end < 0) return null;
  return { start, end, bodyStart, body: lang.slice(bodyStart, end) };
}

function writeBlock(L, newBody) {
  const blk = findBlock(L);
  if (!blk) throw new Error(`block ${L} not found`);
  let body = newBody.replace(/\s+$/, '');
  if (body && !body.endsWith(',') && !body.endsWith('{')) body += ',';
  lang = lang.slice(0, blk.bodyStart) + body + '\n    ' + lang.slice(blk.end);
}

// ponytail: strip stale doubled-prefix per-listing keys from a previous v2 run.
{
  const DBL_RE = /\n      '(?:act|rest)\.(?:act|rest)-[a-z0-9-]+\.[a-z_]+':\s*'[\s\S]*?',/g;
  for (const L of LANGS) {
    const blk = findBlock(L);
    if (!blk) continue;
    const cleaned = blk.body.replace(DBL_RE, '');
    if (cleaned !== blk.body) {
      lang = lang.slice(0, blk.bodyStart) + cleaned + lang.slice(blk.end);
    }
  }
}

// ponytail: clean specific dead keys from earlier iterations.
{
  const DEAD = [
    'rest.module.gastronomy', 'rest.module.gastronomy.sub',
    'act.safety.badge.aria', 'act.safety.title',
    'act.module.act.sub', 'act.module.termas.sub', 'act.module.nieve.sub',
    'act.module.mtb.sub', 'act.module.atractivos.sub', 'act.module.bienestar.sub',
    'act.module.servicios.sub',
    'act.filter.cat'
  ];
  const DEAD_RE = new RegExp(`\\n\\s*'(${DEAD.map(k => k.replace(/\./g, '\\.')).join('|')})':\\s*'[^']*',?`, 'g');
  for (const L of LANGS) {
    const blk = findBlock(L);
    if (!blk) continue;
    const cleaned = blk.body.replace(DEAD_RE, '');
    if (cleaned !== blk.body) {
      lang = lang.slice(0, blk.bodyStart) + cleaned + lang.slice(blk.end);
    }
  }
}

function setKeyInBlock(L, key, val) {
  const blk = findBlock(L);
  if (!blk) throw new Error(`block ${L} not found`);
  const body = blk.body;
  const keyRe = new RegExp(`('${key.replace(/\./g, '\\.')}':\\s*)'(?:[^'\\\\]|\\\\.)*'`, 'g');
  if (keyRe.test(body)) {
    const replacedBody = body.replace(keyRe, (km, k1) => k1 + "'" + esc(val) + "'");
    writeBlock(L, replacedBody);
  } else {
    let newBody = body.replace(/\s+$/, '');
    if (!newBody.endsWith(',') && !newBody.endsWith('{')) newBody += ',';
    newBody += `\n      '${key}': '${esc(val)}',`;
    writeBlock(L, newBody);
  }
}

function appendKeys(L, pairs) {
  // ponytail: check for both NEW keys and CHANGED values. Update existing values
  // so tildes / translations / data updates flow through on re-runs.
  const blk = findBlock(L);
  if (!blk) throw new Error(`block ${L} not found`);
  const existing = new Map();
  for (const m of blk.body.matchAll(/'([a-zA-Z0-9_.-]+)':\s*'((?:[^'\\]|\\.)*)'/g)) {
    existing.set(m[1], m[2].replace(/\\'/g, "'"));
  }
  // Update existing keys whose value differs.
  for (const [k, v] of pairs) {
    if (existing.has(k) && existing.get(k) !== v) {
      const keyRe = new RegExp(`('${k.replace(/\./g, '\\.')}':\\s*)'(?:[^'\\\\]|\\\\.)*'`, 'g');
      const replaced = blk.body.replace(keyRe, (km, k1) => k1 + "'" + esc(v) + "'");
      if (replaced !== blk.body) {
        writeBlock(L, replaced);
        const updated = findBlock(L);
        for (const m of updated.body.matchAll(/'([a-zA-Z0-9_.-]+)':\s*'((?:[^'\\]|\\.)*)'/g)) {
          existing.set(m[1], m[2].replace(/\\'/g, "'"));
        }
      }
    }
  }
  // Handle truly-new keys.
  const blk2 = findBlock(L);
  let newBody = blk2.body.replace(/\s+$/, '');
  if (!newBody.endsWith(',') && !newBody.endsWith('{')) newBody += ',';
  let added = false;
  for (const [k, v] of pairs) {
    if (!existing.has(k)) {
      newBody += `\n      '${k}': '${esc(v)}',`;
      added = true;
    }
  }
  if (!added) return;
  newBody += '\n    ';
  writeBlock(L, newBody.replace(/\n    $/, ''));
}

// scalar keys
// ponytail: accept both formats — {es,pt,en} objects AND plain ES strings.
// String scalars are written only to the ES block; PT/EN fallback to ES at lookup time
// (lang.js t() function already does FALLBACK='es' fallback when key missing in target lang).
let scalarsApplied = 0;
for (const [key, v] of Object.entries(data.scalar || {})) {
  if (v == null) continue;
  if (typeof v === 'string') {
    // ES-only scalar: write only to ES block.
    if (v.trim()) {
      setKeyInBlock('es', key, v);
      scalarsApplied++;
    }
  } else if (typeof v === 'object' && v.es) {
    for (const L of LANGS) setKeyInBlock(L, key, v[L] || v.es);
    scalarsApplied++;
  }
}

// per-listing keys (id-based, stable). 16 L10N_FIELDS × 3 langs per listing.
// v3: +acceso_inicio (ruta) +cta_label (mapa)
const L10N_FIELDS = [
  'nombre', 'subcategoria', 'zona', 'temporada', 'categoria',
  'dificultad', 'duracion', 'edad_minima', 'precio_referencia',
  'horario', 'reserva_o_compra', 'contacto', 'notas_seguridad', 'copy_card',
  'cta_label', 'acceso_inicio'
];
let listingKeys = 0;
for (const e of (data.restaurants || [])) {
  for (const L of LANGS) {
    for (const f of L10N_FIELDS) {
      const v = tVal(e[f], L);
      if (v) { appendKeys(L, [[`${e.id}.${f}`, v]]); listingKeys++; }
    }
  }
}
// v3: skip activities with visible:false (rutas no verificadas)
for (const e of (data.activities || [])) {
  if (e.visible === false) continue;
  for (const L of LANGS) {
    for (const f of L10N_FIELDS) {
      // acceso_inicio y cta_label pueden venir anidados en ruta/mapa
      let raw = e[f];
      if (f === 'acceso_inicio' && e.ruta) raw = e.ruta.acceso_inicio;
      if (f === 'cta_label' && e.mapa) raw = e.mapa.cta_label;
      const v = tVal(raw, L);
      if (v) { appendKeys(L, [[`${e.id}.${f}`, v]]); listingKeys++; }
    }
  }
}

fs.writeFileSync(langPath, lang);

// ---------- 2. @LISTINGS HTML regen ----------
function starsHtml(n) {
  const filled = '★'.repeat(n || 0);
  const empty = '☆'.repeat(Math.max(0, 5 - (n || 0)));
  return filled + empty;
}

// ponytail: replace "n/a" / "por confirmar" / empty with em-dash. We DON'T add data-i18n
// for empty values so lang.js.apply() doesn't overwrite the "—" with the raw placeholder.
const EMPTY_RX = /^(n\/?a|por confirmar|segun actividad|segun operador|a confirmar|to be confirmed)$/i;
function isEmpty(v) {
  const s = tVal(v, 'es').trim();
  return !s || EMPTY_RX.test(s);
}
function displayValue(v) {
  const s = tVal(v, 'es').trim();
  if (!s || EMPTY_RX.test(s)) return '—';
  return s;
}

// v3: fichaCard compacta + expandible. Variantes por tipo:
//  - ruta outdoor (con mapa): meta (distancia·desnivel·dificultad·temporada) + CTA primary + fallback + badge mapa
//  - producto operado (termas/plaza tata/bike park): meta (duración·dificultad·temporada) + CTA primary
//  - servicio: meta (duración·temporada) + CTA consultar
function fichaCard(prefix, e) {
  const id = e.id;
  const estrellas = e.estrellas_airbnb || 0;
  const secure = e.secure_required ? 'true' : 'false';
  const mapa = e.mapa || null;
  const ruta = e.ruta || null;
  const hasOutdoorData = !!(ruta && (ruta.distancia_km != null || ruta.desnivel_m != null));

  const fieldRow = (key, rawValue, field, isNum = false) => {
    const empty = isEmpty(rawValue);
    const display = empty ? '—' : tVal(rawValue, 'es');
    const i18nAttr = empty ? '' : ` data-i18n="${id}.${field}"`;
    return `          <div class="row"><span class="label" data-i18n="${key.i18n}">${R(key.fallback)}</span><span class="val${isNum ? ' num' : ''}${empty ? ' val--empty' : ''}"${i18nAttr}>${attrEsc(display)}</span></div>`;
  };

  // --- meta row (línea compacta): distancia · ↑desnivel · dificultad · temporada ---
  const metaParts = [];
  if (ruta && ruta.distancia_km != null) {
    metaParts.push(`<span class="meta-item meta-dist">${ruta.distancia_km} km</span>`);
  }
  if (ruta && ruta.desnivel_m != null) {
    metaParts.push(`<span class="meta-item meta-elev">↑ ${ruta.desnivel_m} m</span>`);
  }
  if (!isEmpty(e.duracion)) {
    const dEmpty = isEmpty(e.duracion);
    const dI18n = dEmpty ? '' : ` data-i18n="${id}.duracion"`;
    metaParts.push(`<span class="meta-item meta-dur"${dI18n}>${dEmpty ? '—' : attrEsc(tVal(e.duracion, 'es'))}</span>`);
  }
  if (!isEmpty(e.dificultad)) {
    metaParts.push(`<span class="meta-item meta-diff" data-i18n="${id}.dificultad">${attrEsc(tVal(e.dificultad, 'es'))}</span>`);
  }
  if (!isEmpty(e.temporada)) {
    metaParts.push(`<span class="meta-item meta-temp" data-i18n="${id}.temporada">${attrEsc(tVal(e.temporada, 'es'))}</span>`);
  }
  const metaRow = metaParts.length
    ? `\n      <div class="ficha-meta">${metaParts.join('<span class="meta-sep" aria-hidden="true">·</span>')}</div>`
    : '';

  // ponytail v3.7 — removed mapa badges (verificado/pendiente/validacion).
  // The user found them visually noisy. Now only the ★ Top 1 hero badge remains,
  // and the data-validacion="local" attribute is preserved for data purposes.
  let mapaBadge = '';

  // --- fila técnica outdoor (compacta, visible) ---
  // "Mapa: Trailforks · Estado: verificado · Tipo: singletrack · Login: no"
  let techRow = '';
  if (mapa && ruta) {
    const techParts = [];
    if (mapa.provider) techParts.push(`<span class="tech-item"><span class="tech-label" data-i18n="act.tech.mapa">Mapa</span> <span class="tech-val">${attrEsc(mapa.provider)}</span></span>`);
    if (mapa.estado) {
      const estadoEs = {verificado_publico:'verificado', pendiente_strava:'en validación', requiere_verificacion_local:'validar local'}[mapa.estado] || mapa.estado;
      techParts.push(`<span class="tech-item"><span class="tech-label" data-i18n="act.tech.estado">Estado</span> <span class="tech-val">${attrEsc(estadoEs)}</span></span>`);
    }
    if (ruta.ruta_tipo) techParts.push(`<span class="tech-item"><span class="tech-label" data-i18n="act.tech.tipo">Tipo</span> <span class="tech-val">${attrEsc(ruta.ruta_tipo)}</span></span>`);
    if (ruta.requiere_login) techParts.push(`<span class="tech-item"><span class="tech-label" data-i18n="act.tech.login">Login</span> <span class="tech-val">${attrEsc(ruta.requiere_login)}</span></span>`);
    if (techParts.length) {
      techRow = `\n      <div class="ficha-tech">${techParts.join('<span class="tech-sep" aria-hidden="true">·</span>')}</div>`;
    }
  }

  // --- CTAs: primary + fallback pequeño ---
  // ponytail: si hay mapa.cta_label específica (generada como ${id}.cta_label en lang.js),
  // la usamos. Si no, caemos al chrome key act.cta.<cta_key> (siempre existe en lang.js).
  // Antes poníamos siempre data-i18n="${id}.cta_label" y rompía las cards sin mapa.
  const ctaPrimaryUrl = (mapa && mapa.primario_url) || e.link_oficial || '';
  const ctaFallbackUrl = (mapa && mapa.fallback_url) || '';
  const hasCustomCtaLabel = !!(mapa && mapa.cta_label);
  const ctaKeyForFallback = e.cta_key || 'ver';
  const ctaLabelAttr = hasCustomCtaLabel
    ? ` data-i18n="${id}.cta_label"`
    : ` data-i18n="act.cta.${attrEsc(ctaKeyForFallback)}"`;
  const ctaTextEs = hasCustomCtaLabel
    ? tVal(mapa.cta_label, 'es')
    : ({ver:'Ver información oficial', consultar:'Ver información oficial', comprar:'Ver información oficial', guia:'Ver información oficial'}[ctaKeyForFallback] || 'Ver información oficial');
  const primaryCta = ctaPrimaryUrl
    ? `\n        <a class="cta-primary" href="${attrEsc(ctaPrimaryUrl)}" target="_blank" rel="noopener"${ctaLabelAttr}>${attrEsc(ctaTextEs)}</a>`
    : '';
  const fallbackCta = (ctaFallbackUrl && ctaFallbackUrl !== ctaPrimaryUrl)
    ? `\n        <a class="cta-fallback" href="${attrEsc(ctaFallbackUrl)}" target="_blank" rel="noopener" data-i18n="act.cta.fallback">Maps alternativa →</a>`
    : '';
  // ponytail v3.3 — Google Maps link en CTAs row, solo si google_maps_url existe.
  const mapsUrl = e.google_maps_url || null;
  const mapsCta = mapsUrl
    ? `\n        <a class="cta-maps" href="${attrEsc(mapsUrl)}" target="_blank" rel="noopener" data-i18n-aria="act.maps.aria" aria-label="Cómo llegar en Google Maps">📍 <span data-i18n="act.maps.label">Cómo llegar</span></a>`
    : '';
  const ctasBlock = (primaryCta || fallbackCta || mapsCta)
    ? `\n      <div class="ficha-ctas">${primaryCta}${mapsCta}${fallbackCta}\n      </div>`
    : '';

  // --- detalles expandible (<details>) ---
  const detailsRows = [];
  if (hasOutdoorData && ruta && !isEmpty(ruta.acceso_inicio)) {
    detailsRows.push(fieldRow({ i18n: 'act.field.acceso', fallback: 'Acceso' }, ruta.acceso_inicio, 'acceso_inicio'));
  }
  if (!isEmpty(e.zona)) {
    detailsRows.push(fieldRow({ i18n: 'act.field.zona', fallback: 'Zona' }, e.zona, 'zona'));
  }
  if (!isEmpty(e.edad_minima)) {
    detailsRows.push(fieldRow({ i18n: 'act.field.edad', fallback: 'Edad' }, e.edad_minima, 'edad_minima'));
  }
  if (!isEmpty(e.horario)) {
    detailsRows.push(fieldRow({ i18n: 'act.field.horario', fallback: 'Horario' }, e.horario, 'horario'));
  }
  if (!isEmpty(e.reserva_o_compra)) {
    detailsRows.push(fieldRow({ i18n: 'act.field.reserva', fallback: 'Reserva' }, e.reserva_o_compra, 'reserva_o_compra'));
  }
  if (!isEmpty(e.precio_referencia)) {
    detailsRows.push(fieldRow({ i18n: 'act.field.precio', fallback: 'CLP' }, e.precio_referencia, 'precio_referencia', true));
  }
  if (!isEmpty(e.contacto)) {
    detailsRows.push(fieldRow({ i18n: 'act.field.contacto', fallback: 'Contacto' }, e.contacto, 'contacto'));
  }
  // seguridad técnica outdoor (distinct from notas_seguridad promotional)
  if (ruta && ruta.seguridad_minima) {
    detailsRows.push(`          <div class="row"><span class="label" data-i18n="act.field.seguridad_tecnica">Seguridad técnica</span><span class="val">${attrEsc(ruta.seguridad_minima)}</span></div>`);
  }
  // seguridad callout promocional dentro del details
  if (!isEmpty(e.notas_seguridad)) {
    detailsRows.push(`          <div class="ficha-secure-callout" data-i18n="${id}.notas_seguridad">${attrEsc(tVal(e.notas_seguridad, 'es'))}</div>`);
  }
  // fuente al final
  if (e.fuente) {
    detailsRows.push(`          <div class="ficha-source"><span data-i18n="act.field.fuente">Fuente</span>: ${attrEsc(e.fuente)} · ${attrEsc(e.fecha_verificacion || '')}</div>`);
  }
  const detailsBlock = detailsRows.length
    ? `\n      <details class="ficha-details">\n        <summary data-i18n="act.cta.detalles">Ver detalles</summary>\n${detailsRows.join('\n')}\n      </details>`
    : '';

  // ponytail v3.7 — removed 🛡️ Seguridad badge (visually noisy).
  // The secure_required flag still drives the callout inside <details>, but
  // the absolute-positioned badge at top-right is gone.
  const secureBadge = '';

  // data-subcategoria para el filtro 4ª dimensión
  const subcatKey = e.subcategoria_key || '';
  // data-validacion: marca visual para rutas requiere_verificacion_local
  const validacionLocal = (mapa && mapa.estado === 'requiere_verificacion_local') ? 'local' : '';

  return `    <div class="card ficha-card ficha-compact mb-4" data-id="${attrEsc(id)}" data-estrellas="${estrellas}" data-categoria="${attrEsc(e.categoria_key || '')}" data-temporada-key="${attrEsc(e.temporada_key || '')}" data-dificultad-key="${attrEsc(e.dificultad_key || '')}" data-zona-key="${attrEsc(e.zona_key || '')}" data-subcategoria="${attrEsc(subcatKey)}" data-perfil='${attrEsc(JSON.stringify(e.perfil_huesped || []))}' data-secure="${secure}" data-prioridad="${e.prioridad_landing || 99}" data-cta-key="${attrEsc(e.cta_key || 'ver')}" data-module="${attrEsc(e.module_id || e.modulo || '')}">${mapaBadge}
      <div class="card-header">
        <div class="icon-box ${attrEsc(e.iconBg || 'bg-warm')}">${R(e.icon)}</div>
        <div>
          <h3 data-i18n="${id}.nombre">${attrEsc(tVal(e.nombre, 'es'))}</h3>
          <p data-i18n="${id}.subcategoria">${attrEsc(tVal(e.subcategoria, 'es'))}</p>
        </div>
        <div class="stars" data-estrellas="${estrellas}" data-i18n-aria="act.stars.aria" aria-label="${estrellas} de 5">${starsHtml(estrellas)}</div>
      </div>
      <p class="ficha-copy" data-i18n="${id}.copy_card">${attrEsc(tVal(e.copy_card, 'es'))}</p>${metaRow}${techRow}${ctasBlock}${detailsBlock}
    </div>`;
}

function regenListings(file, sections) {
  const p = `${projectDir}/${file}`;
  let s = fs.readFileSync(p, 'utf8');
  const re = /(<!-- @LISTINGS START[\s\S]*?-->\r?\n)([\s\S]*?)(\r?\n\s*<!-- @LISTINGS END -->)/;
  if (!re.test(s)) throw new Error(`${file}: @LISTINGS markers not found`);
  const body = sections.replace(/^\s+|\s+$/g, '');
  s = s.replace(re, (_m, g1, _g2, g3) => g1 + body + g3);
  fs.writeFileSync(p, s);
}

// Actividades v3: top section (curated) + 6 módulos (nieve, termas, senderos, bici,
// aventura, servicios). Top ids EXCLUDED from modules to avoid duplicates.
// v9: lista única filtrable con filter bar. Misma estética que restaurantes.
// (Definition moved below after SVG_WEB is defined.)

// Restaurantes v6: lista compacta con logos SVG, categorias con colores, sin rating null.
// Solo se muestran los "publicar". Sin recos, sin validar, sin disclaimer.
const SVG_MAPS = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z" fill="#4285F4"/></svg>`;
const SVG_IG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zm0 3.68a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.41-10.41a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z" fill="#E4405F"/></svg>`;
const SVG_WEB = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#4285F4" stroke-width="1.6" fill="none"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" stroke="#4285F4" stroke-width="1.6" fill="none"/></svg>`;

// v9: actividades como lista única filtrable (mismo estética que restaurantes)
const allActivities = (data.activities || []).filter(e => e.visible !== false);
allActivities.sort((a, b) => (a.prioridad_landing || 99) - (b.prioridad_landing || 99));

// ponytail v3.10 — Restaurar actFilterBar con estética restaurantes (mismo .rest-filter-bar).
// El user quería mantener UN filtro: el de la misma estética que restaurantes.html.
// Removemos solo el viejo filter-bar--multi 4-dimensiones que era distinto.
const actFilterBar = `      <div id="act-filter-bar" class="rest-filter-bar">
        <button type="button" class="rest-filter__btn rest-filter__btn--active" data-filter="all" data-i18n="rest.filter.all">Todos</button>
        <button type="button" class="rest-filter__btn" data-filter="nieve" data-i18n="act.filter.nieve">Nieve</button>
        <button type="button" class="rest-filter__btn" data-filter="termas" data-i18n="act.filter.termas">Termas</button>
        <button type="button" class="rest-filter__btn" data-filter="senderos" data-i18n="act.filter.senderos">Senderos</button>
        <button type="button" class="rest-filter__btn" data-filter="bici" data-i18n="act.filter.bici">Bici</button>
        <button type="button" class="rest-filter__btn" data-filter="aventura" data-i18n="act.filter.aventura">Aventura</button>
        <button type="button" class="rest-filter__btn" data-filter="servicios" data-i18n="act.filter.servicios">Servicios</button>
        <span class="rest-filter__count" id="act-filter-count" data-i18n="rest.filter.count">${allActivities.length} actividades</span>
      </div>
      <script type="application/json" id="activities-data">${JSON.stringify(allActivities).replace(/<\//g, '<\\/').replace(/&/g, '\\u0026')}</script>`;

function actCard(e) {
  const name = e.name || tVal(e.nombre, 'es') || '';
  const module = e.module_id || 'act';
  const catBadge = `<span class="rr-cat rr-cat--${module}">${attrEsc(module)}</span>`;
  // ponytail v3.8 — icon grande en el header (representa la actividad)
  const icon = e.icon || '📍';
  const iconBg = e.iconBg || 'bg-warm';
  const iconHtml = `<div class="rest-card__icon ${attrEsc(iconBg)}" aria-hidden="true">${icon}</div>`;
  // Description: pick the first non-garbage value from copy_card / notas_seguridad / horario
  let desc = '';
  for (const f of ['copy_card', 'notas_seguridad', 'horario']) {
    const v = tVal(e[f], 'es');
    if (v && v.length > 8 && !/^(n\/?a|por confirmar|segun actividad)/i.test(v)) { desc = v; break; }
  }
  const descHtml = desc ? `<p class="rest-card__desc">${attrEsc(desc)}</p>` : '';
  // ponytail v3.11 — CTAs claros al pie de la card. Botón principal "Ver info oficial" +
  // link secundario "Cómo llegar" usando mapa.primario_url o fallback, o auto-gen desde nombre+zona.
  const webUrl = e.link_oficial;
  let mapsUrl = e.googleMapsUrl || null;
  if (!mapsUrl && e.mapa && e.mapa.primario_url) {
    mapsUrl = e.mapa.primario_url;
  }
  if (!mapsUrl && e.mapa && e.mapa.fallback_url && e.mapa.fallback_url.indexOf('google.com/maps') >= 0) {
    mapsUrl = e.mapa.fallback_url;
  }
  if (!mapsUrl) {
    // ponytail: auto-generar Google Maps URL desde nombre+zona (estilo v3.3)
    const nombre = (e.nombre && typeof e.nombre === 'object') ? e.nombre.es : e.nombre;
    const zona = (e.zona && typeof e.zona === 'object') ? e.zona.es : e.zona;
    if (nombre && zona && !/^(por confirmar|n\/a)$/i.test(zona)) {
      const query = encodeURIComponent((nombre + ' ' + zona).trim());
      mapsUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
    }
  }
  const ctaPrimary = webUrl
    ? `<a class="rest-card__cta" href="${attrEsc(webUrl)}" target="_blank" rel="noopener" data-i18n="act.cta.ver">Ver info oficial</a>`
    : '';
  const ctaMaps = mapsUrl
    ? `<a class="rest-card__cta-maps" href="${attrEsc(mapsUrl)}" target="_blank" rel="noopener" data-i18n="act.maps.label">📍 Cómo llegar</a>`
    : '';
  const ctas = (ctaPrimary || ctaMaps)
    ? `<div class="rest-card__ctas">${ctaPrimary}${ctaMaps}</div>`
    : '';
  return `      <article class="rest-card" data-module="${attrEsc(module)}" data-id="${attrEsc(e.id || '')}">
        <header class="rest-card__head">
          ${iconHtml}
          <div class="rest-card__head-text">
            <h3 class="rest-card__name">${attrEsc(name)}</h3>
            <div class="rest-card__cats">${catBadge}</div>
          </div>
        </header>
        ${descHtml}
        <footer class="rest-card__foot">
          <span class="act-card__module" data-i18n="act.filter.${module}">${attrEsc(module)}</span>
        </footer>
        ${ctas}
      </article>`;
}

const actCards = allActivities.map(actCard).join('\n');
regenListings('actividades.html', `    <h2 class="section-title" data-i18n="act.top.t">Actividades en Las Trancas</h2>
${actFilterBar}
    <div class="rest-grid">
${actCards}
    </div>`);

// Category badge class mapping (8 categorías v7)
const CAT_CLASS = {
  'Restaurante':     'rr-cat--restaurante',
  'Café':            'rr-cat--cafe',
  'Panadería':       'rr-cat--panaderia',
  'Heladería':       'rr-cat--heladeria',
  'Bar':             'rr-cat--bar',
  'Cervecería':      'rr-cat--cerveceria',
  'Supermercado':    'rr-cat--supermercado',
  'Compras gourmet': 'rr-cat--compras',
};

// ponytail v8: card con depth + description + rating, data-categories para el filter.
function restCard(e) {
  const name = e.name || '';
  const cats = (e.categories || []);
  const catsAttr = cats.map(c => c.replace(/[^a-zA-Z0-9áéíóúñ ]/g, '').toLowerCase().replace(/ /g, '-')).join(' ');
  const catsHtml = cats.map(c =>
    `<span class="rr-cat ${CAT_CLASS[c] || ''}">${attrEsc(c)}</span>`
  ).join(' ');
  // Rating: Google primero, luego fallback. Si no hay rating, se renderiza un div vacío
  // (para mantener la grid/flex con la columna de links a la derecha).
  let ratingInner = '';
  if (e.googleRating != null) {
    ratingInner = `<span class="rr-rating"><span class="rr-stars">★</span> <strong>${e.googleRating}</strong> <small>(${e.googleReviewCount}) Google</small></span>`;
  } else if (e.ratingValue != null) {
    ratingInner = `<span class="rr-rating"><span class="rr-stars">★</span> <strong>${e.ratingValue}</strong> <small>(${e.ratingCount}) ${e.ratingSource}</small></span>`;
  }
  const rating = `<div class="rest-card__rating">${ratingInner}</div>`;
  // Description
  const desc = e.shortDescription
    ? `<p class="rest-card__desc">${attrEsc(e.shortDescription)}</p>`
    : '';
  // Links — SVG logos
  const maps = e.googleMapsUrl
    ? `<a class="rr-link" href="${attrEsc(e.googleMapsUrl)}" target="_blank" rel="noopener" title="Cómo llegar" aria-label="Cómo llegar">${SVG_MAPS}</a>`
    : '';
  const ig = e.instagramUrl
    ? `<a class="rr-link" href="${attrEsc(e.instagramUrl)}" target="_blank" rel="noopener" title="Instagram" aria-label="Instagram">${SVG_IG}</a>`
    : '';
  const links = [maps, ig].filter(Boolean).join('');
  return `      <article class="rest-card" data-categories="${attrEsc(catsAttr)}" data-id="${attrEsc(e.id || '')}">
        <header class="rest-card__head">
          <h3 class="rest-card__name">${attrEsc(name)}</h3>
          <div class="rest-card__cats">${catsHtml}</div>
        </header>
        ${desc}
        <footer class="rest-card__foot">
          ${rating}
          <div class="rest-card__links">${links}</div>
        </footer>
      </article>`;
}

const publicar = (data.restaurants || []).filter(r => r.status === 'publicar');
// Order by prioridad_landing asc (cards with rating first, but keep simple for now)
publicar.sort((a, b) => (a.prioridad_landing || 99) - (b.prioridad_landing || 99));
const restCards = publicar.map(restCard).join('\n');
// Build the JSON data block for the filter JS.
// Escape </ and & so JSON-in-script survives the HTML parser.
const safeJson = JSON.stringify(publicar)
  .replace(/<\//g, '<\\/')
  .replace(/&/g, '\\u0026');
const filterBar = `      <div id="rest-filter-bar" class="rest-filter-bar">
        <button type="button" class="rest-filter__btn rest-filter__btn--active" data-filter="all" data-i18n="rest.filter.all">Todos</button>
        <button type="button" class="rest-filter__btn" data-filter="restaurante" data-i18n="rest.filter.restaurante">Restaurantes</button>
        <button type="button" class="rest-filter__btn" data-filter="café" data-i18n="rest.filter.cafe">Café</button>
        <button type="button" class="rest-filter__btn" data-filter="panadería" data-i18n="rest.filter.panaderia">Panadería</button>
        <button type="button" class="rest-filter__btn" data-filter="heladería" data-i18n="rest.filter.heladeria">Heladería</button>
        <button type="button" class="rest-filter__btn" data-filter="bar" data-i18n="rest.filter.bar">Bar</button>
        <button type="button" class="rest-filter__btn" data-filter="cervecería" data-i18n="rest.filter.cerveceria">Cervecería</button>
        <button type="button" class="rest-filter__btn" data-filter="supermercado" data-i18n="rest.filter.supermercado">Supermercado</button>
        <button type="button" class="rest-filter__btn" data-filter="compras-gourmet" data-i18n="rest.filter.compras">Compras gourmet</button>
        <span class="rest-filter__count" id="rest-filter-count" data-i18n="rest.filter.count">28 lugares</span>
      </div>
      <script type="application/json" id="restaurants-data">${safeJson}</script>`;
regenListings('restaurantes.html', `    <h2 class="section-title" data-i18n="rest.title">Comida y provisiones en Las Trancas</h2>
    <p class="mb-4" data-i18n="rest.intro">Una guía curada para que elijas rápido: dónde comer, qué probar, y dónde abastecerte.</p>
${filterBar}
    <div class="rest-grid">
${restCards}
    </div>`);

// ---------- 3. Validate lang.js ----------
try { execSync(`node -c "${langPath}"`, { stdio: 'pipe' }); } catch (e) {
  console.error('lang.js syntax error after write:\n' + e.stderr.toString());
  process.exit(2);
}

console.log(JSON.stringify({ scalars_applied: scalarsApplied, listing_keys_added: listingKeys, restaurants: (data.restaurants || []).length, activities: (data.activities || []).length }, null, 2));
