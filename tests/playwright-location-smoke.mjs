import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  console.log('  SKIP (Playwright is not installed in this environment)');
  process.exit(0);
}

const baseUrl = (process.env.CORDALSUR_TEST_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const exactPosition = { latitude: -36.912345, longitude: -71.501234, accuracy: 42 };
const cases = [
  { page: 'cerca-de-mi.html', language: 'es', viewport: { width: 390, height: 844 }, kind: 'guide' },
  { page: 'restaurantes.html', language: 'pt', viewport: { width: 430, height: 932 }, kind: 'catalog' },
  { page: 'actividades.html', language: 'en', viewport: { width: 1440, height: 900 }, kind: 'catalog' }
];

async function unlockIfNeeded(page) {
  await page.waitForFunction(() => (
    document.documentElement.classList.contains('access-granted') ||
    Boolean(document.querySelector('#cs-access-pin'))
  ), null, { timeout: 15000 });

  if (await page.evaluate(() => document.documentElement.classList.contains('access-granted'))) return;

  const pin = process.env.CORDALSUR_ACCESS_PIN;
  assert.ok(pin, 'CORDALSUR_ACCESS_PIN is required when the published access gate is active');
  await page.locator('#cs-access-pin').fill(pin);
  await page.locator('#cs-access-form').evaluate((form) => form.requestSubmit());
  await page.waitForFunction(
    () => document.documentElement.classList.contains('access-granted'),
    null,
    { timeout: 15000 }
  );
}

async function selectLocation(page, kind, choice = 'once') {
  if (kind === 'guide') {
    await page.locator('[data-guide-mode="nearby"]').click();
    await page.locator('#guide-location-dialog').waitFor({ state: 'visible' });
    await page.locator(`[data-location-choice="${choice}"]`).click();
    await page.waitForFunction(() => {
      const card = document.querySelector('.guide-place[data-distance-source]');
      return card && card.dataset.distanceSource !== 'road-apartment' && card.dataset.distanceSource !== 'unknown';
    });
    return;
  }
  await page.locator('[data-catalog-origin="location"]').click();
  await page.locator('[data-catalog-location-dialog]').waitFor({ state: 'visible' });
  await page.locator(`[data-catalog-location-choice="${choice}"]`).click();
  await page.waitForFunction(() => {
    const card = document.querySelector('.catalog-card[data-distance-source]');
    return card && card.dataset.distanceSource !== 'road-apartment' && card.dataset.distanceSource !== 'unknown';
  });
}

async function assertNoCoordinateLeak(page, requestUrls, consoleMessages) {
  const needles = ['-36.912345', '-71.501234', '36.912345', '71.501234'];
  const storage = await page.evaluate(() => JSON.stringify({
    local: { ...localStorage },
    session: { ...sessionStorage },
    href: location.href
  }));
  const surface = [storage, ...requestUrls, ...consoleMessages].join('\n');
  for (const needle of needles) assert.ok(!surface.includes(needle), `exact coordinate leaked: ${needle}`);
}

async function runPrimaryCase(browserType, browserName, scenario) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport: scenario.viewport,
    geolocation: exactPosition,
    permissions: ['geolocation'],
    locale: scenario.language === 'pt' ? 'pt-BR' : scenario.language
  });
  const page = await context.newPage();
  const requestUrls = [];
  const consoleMessages = [];
  page.on('request', (request) => requestUrls.push(request.url()));
  page.on('console', (message) => consoleMessages.push(message.text()));
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.goto(`${baseUrl}/${scenario.page}`, { waitUntil: 'domcontentloaded' });
  await unlockIfNeeded(page);
  await page.evaluate((language) => window.GH_I18N.setLang(language), scenario.language);
  await selectLocation(page, scenario.kind);

  const visibleCards = await page.locator(scenario.kind === 'guide' ? '.guide-place:visible' : '.catalog-card:visible').count();
  assert.ok(visibleCards > 0, `${browserName}/${scenario.page}: location left an empty list`);
  const status = await page.locator(scenario.kind === 'guide' ? '#nearby-status' : '[data-catalog-location-status]').textContent();
  assert.ok(status && status.trim(), `${browserName}/${scenario.page}: location status is missing`);

  if (scenario.kind === 'guide') {
    await page.locator('.guide-special--user').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#guide-map-shell').isVisible(), true, 'mobile map should open on the first valid fix');
    await page.locator('#guide-map-user').click();
    assert.ok(await page.locator('.leaflet-overlay-pane svg').count(), 'local map geometry must survive tile failure');
    await page.locator('#guide-map-tile-status').waitFor({ state: 'visible' });
    await page.locator('#guide-map-tile-retry').click();
    assert.ok(await page.locator('.guide-place:visible').count(), 'tile retry must not hide the list');
  }
  if (process.env.CORDALSUR_SCREENSHOTS === '1') {
    await page.screenshot({
      path: `/tmp/cordalsur-location-${browserName}-${scenario.language}-${scenario.viewport.width}.png`,
      fullPage: false
    });
  }
  await assertNoCoordinateLeak(page, requestUrls, consoleMessages);
  if (scenario.kind === 'guide') {
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('cordal:access-ended')));
    await page.waitForFunction(() => document.querySelector('[data-guide-mode="apartment"]')?.getAttribute('aria-pressed') === 'true');
    assert.equal(await page.locator('.guide-place[data-distance-source="direct-current"], .guide-place[data-distance-source="road-current"]').count(), 0, 'access end must remove private distance results');
    assert.equal(await page.locator('.guide-special--user').count(), 0, 'access end must remove the user marker');
  }
  await context.close();
  await browser.close();
}

async function runDeniedCase(browserType, browserName) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/cerca-de-mi.html`, { waitUntil: 'domcontentloaded' });
  await unlockIfNeeded(page);
  await page.locator('[data-guide-mode="nearby"]').click();
  await page.locator('[data-location-choice="once"]').click();
  await page.waitForFunction(() => /bloqueada|blocked|bloqueada/i.test(document.querySelector('#nearby-status')?.textContent || ''));
  assert.ok(await page.locator('.guide-place:visible').count(), `${browserName}: denial must preserve the previous list`);
  assert.equal(await page.locator('[data-guide-mode="apartment"]').getAttribute('aria-pressed'), 'true');
  await context.close();
  await browser.close();
}

async function runManualAndOutsideCases() {
  const browser = await playwright.chromium.launch({ headless: true });

  const cancelContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await cancelContext.addInitScript(() => {
    window.__cordalClearedWatches = 0;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition() { return 77; },
        clearWatch() { window.__cordalClearedWatches += 1; }
      }
    });
  });
  const cancelPage = await cancelContext.newPage();
  await cancelPage.goto(`${baseUrl}/cerca-de-mi.html`, { waitUntil: 'domcontentloaded' });
  await unlockIfNeeded(cancelPage);
  await cancelPage.locator('[data-guide-mode="nearby"]').click();
  await cancelPage.locator('[data-location-choice="session"]').click();
  await cancelPage.locator('#nearby-locate').click();
  await cancelPage.locator('[data-location-choice="none"]').click();
  assert.equal(await cancelPage.evaluate(() => window.__cordalClearedWatches), 1, 'Ahora no must stop a pending GPS watcher');
  assert.equal(await cancelPage.locator('[data-guide-mode="apartment"]').getAttribute('aria-pressed'), 'true');
  await cancelContext.close();

  const headingContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: -36.9127, longitude: -71.5012, accuracy: 10 },
    permissions: ['geolocation']
  });
  const headingPage = await headingContext.newPage();
  await headingPage.goto(`${baseUrl}/cerca-de-mi.html`, { waitUntil: 'domcontentloaded' });
  await unlockIfNeeded(headingPage);
  await headingPage.locator('[data-guide-mode="route"]').click();
  await headingPage.locator('[data-location-choice="session"]').click();
  await headingPage.locator('.guide-special--user').waitFor({ state: 'visible' });
  for (const latitude of [-36.91261, -36.91252, -36.91243]) {
    await headingContext.setGeolocation({ latitude, longitude: -71.5012, accuracy: 10 });
    await headingPage.waitForTimeout(80);
  }
  await headingPage.locator('#guide-behind-wrap').waitFor({ state: 'visible' });
  await headingContext.close();

  const manualContext = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const manualPage = await manualContext.newPage();
  await manualPage.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await manualPage.goto(`${baseUrl}/restaurantes.html`, { waitUntil: 'domcontentloaded' });
  await unlockIfNeeded(manualPage);
  await manualPage.locator('[data-catalog-origin="location"]').click();
  await manualPage.locator('[data-catalog-location-choice="manual"]').click();
  await manualPage.locator('[data-catalog-manual-map].leaflet-container').waitFor({ state: 'visible' });
  const box = await manualPage.locator('[data-catalog-manual-map]').boundingBox();
  assert.ok(box, 'manual selector map should be measurable');
  await manualPage.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.52);
  await manualPage.locator('[data-catalog-manual-confirm]').click();
  await manualPage.waitForFunction(() => document.querySelector('.catalog-card')?.dataset.distanceSource === 'direct-current' || document.querySelector('.catalog-card')?.dataset.distanceSource === 'road-current');
  await manualContext.close();

  const outsideContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    geolocation: { latitude: -33.4489, longitude: -70.6693, accuracy: 30 },
    permissions: ['geolocation']
  });
  const outsidePage = await outsideContext.newPage();
  await outsidePage.goto(`${baseUrl}/actividades.html`, { waitUntil: 'domcontentloaded' });
  await unlockIfNeeded(outsidePage);
  await selectLocation(outsidePage, 'catalog');
  await outsidePage.waitForFunction(() => /fuera|outside|fora/i.test(document.querySelector('[data-catalog-location-status]')?.textContent || ''), null, { timeout: 8000 });
  assert.ok(await outsidePage.locator('.catalog-card[data-distance-source="direct-current"]').count(), 'outside-network mode must retain direct distances');
  await outsideContext.close();

  const fastContext = await browser.newContext({ viewport: { width: 430, height: 932 } });
  await fastContext.addInitScript((position) => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition(success) {
          setTimeout(() => {
            window.__cordalGpsCallbackAt = performance.now();
            success({
              coords: {
                latitude: position.latitude,
                longitude: position.longitude,
                accuracy: position.accuracy,
                heading: null,
                speed: null
              },
              timestamp: Date.now()
            });
          }, 0);
          return 1;
        },
        clearWatch() {}
      }
    });
  }, exactPosition);
  const fastPage = await fastContext.newPage();
  await fastPage.goto(`${baseUrl}/restaurantes.html`, { waitUntil: 'domcontentloaded' });
  await unlockIfNeeded(fastPage);
  await selectLocation(fastPage, 'catalog');
  const directLatency = await fastPage.evaluate(() => performance.now() - window.__cordalGpsCallbackAt);
  assert.ok(directLatency < 500, `direct ordering took ${Math.round(directLatency)} ms after the GPS callback`);
  await fastContext.close();

  const blockedWorkerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: exactPosition,
    permissions: ['geolocation']
  });
  await blockedWorkerContext.addInitScript(() => {
    window.Worker = class BlockedWorker { constructor() { throw new Error('worker blocked by policy'); } };
  });
  const blockedWorkerPage = await blockedWorkerContext.newPage();
  await blockedWorkerPage.goto(`${baseUrl}/actividades.html`, { waitUntil: 'domcontentloaded' });
  await unlockIfNeeded(blockedWorkerPage);
  await selectLocation(blockedWorkerPage, 'catalog');
  await blockedWorkerPage.waitForFunction(() => /no respondió|did not respond|não respondeu/i.test(document.querySelector('[data-catalog-location-status]')?.textContent || ''));
  assert.ok(await blockedWorkerPage.locator('.catalog-card[data-distance-source="direct-current"]').count(), 'blocked Worker must retain immediate direct distances');
  await blockedWorkerContext.close();
  await browser.close();
}

for (const browserName of ['chromium', 'webkit']) {
  const browserType = playwright[browserName];
  for (const scenario of cases) await runPrimaryCase(browserType, browserName, scenario);
  await runDeniedCase(browserType, browserName);
}
await runManualAndOutsideCases();
console.log('  PASS (Chromium/WebKit geolocation, denial, manual point, tile failure, privacy and outside-network fallback)');
