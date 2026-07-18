import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const fail = (message) => { console.error(`  FAIL: ${message}`); process.exitCode = 1; };

const hostData = JSON.parse(read('data/host-data.json'));
const climate = read('clima.html');
const tickets = read('tickets.html');
const checkin = read('check-in.html');
const styles = read('css/styles.css');
const lang = read('js/lang.js');
const theme = read('js/theme.js');
const skiPrices = read('js/ski-prices.js');

const expectedUrls = {
  'clima.forecast': 'https://es.snow-forecast.com/resorts/Chillan/6day/bot',
  'clima.cameras': 'https://www.nevadosdechillan.com/camaras',
  'clima.mountainReport': 'https://www.nevadosdechillan.com/reporte-montana',
  'tickets.buy': 'https://www.skipassnevadosdechillan.com/tienda/',
  'tickets.mountainReport': 'https://www.nevadosdechillan.com/reporte-montana'
};

for (const [key, url] of Object.entries(expectedUrls)) {
  if (hostData.urls?.[key] !== url) fail(`data.urls.${key} must use the verified destination`);
  const page = key.startsWith('clima.') ? climate : tickets;
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const link = page.match(new RegExp(`<a\\b[^>]*href="${escaped}"[^>]*>`))?.[0] || '';
  if (!link.includes('target="_blank"') || !link.includes('rel="noopener noreferrer"')) {
    fail(`${key} must open safely in a new tab`);
  }
}

for (const key of [
  'clima.fc.cameras.title', 'clima.fc.cameras.subtitle', 'clima.fc.cameras.cta',
  'clima.fc.report.title', 'clima.fc.report.subtitle', 'clima.fc.report.cta',
  'tickets.live.product', 'tickets.live.date', 'tickets.live.refresh',
  'tickets.live.unavailable', 'tickets.live.season.high', 'tickets.live.season.low',
  'tickets.live.loading', 'tickets.live.current', 'tickets.live.stale',
  'tickets.live.error', 'tickets.live.updated', 'tickets.live.source', 'tickets.buy.title',
  'tickets.buy.detail', 'tickets.buy.cta', 'tickets.report.title',
  'tickets.report.detail', 'tickets.report.cta', 'checkin.parking.tag',
  'checkin.parking.title', 'checkin.parking.body', 'checkin.locker.tag',
  'checkin.locker.title', 'checkin.locker.reference', 'checkin.locker.body', 'checkin.locker.action'
]) {
  const matches = lang.match(new RegExp(`'${key.replaceAll('.', '\\.')}':`, 'g')) || [];
  if (matches.length !== 3) fail(`${key} must exist once in ES, PT and EN`);
}

if (!tickets.includes('data-ski-price') || !tickets.includes('data-ski-date') ||
    !tickets.includes('data-ski-refresh') || !tickets.includes('js/ski-prices.js') ||
    /Desde \$65\.000|From \$65,000|A partir de \$65\.000/.test(tickets) ||
    !skiPrices.includes("timeZone: TIME_ZONE") || !skiPrices.includes("refresh', '1") ||
    !skiPrices.includes("sourceStatus: 'client-cache'")) {
  fail('the day-pass card must query the official date-based price, support refresh and retain verified cache only');
}

if (!checkin.includes('DEPTO-34') ||
    !checkin.includes('data-i18n="checkin.parking.body"') ||
    !hostData.scalar?.['checkin.parking.body']?.es.includes('mano izquierda')) {
  fail('Check-in must identify underground parking DEPTO-34 beside the left side of the access stairs');
}
if (!checkin.includes('data-i18n="checkin.locker.body"') || !checkin.includes('href="buggy.html"') ||
    !hostData.scalar?.['checkin.locker.body']?.es.includes('locker 23') ||
    !hostData.scalar?.['checkin.locker.body']?.es.includes('piso -1') ||
    !hostData.scalar?.['checkin.locker.body']?.es.includes('salida exterior')) {
  fail('Check-in must explain the locker 23 route and link to the buggy guide');
}

for (const asset of ['camera.svg', 'mountain-snow.svg', 'ticket-check.svg', 'refresh-cw.svg', 'warehouse.svg']) {
  if (!fs.existsSync(path.join(ROOT, 'assets/icons', asset))) fail(`missing mountain resource icon ${asset}`);
}
if (fs.existsSync(path.join(ROOT, 'assets/icons/ticket.svg')) ||
    !read('assets/icons/mountain-snow.svg').includes('M4.14 15.08') ||
    !read('assets/icons/ticket-check.svg').includes('m9 12 2 2 4-4') ||
    (tickets.match(/mountain-resource__icon--mountain/g) || []).length !== 1 ||
    (climate.match(/mountain-resource__icon--mountain/g) || []).length !== 1) {
  fail('Clima and Tickets must share the corrected Lucide mountain and ticket resources');
}

if (!/\.preference-bar,[\s\S]*?border-radius:\s*999px;[\s\S]*?clip-path:\s*inset\(0 round 999px\)/.test(styles)) {
  fail('the preference panel must clip all four corners to a fully rounded shape');
}
if (!/\.theme-selector button,[\s\S]*?display:\s*grid;[\s\S]*?place-items:\s*center;[\s\S]*?padding:\s*0;/.test(styles) ||
    !/\.theme-selector__icon\s*\{[\s\S]*?display:\s*block;/.test(styles)) {
  fail('sun and moon controls must center their icons geometrically');
}
if (!styles.includes('--ui-surface-raised: rgba(255, 253, 247, .975)') ||
    !styles.includes('--ui-surface-raised: rgba(12, 37, 31, .97)') ||
    !styles.includes('html[data-theme="light"] .preference-bar') ||
    !styles.includes('html[data-theme="dark"] .preference-bar')) {
  fail('preference surface must remain ivory in light mode and green in dark mode');
}

const pagesWithPreferences = [
  'index.html', 'check-in.html', 'check-out.html', 'instrucciones.html', 'clima.html', 'tickets.html',
  'cerca-de-mi.html', 'restaurantes.html', 'actividades.html', 'botiquin.html', 'buggy.html'
];
for (const page of pagesWithPreferences) {
  const html = read(page);
  if ((html.match(/class="lang-selector"/g) || []).length !== 1 || !html.includes('js/theme.js')) {
    fail(`${page} must use the single shared language/theme preference component`);
  }
}
if (!theme.includes("preferenceBar.className = 'preference-bar prefs-stack prefs-stack--inline'") ||
    !styles.includes('min-width: 44px !important; min-height: 44px !important;')) {
  fail('all preference bars must be created by the shared control with 44px touch targets');
}

if (!process.exitCode) console.log('  PASS (shared preferences, live ski price, corrected icons, parking and locker 23)');
