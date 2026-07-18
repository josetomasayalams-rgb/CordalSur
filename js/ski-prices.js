const TIME_ZONE = 'America/Santiago';
const CACHE_PREFIX = 'cordalsur-ski-price-v1:';
const LOCALE_BY_LANGUAGE = { es: 'es-CL', pt: 'pt-BR', en: 'en-US' };

export function santiagoDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

export function formatClp(amount, language = 'es') {
  if (!Number.isInteger(amount)) return '';
  return new Intl.NumberFormat(LOCALE_BY_LANGUAGE[language] || LOCALE_BY_LANGUAGE.es, {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0
  }).format(amount);
}

export function cacheKey(date) {
  return `${CACHE_PREFIX}${date}`;
}

export function readCachedPrice(storage, date) {
  try {
    const parsed = JSON.parse(storage.getItem(cacheKey(date)) || 'null');
    return parsed && parsed.date === date && parsed.fetchedAt ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCachedPrice(storage, payload) {
  if (!payload || !payload.date || !payload.fetchedAt) return;
  try { storage.setItem(cacheKey(payload.date), JSON.stringify(payload)); } catch {}
}

export function createSkiPriceClient({ apiBase, fetcher = fetch, storage = localStorage }) {
  let active = null;
  let sequence = 0;

  async function load(date, { force = false } = {}) {
    const requestKey = `${date}:${force ? 'refresh' : 'normal'}`;
    if (active && active.key === requestKey) return active.promise;
    if (active) active.controller.abort();
    const controller = new AbortController();
    const requestSequence = ++sequence;
    const url = new URL(`${apiBase.replace(/\/$/, '')}/v1/public/ski-price`);
    url.searchParams.set('date', date);
    if (force) url.searchParams.set('refresh', '1');

    const promise = (async () => {
      try {
        const response = await fetcher(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error && body.error.code ? body.error.code : `HTTP_${response.status}`);
        writeCachedPrice(storage, body);
        return body;
      } catch (error) {
        if (error && error.name === 'AbortError') throw error;
        const cached = readCachedPrice(storage, date);
        if (cached) return { ...cached, stale: true, sourceStatus: 'client-cache' };
        throw error;
      } finally {
        if (active && active.sequence === requestSequence) active = null;
      }
    })();
    active = { key: requestKey, controller, promise, sequence: requestSequence };
    return promise;
  }

  return { load, isLoading: () => Boolean(active) };
}

function init() {
  const root = document.querySelector('[data-ski-price]');
  if (!root) return;
  const apiBase = root.getAttribute('data-api-base') || '';
  const dateInput = root.querySelector('[data-ski-date]');
  const refreshButton = root.querySelector('[data-ski-refresh]');
  const priceElement = root.querySelector('[data-ski-price-value]');
  const seasonElement = root.querySelector('[data-ski-season]');
  const statusElement = root.querySelector('[data-ski-status]');
  const updatedElement = root.querySelector('[data-ski-updated]');
  const sourceLink = root.querySelector('[data-ski-source]');
  const client = createSkiPriceClient({ apiBase });
  let currentPayload = null;
  let renderSequence = 0;

  function language() {
    return window.GH_I18N && window.GH_I18N.getLang ? window.GH_I18N.getLang() : 'es';
  }

  function text(key) {
    return window.GH_I18N && window.GH_I18N.t ? window.GH_I18N.t(key) : key;
  }

  function render(payload) {
    currentPayload = payload;
    const lang = language();
    priceElement.textContent = payload.available && Number.isInteger(payload.price)
      ? formatClp(payload.price, lang)
      : text('tickets.live.unavailable');
    seasonElement.textContent = payload.season ? text(`tickets.live.season.${payload.season}`) : text('tickets.live.season.none');
    const fetchedAt = new Date(payload.fetchedAt);
    updatedElement.textContent = `${text('tickets.live.updated')} ${new Intl.DateTimeFormat(LOCALE_BY_LANGUAGE[lang] || LOCALE_BY_LANGUAGE.es, {
      dateStyle: 'medium', timeStyle: 'short', timeZone: TIME_ZONE
    }).format(fetchedAt)}`;
    statusElement.textContent = payload.stale ? text('tickets.live.stale') : text('tickets.live.current');
    statusElement.dataset.state = payload.stale ? 'stale' : 'current';
    if (payload.sourceUrl) sourceLink.href = payload.sourceUrl;
  }

  async function update({ force = false } = {}) {
    const ownSequence = ++renderSequence;
    refreshButton.disabled = true;
    root.setAttribute('aria-busy', 'true');
    statusElement.textContent = text('tickets.live.loading');
    statusElement.dataset.state = 'loading';
    try {
      const payload = await client.load(dateInput.value, { force });
      if (ownSequence === renderSequence) render(payload);
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      if (ownSequence === renderSequence) {
        priceElement.textContent = text('tickets.live.unavailable');
        seasonElement.textContent = text('tickets.live.season.none');
        updatedElement.textContent = '';
        statusElement.textContent = text('tickets.live.error');
        statusElement.dataset.state = 'error';
      }
    } finally {
      if (ownSequence === renderSequence) {
        refreshButton.disabled = false;
        root.removeAttribute('aria-busy');
      }
    }
  }

  dateInput.value = santiagoDate();
  dateInput.addEventListener('change', () => update());
  refreshButton.addEventListener('click', () => update({ force: true }));
  if (window.GH_I18N && window.GH_I18N.subscribe) {
    window.GH_I18N.subscribe(() => { if (currentPayload) render(currentPayload); });
  }
  update();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}
