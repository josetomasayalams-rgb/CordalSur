import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVICE_ROOT = path.resolve(ROOT, 'worker');
const fail = (message) => {
  console.error(`  FAIL: ${message}`);
  process.exitCode = 1;
};
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const readService = (relative) => fs.readFileSync(path.join(SERVICE_ROOT, relative), 'utf8');

const htmlFiles = fs.readdirSync(ROOT).filter((file) => file.endsWith('.html')).sort();
const expectedPages = [
  'index.html', 'check-in.html', 'check-out.html', 'restaurantes.html',
  'actividades.html', 'clima.html', 'tickets.html', 'instrucciones.html',
  'botiquin.html', 'buggy.html'
];
for (const file of expectedPages) {
  if (!htmlFiles.includes(file)) fail(`missing canonical page ${file}`);
  const html = read(file);
  if (!/<title>[^<]*CordalSur[^<]*<\/title>/i.test(html)) fail(`${file}: static title must contain CordalSur`);
  if (!/<html\b[^>]*data-i18n-title="page\.[^"]+"/i.test(html)) fail(`${file}: <html> needs a localized page.* title key`);
  if (!html.includes('js/lang.js?v=6')) fail(`${file}: localized copy must use the current cache version`);
  if (!html.includes("document.documentElement.classList.add('access-pending')") ||
      !html.includes('css/access.css?v=2') || !html.includes('js/access.js?v=2')) {
    fail(`${file}: guest gate must load before protected content is shown`);
  }
  if (html.includes('fonts.googleapis.com') || html.includes('fonts.gstatic.com')) {
    fail(`${file}: brand fonts must be served locally`);
  }
  if (!html.includes('https://cordal-sur-access.josetomasayalams.workers.dev')) {
    fail(`${file}: production access API URL is missing`);
  }
}

const index = read('index.html');
const checkin = read('check-in.html');
const manual = read('instrucciones.html');
const logoPath = 'assets/brand/cordal-sur-symbol-reverse-1024.png';
if (!fs.existsSync(path.join(ROOT, logoPath))) fail(`missing official logo asset ${logoPath}`);
if (!index.includes(`src="${logoPath}"`) ||
    !/<img\b[^>]*cordal-sur-symbol-reverse-1024\.png[^>]*\bwidth="\d+"[^>]*\bheight="\d+"[^>]*\balt=""/i.test(index)) {
  fail('index.html must render the official decorative logo with explicit dimensions and alt=""');
}
const phone = '56990137732';
const instagram = 'https://www.instagram.com/cordal_sur/';
if (!index.includes(`wa.me/${phone}`) || !checkin.includes(`wa.me/${phone}`)) {
  fail('index and check-in must link to the configured WhatsApp number');
}
for (const number of ['131', '132', '133', '136', '130']) {
  if (!index.includes(`href="tel:${number}"`)) fail(`index.html missing emergency link tel:${number}`);
}
if (!index.includes('class="emergency-card') || !index.includes('<details')) {
  fail('index.html must use the calm disclosure emergency module');
}

const hostData = JSON.parse(read('data/host-data.json'));
if (hostData.scalar?.brand?.es !== 'CordalSur' ||
    hostData.scalar?.brand?.pt !== 'CordalSur' ||
    hostData.scalar?.brand?.en !== 'CordalSur') {
  fail('canonical brand must be CordalSur in all languages');
}
if (hostData.publicSupport?.whatsappUrl !== `https://wa.me/${phone}`) {
  fail('canonical publicSupport.whatsappUrl is incorrect');
}
if (hostData.publicSupport?.instagramUrl !== instagram) {
  fail('canonical publicSupport.instagramUrl is incorrect');
}
for (const [file, html] of [['index.html', index], ['check-in.html', checkin]]) {
  const instagramLink = html.match(/<a\b[^>]*\bdata-instagram-link\b[^>]*>[\s\S]*?<\/a>/i)?.[0] || '';
  if (!instagramLink.includes(`href="${instagram}"`) ||
      !instagramLink.includes('target="_blank"') ||
      !instagramLink.includes('rel="noopener"') ||
      !instagramLink.includes('<svg')) {
    fail(`${file} must show a safe, icon-based link to the canonical Instagram profile`);
  }
}
if (!checkin.includes('css/styles.css?v=7')) {
  fail('check-in must use the current brand styles');
}
if (hostData.urls?.['quick.wa'] !== `https://wa.me/${phone}`) {
  fail('canonical urls.quick.wa is incorrect');
}
const whatsappScript = read('js/whatsapp.js');
if (!whatsappScript.includes(`var PHONE = '${phone}'`)) {
  fail('js/whatsapp.js must receive the canonical public support phone');
}
if (!index.includes(`wa.me/${phone}?text=`) || !checkin.includes(`wa.me/${phone}?text=`)) {
  fail('WhatsApp links need a static localized-message fallback');
}

for (const asset of [
  'assets/brand/Manrope-Regular.woff',
  'assets/brand/Manrope-SemiBold.woff',
  'assets/brand/Manrope-ExtraBold.woff',
  'assets/brand/cordal-sur-symbol-reverse.svg'
]) {
  if (!fs.existsSync(path.join(ROOT, asset))) fail(`missing local brand asset ${asset}`);
}
const styles = read('css/styles.css');
const accessStyles = read('css/access.css');
for (const token of ['#153b33', '#d9a24f']) {
  if (!styles.toLowerCase().includes(token) || !accessStyles.toLowerCase().includes(token)) {
    fail(`official brand token ${token} must be shared by the guide and access screen`);
  }
}
if (!styles.includes("font-family: 'Manrope'") || !accessStyles.includes('font-family: Manrope')) {
  fail('the guide and access screen must use local Manrope');
}
if (!read('js/theme.js').includes("return 'dark';") ||
    !index.includes('if(t!=="light"&&t!=="dark"){t="dark"}') ||
    !index.includes('js/theme.js?v=5')) {
  fail('the first visit must default to dark while preserving manual selection');
}
if (!styles.includes('--photo-overlay-home') || !styles.includes('--photo-overlay-inner') ||
    !styles.includes('var(--photo-overlay-home)') || !styles.includes('var(--photo-overlay-inner)') ||
    !index.includes('js/backgrounds.js?v=2')) {
  fail('photos must use the cache-busted, theme-aware green and ivory filters');
}

if (!index.includes('href="instrucciones.html#wifi"') || !index.includes('quick-access__item--instagram')) {
  fail('home must expose the Wi-Fi and Instagram quick-access tiles after Check-in');
}
if (!manual.includes('id="wifi"') || !manual.includes('data-wifi-copy') ||
    !manual.includes('js/manual.js?v=1') || !manual.includes('data-i18n="wifi.password.value"')) {
  fail('Manual must expose the translated Wi-Fi card and copy action');
}
if (manual.includes('data-i18n="info.q1"') || manual.includes('data-i18n="info.a1"')) {
  fail('Manual must not keep the duplicate Wi-Fi accordion');
}
const manualScript = read('js/manual.js');
if (!manualScript.includes('navigator.clipboard') || !manualScript.includes('data-wifi-status')) {
  fail('Wi-Fi copy action must use the Clipboard API and an accessible status region');
}
const wifiValue = hostData.scalar?.['wifi.password.value'];
if (!wifiValue || ['es', 'pt', 'en'].some((language) => wifiValue[language] !== 'Mateo123')) {
  fail('public Wi-Fi password must be Mateo123 in ES/PT/EN');
}

const userFacing = htmlFiles.map((file) => read(file)).join('\n') + '\n' + read('js/lang.js');
if (/Guest Hub/i.test(userFacing)) fail('legacy Guest Hub brand remains in user-facing files');
if (/Andes Chill[aá]n\s*[-·|]\s*Guest Hub/i.test(userFacing)) fail('legacy Andes Chillán brand title remains');
if (!/Las Trancas · Nevados de Chillán/.test(userFacing)) fail('location Las Trancas · Nevados de Chillán must remain');

if (!index.includes(logoPath)) fail('home must render the copied CordalSur symbol');
for (const file of htmlFiles.filter((file) => file !== 'index.html')) {
  if (read(file).includes(logoPath)) fail(`${file}: the symbol must appear visually only on home`);
}

const runtimePinCorpus = [
  read('js/access.js'), read('js/admin.js'),
  readService('src/index.js'), readService('.dev.vars.example')
].join('\n');
if (/\b\d{2}-\d{2}\b/.test(runtimePinCorpus)) {
  fail('a literal numeric PIN is exposed in browser or Worker runtime source');
}
for (const key of ['access.pin.placeholder', 'admin.pin.placeholder', 'admin.guestPin.placeholder']) {
  const localized = hostData.scalar?.[key];
  if (!localized || ['es', 'pt', 'en'].some((language) => localized[language] !== 'NN-NN')) {
    fail(`${key} must remain a neutral NN-NN placeholder in every language`);
  }
}
if (!readService('src/index.js').includes('DEFAULT_GUEST_PIN_DIGEST')) {
  fail('the default guest PIN must be provided only as a Worker secret digest');
}
if (userFacing.includes('__CORDAL_SUR_ACCESS_API__')) fail('unresolved access API placeholder remains');

const accessScript = read('js/access.js');
const adminScript = read('js/admin.js');
const adminHtml = read('admin.html');
if (!accessScript.includes("var ADMIN_TOKEN_KEY = 'cordal-sur-admin-token-v1'") ||
    !accessScript.includes('sessionStorage.getItem(ADMIN_TOKEN_KEY)')) {
  fail('the public gate must read the administrator session from sessionStorage');
}
if (/localStorage\.(?:getItem|setItem)\(ADMIN_TOKEN_KEY\)/.test(accessScript)) {
  fail('the administrator token must never be persisted in localStorage');
}
if (!accessScript.includes('session.role !== candidate.role') ||
    !accessScript.includes('result.role !== sessionRole')) {
  fail('the public gate must verify the server-confirmed role before granting administrator access');
}
if (!accessScript.includes('async function restoreGuestSession()') ||
    !accessScript.includes('async function expireActiveSession(error)') ||
    !accessScript.includes("failedRole === 'admin' && await restoreGuestSession()") ||
    !accessScript.includes("addEventListener('pageshow'")) {
  fail('administrator access must revalidate after history restores and safely fall back to a valid guest session');
}
if (!adminScript.includes('href="index.html"') || !adminScript.includes("t('admin.enterSite')") ||
    !adminHtml.includes('js/lang.js?v=6') || !adminHtml.includes('js/admin.js?v=2')) {
  fail('Administration must expose the localized same-tab platform entry action');
}
const enterSiteCopy = hostData.scalar?.['admin.enterSite'];
if (!enterSiteCopy || !enterSiteCopy.es || !enterSiteCopy.pt || !enterSiteCopy.en) {
  fail('admin.enterSite must be translated in ES/PT/EN');
}

if (!process.exitCode) console.log('  PASS (brand, Instagram, Wi-Fi, emergency, admin access and page-title contract)');
