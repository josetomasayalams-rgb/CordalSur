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
const motion = read('js/location-motion.js');
const locationController = read('js/location-controller.js');
const roadClient = read('js/road-distance.js');
const home = read('index.html');

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
  if (!iconLinks.length || iconLinks.some(([link]) => !/aria-label="[^"]+"/.test(link) || !/data-i18n-aria="[^"]+"/.test(link) || !/<span class="action-icon action-icon--[a-z-]+" aria-hidden="true"/.test(link))) {
    fail(`${page}: every icon action needs a localized accessible name and a decorative local theme-aware icon`);
  }
  if (/data-category="(?:hotel|cabin)"/.test(source)) fail(`${page}: lodging leaked into the canonical catalog`);
  if (/class="catalog-sources"|>Fuentes<|>Fontes<|>Sources</.test(source)) fail(`${page}: editorial provenance must not appear in the guest catalog`);
}
if (/[🚙🩹]/u.test(read('buggy.html') + read('botiquin.html')) || /<svg[\s\S]*?WhatsApp/i.test(read('buggy.html'))) fail('Buggy and first-aid feature art must not fall back to emoji or a generic WhatsApp glyph');
if (!home.includes('data-src-light="assets/home-icons/transport-light.webp"') ||
    !home.includes('data-src-dark="assets/home-icons/transport-dark.webp"') ||
    !read('buggy.html').includes('data-src-light="assets/home-icons/transport-light.webp"')) {
  fail('the Buggy entry and detail page must share the premium Can-Am-style pickup pair');
}
const themeImages = [...home.matchAll(/<img\b[^>]*\bdata-theme-image\b[^>]*>/g)].map((match) => match[0]);
if (themeImages.length !== 14 || themeImages.some((tag) => !/data-src-light="assets\/home-icons\/[a-z]+-light\.webp"/.test(tag) || !/data-src-dark="assets\/home-icons\/[a-z]+-dark\.webp"/.test(tag) || !/alt=""/.test(tag))) {
  fail('home must use 14 decorative light/dark raster icon instances');
}
for (const name of ['checkin', 'wifi', 'instagram', 'valley', 'food', 'activities', 'weather', 'tickets', 'transport', 'vehicle', 'whatsapp', 'manual', 'firstaid', 'checkout', 'emergency']) {
  for (const themeName of ['light', 'dark']) {
    const asset = `assets/home-icons/${name}-${themeName}.webp`;
    if (!fs.existsSync(path.join(ROOT, asset))) fail(`missing generated home icon ${asset}`);
    else {
      const bytes = fs.readFileSync(path.join(ROOT, asset));
      if (bytes.length < 2_000 || bytes.length > 90_000 || bytes.subarray(0, 4).toString('ascii') !== 'RIFF' || bytes.subarray(8, 12).toString('ascii') !== 'WEBP') fail(`${asset} must be an optimized WebP asset`);
    }
  }
}
if (!theme.includes("querySelectorAll('img[data-theme-image]')") || !theme.includes("image.setAttribute('src', next)")) {
  fail('theme changes must swap generated home artwork without CSS filters');
}
if (!home.includes('class="card nearby-home-card') || !home.includes('Restaurantes, panoramas y servicios cercanos')) {
  fail('home must present Explore the Valley as a featured, descriptive entry');
}
if (!theme.includes("classList.add('preference-bar')") || !styles.includes('.preference-bar .theme-selector')) {
  fail('language and theme must share one reusable preference bar');
}
if (!/\.preference-bar,[\s\S]*?width:\s*100% !important;[\s\S]*?max-width:\s*none;/.test(styles) ||
    styles.includes('prefs-stack--inline.preference-bar { display: flex; width: max-content !important; }')) {
  fail('the preference surface must span the same full content width on every breakpoint');
}
if (nearby.includes('guide-place__sources') || nearby.includes('<b>Google ') || nearby.includes('<b>Tripadvisor ')) {
  fail('nearby cards must keep provenance internal and show a compact provider-neutral rating');
}
if (nearby.includes('duplicatesMerged') || nearby.includes('guide.quality.providers') || html.includes('id="guide-quality"')) {
  fail('guest UI must not expose provider or deduplication metadata');
}
if (!styles.includes('.action-icon') || !styles.includes('.catalog-action--maps { width: 44px')) {
  fail('external actions must use compact theme-aware icons instead of a Maps wordmark');
}
for (const asset of ['navigation', 'google-maps', 'website', 'instagram', 'phone']) {
  if (!styles.includes(`../assets/icons/${asset}.svg`)) fail(`theme-aware action icon mapping missing: ${asset}`);
}

if (!locationController.includes('geolocation.watchPosition') || !locationController.includes('enableHighAccuracy: true') ||
    !locationController.includes('ONCE_DEADLINE_MS = 20000') || !locationController.includes('REROUTE_DISTANCE_METERS = 25') ||
    !locationController.includes('REROUTE_INTERVAL_MS = 5000') || !locationController.includes('clearPrivateSnapshot()')) {
  fail('the shared controller must refine one-time GPS, throttle session reroutes and clear private coordinates');
}
if (!nearby.includes('CordalLocationController.create') || !catalog.includes('CordalLocationController.create') ||
    !nearby.includes("place._distanceSource = 'direct-current'") || !catalog.includes("source: 'direct-current'") ||
    !nearby.includes('travelHeadingReliable') || !nearby.includes('forwardDirection') ||
    !nearby.includes('locationGeneration') || !catalog.includes('locationGeneration')) {
  fail('all three guides must share GPS, show direct results immediately, infer direction and discard obsolete routes');
}
if (!nearby.includes('releasePrivateLocation') || !catalog.includes("document.addEventListener('cordal:access-ended'")) {
  fail('private coordinates, watchers and workers must be released on exit or access end');
}
if (!nearby.includes("if (mode === 'nearby' || mode === 'route') return userPosition") ||
    nearby.includes('data.geometry.corridor.ruralStart') || nearby.includes('enableHighAccuracy: false')) {
  fail('journey and current-location modes must never substitute Pinto or the apartment for the guest');
}
if (!roadClient.includes('INIT_TIMEOUT_MS = 10000') || !roadClient.includes('ROUTE_TIMEOUT_MS = 5000') ||
    !roadClient.includes('expectedGraph') || !nearby.includes("message.coverage === 'outside-network'") ||
    !catalog.includes("message.coverage === 'outside-network'")) {
  fail('road routing must time out, validate graph identity and preserve direct distances outside coverage');
}
if (!html.includes('id="guide-location-accuracy"') || !html.includes('id="guide-location-updated"') ||
    !html.includes('id="guide-map-user"') || !nearby.includes('userAccuracyCircle = L.circle') ||
    !nearby.includes("map.setView([userPosition.lat, userPosition.lon]")) {
  fail('map must show the real user position, accuracy radius, update time and recenter control');
}
if (!html.includes('data-location-choice="manual"') || !html.includes('id="guide-manual-confirm"') ||
    !nearby.includes('manualSelecting') || !nearby.includes("map.on('dragstart zoomstart'") ||
    !nearby.includes('followUser = false') || !catalog.includes('loadLeaflet()') ||
    !catalog.includes('data-catalog-manual-map')) {
  fail('manual point selection and opt-in mobile map following must be available without persisting coordinates');
}
if (!styles.includes('.guide-categories::-webkit-scrollbar { display: none') || !styles.includes('scrollbar-width: none') ||
    !nearby.includes("categories.addEventListener('wheel'") || !nearby.includes("event.key !== 'ArrowRight'")) {
  fail('category rail must scroll without a visible scrollbar using wheel, touch and keyboard');
}
if (!styles.includes('.guide-mode::-webkit-scrollbar { display: none')) fail('mobile discovery modes must not expose a visual scrollbar');
if (!nearby.includes("mapToggle.setAttribute('aria-pressed'") || !styles.includes('html[data-theme="dark"] .guide-map-toggle[aria-expanded="true"]')) {
  fail('map visibility control must expose state and retain strong contrast in both themes');
}

if (!process.exitCode) console.log('  PASS (premium theme art, direction-aware GPS, accessible map and scrollbar-free categories)');
