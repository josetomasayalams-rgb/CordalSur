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
const destinationGuidePath = `${projectDir}/data/destination-guide.json`;
if (!fs.existsSync(destinationGuidePath)) {
  throw new Error('data/destination-guide.json is required to generate public catalogs');
}
const destinationGuide = JSON.parse(fs.readFileSync(destinationGuidePath, 'utf8'));
const LANGS = ['es', 'pt', 'en'];

// A plain string is never treated as a translation. The only exceptions are
// immutable public names whose spelling is intentionally identical in every
// language. Keeping this allowlist explicit prevents new Spanish copy from
// leaking silently into Portuguese or English.
const IDENTICAL_TEXT_ALLOWLIST = new Set([
  'scalar.brand',
  'scalar.home.location',
  'scalar.clima.forecast',
  'scalar.tickets.buy'
]);

function asL10n(v, context = '') {
  if (v == null) return { es: '', pt: '', en: '' };
  if (typeof v === 'string') {
    if (IDENTICAL_TEXT_ALLOWLIST.has(context)) return { es: v, pt: v, en: v };
    throw new Error(`${context || 'i18n value'}: expected { es, pt, en }, received a plain string`);
  }
  if (typeof v !== 'object' || Array.isArray(v)) {
    throw new Error(`${context || 'i18n value'}: expected { es, pt, en }`);
  }
  for (const L of LANGS) {
    if (!Object.prototype.hasOwnProperty.call(v, L) || typeof v[L] !== 'string') {
      throw new Error(`${context || 'i18n value'}: missing string translation "${L}"`);
    }
  }
  return { es: v.es, pt: v.pt, en: v.en };
}
function tVal(v, L, context = '') {
  const o = asL10n(v, context);
  return o[L];
}
function simplifyCopyText(s) {
  const raw = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const clause = raw.split(/[:;—–]/)[0].trim();
  const sentence = clause || raw.split(/(?<=[.!?])\s+/)[0].trim();
  const cleaned = sentence.replace(/\s+([,.;:!?])/g, '$1').replace(/[.。]+$/g, '');
  if (cleaned.length > 120) return cleaned.slice(0, 117).replace(/[\s,-–]+$/g, '') + '…';
  return cleaned;
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
    'act.filter.cat',
    'clima.intro',
    'tickets.intro', 'tickets.season.note',
    'checkin.intro', 'checkout.intro',
    'botiquin.intro', 'buggy.intro',
    'info.intro', 'act.intro', 'rest.intro',
    'home.welcome',
    'nearby.emergency',
    'act.atr-laguna-huemul.copy_card',
    'act.atr-garganta-diablo.nombre',
    'act.atr-banos-rafa.nombre'
  ];
  const DEAD_RE = new RegExp(`'\\s*(?:${DEAD.map(k => k.replace(/\./g, '\\.')).join('|')})'\\s*:\\s*'[^']*'\\s*,?`, 'g');
  for (const L of LANGS) {
    const blk = findBlock(L);
    if (!blk) continue;
    const cleaned = blk.body.replace(DEAD_RE, '');
    if (cleaned !== blk.body) {
      // Normalize trailing whitespace; drop the block's normalizer would misbehave here.
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

// Scalar keys are a strict three-language contract. Empty strings remain valid for
// host-private values that have intentionally not been published yet.
let scalarsApplied = 0;
for (const [key, v] of Object.entries(data.scalar || {})) {
  if (v == null) continue;
  const localized = asL10n(v, `scalar.${key}`);
  for (const L of LANGS) {
    if (localized[L].trim()) setKeyInBlock(L, key, localized[L]);
  }
  scalarsApplied++;
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
      if (e[f] == null) continue;
      const v = tVal(e[f], L, `restaurants.${e.id}.${f}`);
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
      if (raw == null) continue;
      const v = f === 'copy_card'
        ? simplifyCopyText(tVal(raw, L, `activities.${e.id}.${f}`))
        : tVal(raw, L, `activities.${e.id}.${f}`);
      if (v) { appendKeys(L, [[`${e.id}.${f}`, v]]); listingKeys++; }
    }
  }
}

// Restaurant cards: nombre and descripcion_corta are i18n; propagate per language.
for (const e of (data.restaurants || [])) {
  if (e.status !== 'publicar') continue;
  for (const L of LANGS) {
    const name = tVal(e.nombre, L, `restaurants.${e.id}.nombre`);
    if (name) { appendKeys(L, [[`${e.id}.nombre`, name]]); listingKeys++; }
    const desc = tVal(e.descripcion_corta || e.shortDescription, L, `restaurants.${e.id}.descripcion_corta`);
    if (desc) { appendKeys(L, [[`${e.id}.descripcion_corta`, desc]]); listingKeys++; }
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
  const body = sections.replace(/^\s+|\s+$/g, '').replace(/[ \t]+$/gm, '');
  s = s.replace(re, (_m, g1, _g2, g3) => g1 + body + g3);
  fs.writeFileSync(p, s);
}

// Actividades v3: top section (curated) + 6 módulos (nieve, termas, senderos, bici,
// aventura, servicios). Top ids EXCLUDED from modules to avoid duplicates.
// v9: lista única filtrable con filter bar. Misma estética que restaurantes.
// (Definition moved below after SVG_WEB is defined.)

const SVG_MAPS = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z" fill="#4285F4"/></svg>`;
const SVG_IG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zm0 3.68a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.41-10.41a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z" fill="#E4405F"/></svg>`;
const SVG_WEB = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#4285F4" stroke-width="1.6" fill="none"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" stroke="#4285F4" stroke-width="1.6" fill="none"/></svg>`;

function isRoutingEligible(place) {
  return place.routingEligible !== false && place.status !== 'candidate_coordinate';
}

function sortableRoadDistance(place) {
  return isRoutingEligible(place) && Number.isFinite(place.discovery?.apartmentRoadDistanceMeters)
    ? place.discovery.apartmentRoadDistanceMeters
    : Infinity;
}

// Public catalog v10: every guest-facing card derives from the normalized
// destination snapshot. host-data remains an editorial provider, but it no
// longer creates a competing runtime catalog.
const ACTIVITY_CATEGORIES = new Set(['tourism', 'thermal_baths', 'ski', 'trail', 'adventure']);
const LODGING_CATEGORIES = new Set(['hotel', 'cabin']);
const publicApartmentPlaces = destinationGuide.places
  .filter((place) => place.discovery && place.discovery.apartment && !LODGING_CATEGORIES.has(place.category))
  .sort((left, right) => sortableRoadDistance(left) - sortableRoadDistance(right) || left.name.localeCompare(right.name));
const activityPlaces = publicApartmentPlaces.filter((place) => ACTIVITY_CATEGORIES.has(place.category));
const provisionPlaces = publicApartmentPlaces.filter((place) => !ACTIVITY_CATEGORIES.has(place.category));

function fieldValue(field) {
  return field && typeof field === 'object' && Object.prototype.hasOwnProperty.call(field, 'value') ? field.value : field;
}

function categoryFor(id) {
  return destinationGuide.categories.find((category) => category.id === id) || { id, label: id, color: '#66706c' };
}

function catalogAction(url, key, label, type, className = '') {
  if (!url) return '';
  const external = /^https?:\/\//.test(url) ? ' target="_blank" rel="noopener"' : '';
  return `<a class="catalog-action catalog-action--${type} ${className}" href="${attrEsc(url)}"${external} aria-label="${attrEsc(label)}" title="${attrEsc(label)}" data-i18n-aria="${key}" data-i18n-title="${key}"><span class="action-icon action-icon--${type}" aria-hidden="true"></span><span class="sr-only" data-i18n="${key}">${attrEsc(label)}</span></a>`;
}

function canonicalCard(place) {
  const category = categoryFor(place.category);
  const routingEligible = isRoutingEligible(place);
  const distanceMeters = routingEligible && Number.isFinite(place.discovery.apartmentRoadDistanceMeters) ? place.discovery.apartmentRoadDistanceMeters : null;
  const address = fieldValue(place.address) || place.municipality || '';
  const pendingLocation = `${address ? `${attrEsc(address)} <span aria-hidden="true">·</span> ` : ''}<span data-i18n="guide.coordinate.pendingLocation">Ubicación exacta por confirmar</span>`;
  const approximate = place.coordinateKind === 'center_candidate' || place.status === 'candidate_coordinate';
  const precision = place.coordinatePrecision || (routingEligible ? place.coordinateKind : 'unverified');
  const closed = place.operatingStatus === 'closed';
  const phone = fieldValue(place.phone);
  const website = fieldValue(place.website);
  const instagram = fieldValue(place.instagram);
  const rating = place.googleRating || place.tripadvisorRating;
  const ratingHtml = rating
    ? `<span class="catalog-rating"><b>★ ${attrEsc(rating.value)}</b><span aria-hidden="true"> · </span>${attrEsc(rating.reviewCount || 0)} <span data-i18n="guide.reviews">reseñas</span></span>`
    : '';
  const phoneHref = phone ? `tel:${String(phone).replace(/[^+\d]/g, '')}` : '';
  return `      <article class="rest-card catalog-card" data-id="${attrEsc(place.id)}" data-category="${attrEsc(place.category)}" data-lat="${attrEsc(place.location.lat)}" data-lon="${attrEsc(place.location.lon)}" data-routing-eligible="${routingEligible ? 'true' : 'false'}" data-coordinate-precision="${attrEsc(precision)}" data-distance="${distanceMeters ?? ''}" data-distance-source="${distanceMeters === null ? 'unknown' : 'road-apartment'}" data-apartment-distance="${distanceMeters ?? ''}" data-apartment-access-nearby="${routingEligible && place.discovery.roadAccessNearby ? 'true' : 'false'}" data-road-access-nearby="${routingEligible && place.discovery.roadAccessNearby ? 'true' : 'false'}" style="--catalog-color:${attrEsc(category.color)}">
        <header class="catalog-card__head">
          <span class="catalog-card__marker" aria-hidden="true"></span>
          <div class="catalog-card__identity">
            <span class="catalog-card__category" data-i18n="guide.cat.${attrEsc(place.category)}">${attrEsc(category.label)}</span>
            <h3 class="rest-card__name">${attrEsc(place.name)}</h3>
            <p>${routingEligible ? (address ? attrEsc(address) : '<span data-i18n="guide.location.unknown">Sector por confirmar</span>') : pendingLocation}</p>
          </div>
          ${routingEligible ? '<strong class="catalog-distance"><span data-distance-label>—</span><small data-road-distance-note></small></strong>' : ''}
        </header>
        ${approximate && routingEligible ? '<p class="catalog-warning" data-i18n="guide.coordinate.warning">Coordenada aproximada: confirma la entrada antes de viajar.</p>' : ''}
        ${closed ? '<p class="catalog-warning catalog-warning--closed" data-i18n="guide.status.closed">Cerrado según la última verificación. Revisa el sitio oficial antes de viajar.</p>' : ''}
        ${ratingHtml}
        <div class="catalog-actions">
          ${catalogAction(place.navigationUrl, 'guide.action.navigate', 'Navegar', 'navigation', 'catalog-action--primary')}
          ${catalogAction(place.googleMapsUrl, 'guide.action.maps', 'Abrir en Google Maps', 'maps')}
          ${catalogAction(website, 'guide.action.website', 'Sitio oficial', 'website')}
          ${catalogAction(instagram, 'guide.action.instagram', 'Abrir en Instagram', 'instagram')}
          ${catalogAction(phoneHref, 'nearby.call', 'Llamar', 'phone')}
        </div>
      </article>`;
}

function catalogToolbar(kind, places) {
  const categories = [...new Set(places.map((place) => place.category))]
    .map(categoryFor)
    .sort((left, right) => left.label.localeCompare(right.label));
  const buttons = categories.map((category) =>
    `<button type="button" class="catalog-filter" data-catalog-filter="${attrEsc(category.id)}" aria-pressed="false"><i style="--filter-color:${attrEsc(category.color)}"></i><span data-i18n="guide.cat.${attrEsc(category.id)}">${attrEsc(category.label)}</span></button>`
  ).join('\n          ');
  return `      <div class="catalog-toolbar" data-catalog-toolbar="${kind}">
        <div class="catalog-origin" role="group" data-i18n-aria="catalog.origin.aria" aria-label="Origen de la distancia">
          <button type="button" class="catalog-origin__button is-active" data-catalog-origin="apartment" aria-pressed="true"><span class="catalog-origin__icon" aria-hidden="true">⌂</span><span data-i18n="catalog.origin.apartment">Departamento</span></button>
          <button type="button" class="catalog-origin__button" data-catalog-origin="location" aria-pressed="false"><span class="catalog-origin__icon" aria-hidden="true">◎</span><span data-i18n="catalog.origin.location">Mi ubicación</span></button>
          <span class="catalog-origin__status" data-catalog-location-status role="status" aria-live="polite" data-i18n="catalog.origin.private">GPS opcional · sólo en este dispositivo</span>
        </div>
        <label class="catalog-search"><span data-i18n="catalog.search.label">Buscar</span><input type="search" data-catalog-search data-i18n-placeholder="catalog.search.placeholder" placeholder="Nombre, categoría o sector"></label>
        <label class="catalog-sort"><span data-i18n="guide.sort.label">Ordenar por</span><select data-catalog-sort><option value="distance" data-i18n="guide.sort.distance">Distancia</option><option value="alphabetical" data-i18n="guide.sort.alphabetical">A–Z</option></select></label>
        <div class="catalog-filters" role="group" data-i18n-aria="guide.categories.aria" aria-label="Categorías">
          <button type="button" class="catalog-filter is-active" data-catalog-filter="all" aria-pressed="true"><span data-i18n="nearby.cat.all">Todos</span></button>
          ${buttons}
        </div>
        <strong class="catalog-count" data-catalog-count aria-live="polite">${places.length} lugares</strong>
      </div>`;
}

function canonicalCatalog(kind, titleKey, title, introKey, intro, places) {
  const graph = destinationGuide.meta && destinationGuide.meta.drivingNetwork || {};
  const apartment = destinationGuide.geometry.apartment;
  return `    <section class="canonical-catalog" data-canonical-catalog="${kind}" data-apartment-lat="${attrEsc(apartment.lat)}" data-apartment-lon="${attrEsc(apartment.lon)}" data-graph-schema-version="${attrEsc(graph.schemaVersion ?? '')}" data-graph-version="${attrEsc(graph.networkVersion || graph.generatedAt || '')}" data-graph-hash="${attrEsc(graph.networkHash || graph.artifactSha256 || graph.responseSha256 || '')}">
      <div class="catalog-heading"><div><span class="guide-eyebrow" data-i18n="catalog.eyebrow">Selección territorial verificada</span><h2 class="section-title" data-i18n="${titleKey}">${title}</h2><p data-i18n="${introKey}">${intro}</p></div><span class="catalog-total"><b>${places.length}</b><span data-i18n="guide.quality.places">lugares</span></span></div>
${catalogToolbar(kind, places)}
      <div class="rest-grid" data-catalog-grid>
${places.map(canonicalCard).join('\n')}
      </div>
      <p class="catalog-empty" data-catalog-empty hidden data-i18n="catalog.empty">No hay lugares que coincidan con tu búsqueda.</p>
      <dialog class="guide-location-dialog catalog-location-dialog" data-catalog-location-dialog aria-labelledby="catalog-location-title-${kind}">
        <form method="dialog" class="guide-location-dialog__panel">
          <div class="guide-location-dialog__head"><div><span class="guide-eyebrow" data-i18n="guide.location.title">Tu ubicación es opcional</span><h2 id="catalog-location-title-${kind}" data-i18n="guide.location.dialogTitle">¿Cómo quieres usar tu ubicación?</h2></div><button type="submit" class="guide-dialog-close" value="close" data-i18n-aria="guide.location.close" aria-label="Cerrar">×</button></div>
          <p data-i18n="guide.location.dialogBody">Tu posición sólo se usa en este dispositivo. CordalSur no la guarda ni la añade a enlaces; al abrir el mapa, OpenStreetMap recibe las teselas de la zona visible.</p>
          <button type="button" class="guide-location-choice" data-catalog-location-choice="once"><strong data-i18n="guide.location.once">Solo esta vez</strong><span data-i18n="guide.location.onceDetail">Toma una posición y deja de consultar.</span></button>
          <button type="button" class="guide-location-choice" data-catalog-location-choice="session"><strong data-i18n="guide.location.session">Durante esta sesión</strong><span data-i18n="guide.location.sessionDetail">Actualiza mientras avanzas; se borra al salir.</span></button>
          <button type="button" class="guide-location-choice" data-catalog-location-choice="manual"><strong data-i18n="guide.location.manual">Elegir un punto en el mapa</strong><span data-i18n="guide.location.manualDetail">El punto se usa sólo en esta página y no se guarda.</span></button>
          <button type="button" class="guide-location-choice" data-catalog-location-choice="none"><strong data-i18n="guide.location.none">Seguir sin ubicación</strong><span data-i18n="guide.location.noneDetail">Mantiene las distancias desde el departamento.</span></button>
        </form>
      </dialog>
      <dialog class="guide-location-dialog catalog-manual-dialog" data-catalog-manual-dialog aria-labelledby="catalog-manual-title-${kind}">
        <form method="dialog" class="guide-location-dialog__panel">
          <div class="guide-location-dialog__head"><div><span class="guide-eyebrow" data-i18n="guide.location.manualEyebrow">Ubicación manual</span><h2 id="catalog-manual-title-${kind}" data-i18n="guide.location.manualTitle">Marca un punto en el mapa</h2></div><button type="submit" class="guide-dialog-close" value="close" data-i18n-aria="guide.location.close" aria-label="Cerrar">×</button></div>
          <p data-i18n="guide.location.manualHelp">Toca el mapa para mover el punto. No se guardará al salir de esta página.</p>
          <div class="catalog-manual-map" data-catalog-manual-map role="application" data-i18n-aria="guide.location.manualMapAria" aria-label="Mapa para elegir una ubicación"></div>
          <p class="catalog-manual-status" data-catalog-manual-status role="status" aria-live="polite" data-i18n="guide.location.manualWaiting">Toca el mapa para elegir un punto.</p>
          <button type="button" class="catalog-manual-tile-retry" data-catalog-manual-tile-retry hidden data-i18n="common.retry">Reintentar mapa base</button>
          <div class="guide-manual-actions"><button type="submit" class="guide-manual-cancel" value="close" data-i18n="common.cancel">Cancelar</button><button type="button" class="guide-manual-confirm" data-catalog-manual-confirm disabled data-i18n="guide.location.manualConfirm">Usar este punto</button></div>
        </form>
      </dialog>
    </section>`;
}

regenListings('actividades.html', canonicalCatalog(
  'activities', 'act.top.t', 'Qué hacer en Las Trancas', 'catalog.activities.intro',
  'Turismo, naturaleza y experiencias dentro del radio del departamento.', activityPlaces
));
regenListings('restaurantes.html', canonicalCatalog(
  'provisions', 'rest.title', 'Comida y provisiones en Las Trancas', 'catalog.provisions.intro',
  'Comida, abastecimiento y servicios esenciales ordenados desde el departamento.', provisionPlaces
));

// ---------- 3. Canonical page titles + public support ----------
// These small patches keep a later data regeneration from restoring the legacy
// brand or an obsolete contact number outside the @LISTINGS blocks.
const PAGE_TITLE_KEYS = {
  'index.html': 'page.home.title',
  'check-in.html': 'page.checkin.title',
  'check-out.html': 'page.checkout.title',
  'restaurantes.html': 'page.restaurants.title',
  'actividades.html': 'page.activities.title',
  'clima.html': 'page.weather.title',
  'tickets.html': 'page.tickets.title',
  'instrucciones.html': 'page.manual.title',
  'botiquin.html': 'page.firstaid.title',
  'buggy.html': 'page.buggy.title',
  'cerca-de-mi.html': 'page.nearby.title'
};

function setAttribute(tag, name, value) {
  const attr = `${name}="${attrEsc(value)}"`;
  const re = new RegExp(`\\s${name}="[^"]*"`);
  if (re.test(tag)) return tag.replace(re, ` ${attr}`);
  return tag.replace(/>$/, ` ${attr}>`);
}

for (const [file, key] of Object.entries(PAGE_TITLE_KEYS)) {
  const p = `${projectDir}/${file}`;
  let html = fs.readFileSync(p, 'utf8');
  const title = tVal(data.scalar[key], 'es', `scalar.${key}`);
  if (!/<html\b[^>]*>/i.test(html) || !/<title>[\s\S]*?<\/title>/i.test(html)) {
    throw new Error(`${file}: missing <html> or <title>`);
  }
  html = html.replace(/<html\b[^>]*>/i, (tag) => setAttribute(tag, 'data-i18n-title', key));
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${attrEsc(title)}</title>`);
  fs.writeFileSync(p, html);
}

const publicWhatsApp = data.publicSupport && data.publicSupport.whatsappUrl;
if (!/^https:\/\/wa\.me\/\d+$/.test(publicWhatsApp || '')) {
  throw new Error('publicSupport.whatsappUrl must be https://wa.me/<digits>');
}
const publicWhatsAppPhone = publicWhatsApp.replace(/^https:\/\/wa\.me\//, '');
const publicWhatsAppFallback = tVal(
  data.scalar['whatsapp.checkin.message'],
  'es',
  'scalar.whatsapp.checkin.message'
);
const publicWhatsAppHref = `${publicWhatsApp}?text=${encodeURIComponent(publicWhatsAppFallback)}`;
for (const file of ['index.html', 'check-in.html']) {
  const p = `${projectDir}/${file}`;
  let html = fs.readFileSync(p, 'utf8');
  html = html.replace(/<a\b[^>]*\bdata-whatsapp-link\b[^>]*>/g, (tag) =>
    setAttribute(tag, 'href', publicWhatsAppHref)
  );
  fs.writeFileSync(p, html);
}

const publicInstagram = data.publicSupport && data.publicSupport.instagramUrl;
if (!/^https:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9._-]+\/?)?$/.test(publicInstagram || '')) {
  throw new Error('publicSupport.instagramUrl must be an https://instagram.com/ profile URL');
}
for (const file of ['index.html', 'check-in.html']) {
  const p = `${projectDir}/${file}`;
  let html = fs.readFileSync(p, 'utf8');
  if (!/<a\b[^>]*\bdata-instagram-link\b[^>]*>/i.test(html)) {
    throw new Error(`${file}: data-instagram-link anchor missing`);
  }
  html = html.replace(/<a\b[^>]*\bdata-instagram-link\b[^>]*>/g, (tag) =>
    setAttribute(tag, 'href', publicInstagram)
  );
  fs.writeFileSync(p, html);
}

const whatsAppScriptPath = `${projectDir}/js/whatsapp.js`;
let whatsAppScript = fs.readFileSync(whatsAppScriptPath, 'utf8');
if (!/var PHONE = '\d+';/.test(whatsAppScript) ||
    !/var DEFAULT_MESSAGE = '(?:[^'\\]|\\.)*';/.test(whatsAppScript)) {
  throw new Error('js/whatsapp.js: canonical PHONE or DEFAULT_MESSAGE declaration missing');
}
whatsAppScript = whatsAppScript
  .replace(/var PHONE = '\d+';/, `var PHONE = '${publicWhatsAppPhone}';`)
  .replace(
    /var DEFAULT_MESSAGE = '(?:[^'\\]|\\.)*';/,
    `var DEFAULT_MESSAGE = '${esc(publicWhatsAppFallback)}';`
  );
fs.writeFileSync(whatsAppScriptPath, whatsAppScript);

// ---------- 4. Validate lang.js ----------
try { execSync(`node -c "${langPath}"`, { stdio: 'pipe' }); } catch (e) {
  console.error('lang.js syntax error after write:\n' + e.stderr.toString());
  process.exit(2);
}

console.log(JSON.stringify({ scalars_applied: scalarsApplied, listing_keys_added: listingKeys, restaurants: (data.restaurants || []).length, activities: (data.activities || []).length }, null, 2));
