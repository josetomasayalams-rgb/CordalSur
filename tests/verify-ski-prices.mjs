import assert from 'node:assert/strict';
import test from 'node:test';
import { cacheKey, createSkiPriceClient, formatClp, readCachedPrice, santiagoDate } from '../js/ski-prices.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value))
  };
}

const payload = (date, price = 80_000) => ({
  date,
  product: 'Ticket diario web · Adulto y niño',
  currency: 'CLP',
  season: 'high',
  price,
  available: true,
  sourceUrl: 'https://www.nevadosdechillan.com/andariveles-y-pistas',
  fetchedAt: '2026-07-18T18:00:00.000Z',
  stale: false,
  sourceStatus: 'live'
});

test('Santiago date uses the Chilean calendar day around UTC midnight', () => {
  assert.equal(santiagoDate(new Date('2026-07-19T02:30:00Z')), '2026-07-18');
  assert.equal(santiagoDate(new Date('2026-01-19T02:30:00Z')), '2026-01-18');
});

test('CLP prices are localized without invented decimals', () => {
  assert.match(formatClp(80_000, 'es'), /80\.000/);
  assert.match(formatClp(70_000, 'pt'), /70\.000/);
  assert.match(formatClp(80_000, 'en'), /80,000/);
  assert.equal(formatClp(null, 'es'), '');
});

test('price client deduplicates equal requests and persists verified data', async () => {
  const storage = memoryStorage();
  let calls = 0;
  let resolveFetch;
  const fetcher = () => {
    calls += 1;
    return new Promise((resolve) => { resolveFetch = () => resolve(new Response(JSON.stringify(payload('2026-07-19')), { status: 200 })); });
  };
  const client = createSkiPriceClient({ apiBase: 'https://worker.example', fetcher, storage });
  const first = client.load('2026-07-19');
  const second = client.load('2026-07-19');
  assert.equal(calls, 1);
  assert.equal(client.isLoading(), true);
  resolveFetch();
  assert.equal((await first).price, 80_000);
  assert.equal((await second).price, 80_000);
  assert.equal(readCachedPrice(storage, '2026-07-19').price, 80_000);
  assert.match(cacheKey('2026-07-19'), /2026-07-19$/);
  assert.equal(client.isLoading(), false);
});

test('price client adds refresh intent and falls back only to a verified cached value', async () => {
  const storage = memoryStorage();
  storage.setItem(cacheKey('2026-08-03'), JSON.stringify(payload('2026-08-03', 70_000)));
  let requestedUrl = '';
  const client = createSkiPriceClient({
    apiBase: 'https://worker.example/',
    storage,
    fetcher: async (url) => {
      requestedUrl = String(url);
      throw new Error('offline');
    }
  });
  const cached = await client.load('2026-08-03', { force: true });
  assert.equal(cached.price, 70_000);
  assert.equal(cached.stale, true);
  assert.match(requestedUrl, /refresh=1/);

  const emptyClient = createSkiPriceClient({ apiBase: 'https://worker.example', storage: memoryStorage(), fetcher: async () => { throw new Error('offline'); } });
  await assert.rejects(() => emptyClient.load('2026-08-04'), /offline/);
});
