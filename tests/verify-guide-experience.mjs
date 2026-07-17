import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const fail = (message) => { console.error(`  FAIL: ${message}`); process.exitCode = 1; };
const html = read('cerca-de-mi.html');
const nearby = read('js/nearby.js');
const styles = read('css/styles.css');
const lang = read('js/lang.js');
const theme = read('js/theme.js');
const catalog = read('js/catalog-guide.js');

if (!/id="guide-map-toggle"[^>]*aria-expanded="true"[^>]*aria-controls="guide-map-shell"/.test(html) ||
    !/id="guide-map-shell"/.test(html)) {
  fail('map toggle must expose aria-expanded and aria-controls');
}
if (!nearby.includes("sessionStorage.setItem(MAP_VISIBILITY_KEY") ||
    !nearby.includes("sessionStorage.getItem(MAP_VISIBILITY_KEY") ||
    !nearby.includes("mapShell.hidden = !mapVisible") ||
    !nearby.includes("layout.setAttribute('data-map-visible'") ||
    !nearby.includes("mapToggle.setAttribute('aria-expanded'")) {
  fail('map visibility must be session-only, accessible and remove the map from layout');
}
if (!html.includes('id="guide-results-region"') || !html.includes('aria-busy="true"') ||
    !html.includes('id="nearby-loading"') ||
    !nearby.includes("resultsRegion.setAttribute('aria-busy', 'false')") ||
    !nearby.includes("empty.textContent = t('guide.loadError')")) {
  fail('loading and error states must be explicit and announced');
}
if (!styles.includes('.guide-layout[data-map-visible="false"]') ||
    !styles.includes('.guide-layout[data-map-visible="false"] .nearby-grid') ||
    !styles.includes('.guide-map-shell[hidden]')) {
  fail('hidden map must reflow the results list to full width');
}
if (html.includes('nearby-emergency') || html.includes('nearby.emergency') || lang.includes("'nearby.emergency'")) {
  fail('the emergency strip must be absent from Explore the Valley only');
}
if (!styles.includes('body[data-section="nearby"] .guide-hero::before') ||
    !styles.includes('body[data-section="nearby"] .guide-hero::after') ||
    !styles.includes('content: none !important')) {
  fail('nearby hero decorative bands must be disabled');
}
for (const key of ['guide.map.show', 'guide.map.hide', 'guide.action.instagram']) {
  if ((lang.match(new RegExp(`'${key.replaceAll('.', '\\.')}':`, 'g')) || []).length !== 3) fail(`${key} must exist in ES/PT/EN`);
}
if (!lang.includes("querySelectorAll('.lang-selector')") || !lang.includes("new CustomEvent('cordal:language-changed'")) {
  fail('language selector must update every visible control and announce one change');
}
if (theme.includes('GH_I18N.apply(') || !theme.includes("GH_I18N.subscribe(localizeControl)")) {
  fail('theme control must localize without reapplying the whole page');
}
if (!catalog.includes('GH_I18N.subscribe(update)') || catalog.includes("addEventListener('gh:language-changed'")) {
  fail('catalog language updates must use one shared subscriber');
}
for (const page of ['actividades.html', 'restaurantes.html']) {
  const source = read(page);
  const iconLinks = [...source.matchAll(/<a class="catalog-action[^>]+>.*?<\/a>/g)];
  if (!iconLinks.length || iconLinks.some(([link]) => !/aria-label="[^"]+"/.test(link) || !/data-i18n-aria="[^"]+"/.test(link) || !/<img[^>]+alt=""/.test(link))) {
    fail(`${page}: every icon action needs a localized accessible name and decorative local image`);
  }
  if (/data-category="(?:hotel|cabin)"/.test(source)) fail(`${page}: lodging leaked into the canonical catalog`);
}
if (/[🔑📍🍽️🚵❄️🎿🚙📖🩹🚪]/u.test(read('index.html'))) fail('home section icons must use theme-aware SVG instead of emoji');

if (!process.exitCode) console.log('  PASS (map toggle/reflow, themes, languages, clean hero, canonical icon actions)');
