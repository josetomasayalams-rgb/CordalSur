import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const fail = (message) => {
  console.error(`  FAIL: ${message}`);
  process.exitCode = 1;
};

const guide = JSON.parse(read('data/destination-guide.json'));
const nearby = read('js/nearby.js');
const activitiesHtml = read('actividades.html');
const provisionsHtml = read('restaurantes.html');

const ACTIVITY_CATEGORIES = new Set(['tourism', 'thermal_baths', 'ski', 'trail', 'adventure']);
const LODGING_CATEGORIES = new Set(['hotel', 'cabin']);
const QUICK_CATEGORIES = [
  'restaurant', 'coffee', 'fast_food', 'bakery', 'supermarket', 'convenience',
  'hardware', 'home_improvement', 'pharmacy', 'medical', 'veterinary',
  'gas_station', 'bank', 'atm', 'laundry', 'shopping', 'vehicle_service', 'emergency'
];

function attributes(source) {
  const result = {};
  for (const match of source.matchAll(/([\w:-]+)="([^"]*)"/g)) result[match[1]] = match[2];
  return result;
}

function cardsFrom(html) {
  return [...html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g)]
    .filter((match) => /\bclass="[^"]*\bcatalog-card\b/.test(match[1]))
    .map((match) => ({ attributes: attributes(match[1]), body: match[2], openingTag: match[1] }));
}

function sameIds(actual, expected, label) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  if (actualSet.size !== actual.length) fail(`${label}: duplicate card id`);
  const missing = expected.filter((id) => !actualSet.has(id));
  const unexpected = actual.filter((id) => !expectedSet.has(id));
  if (missing.length || unexpected.length) {
    fail(`${label}: catalog mismatch (missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'})`);
  }
}

function directRoute(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'suda.io') return /^\/activity\/[A-Za-z0-9]+\/?$/.test(parsed.pathname);
    if (parsed.hostname === 'www.trailforks.com') return /^\/trails\/[^/]+\/?$/.test(parsed.pathname);
    if (parsed.hostname === 'es.wikiloc.com') return /^\/rutas-[^/]+\/[^/]+-\d+\/?$/.test(parsed.pathname);
    return false;
  } catch {
    return false;
  }
}

const quickBlock = nearby.match(/var EXPLORE_QUICK_CATEGORIES = \{([\s\S]*?)\n\s*\};/)?.[1] || '';
const quickKeys = [...quickBlock.matchAll(/^\s*([a-z_]+):\s*true,?\s*$/gm)].map((match) => match[1]);
sameIds(quickKeys, QUICK_CATEGORIES, 'Explore quick categories');
if (quickKeys.some((category) => ACTIVITY_CATEGORIES.has(category) || LODGING_CATEGORIES.has(category))) {
  fail('Explore the Valley must not include activities or lodging');
}
if (!/publicPlaces\s*=\s*data\.places\.filter\([\s\S]*?EXPLORE_QUICK_CATEGORIES\[place\.category\][\s\S]*?place\.routingEligible !== false[\s\S]*?place\.status !== 'candidate_coordinate'/.test(nearby)) {
  fail('Explore the Valley must publish only routable quick-service places from its explicit allowlist');
}

if (!Array.isArray(guide.offerings) || guide.offerings.length !== 53 || !Array.isArray(guide.catalogEntries)) {
  fail('destination guide must provide the 53 editorial offerings and researched catalog entries');
}

const activityCards = cardsFrom(activitiesHtml);
const provisionCards = cardsFrom(provisionsHtml);
const activityEntries = guide.catalogEntries.filter((entry) => entry.catalog === 'activities');
const provisionEntries = guide.catalogEntries.filter((entry) => entry.catalog === 'provisions');
const provisionPlaces = guide.places.filter((place) => !ACTIVITY_CATEGORIES.has(place.category) && !LODGING_CATEGORIES.has(place.category));

sameIds(
  activityCards.map((card) => card.attributes['data-id']),
  guide.offerings.map((offering) => `offering-${offering.id}`).concat(activityEntries.map((entry) => entry.id)),
  'Activities'
);
sameIds(
  provisionCards.map((card) => card.attributes['data-id']),
  provisionPlaces.map((place) => place.id).concat(provisionEntries.map((entry) => entry.id)),
  'Food and provisions'
);

const activityKinds = activityCards.reduce((counts, card) => {
  const kind = card.attributes['data-kind'];
  counts[kind] = (counts[kind] || 0) + 1;
  return counts;
}, {});
const provisionKinds = provisionCards.reduce((counts, card) => {
  const kind = card.attributes['data-kind'];
  counts[kind] = (counts[kind] || 0) + 1;
  return counts;
}, {});
if (activityKinds.offering !== guide.offerings.length || activityKinds.directory !== activityEntries.length) {
  fail('Activities must render offerings and researched route entries as distinct card kinds');
}
if (provisionKinds.place !== provisionPlaces.length || provisionKinds.directory !== provisionEntries.length) {
  fail('Food and provisions must render every non-activity place plus researched directory entries');
}
if (activityCards.concat(provisionCards).some((card) => LODGING_CATEGORIES.has(card.attributes['data-category']))) {
  fail('lodging must remain outside both catalogs');
}

for (const card of activityCards.concat(provisionCards)) {
  if (card.attributes['data-routing-eligible'] !== 'false') continue;
  for (const attribute of ['data-distance', 'data-apartment-distance']) {
    if (card.attributes[attribute] !== '') fail(`${card.attributes['data-id']}: non-routable card exposes ${attribute}`);
  }
  for (const attribute of ['data-distance-source', 'data-apartment-distance-source']) {
    if (card.attributes[attribute] !== 'unknown') fail(`${card.attributes['data-id']}: non-routable card exposes a distance source`);
  }
  if (/\bcatalog-distance\b|\bcatalog-action--(?:navigation|maps)\b/.test(card.body)) {
    fail(`${card.attributes['data-id']}: non-routable card exposes distance or vehicle navigation UI`);
  }
}
if (!/if \(!isRoutingEligible\(card\)\)[\s\S]*?source: 'unknown'/.test(read('js/catalog-guide.js'))) {
  fail('catalog runtime must skip distance updates for non-routable cards');
}

const verifiedProfileKinds = new Set(['osm_contact_tag', 'manual_verified_override', 'editorial_verified_profile']);
const publishedPlaceProfiles = guide.places.filter((place) => place.instagram);
if (!publishedPlaceProfiles.some((place) => place.instagram.verifiedBy === 'editorial_verified_profile') ||
    publishedPlaceProfiles.some((place) => !verifiedProfileKinds.has(place.instagram.verifiedBy))) {
  fail('place Instagram profiles must accept researched editorial verification and reject unknown provenance');
}
const provisionCardsById = new Map(provisionCards.map((card) => [card.attributes['data-id'], card]));
for (const item of provisionPlaces.concat(provisionEntries).filter((entry) => entry.instagram?.value)) {
  const card = provisionCardsById.get(item.id);
  if (!card?.body.includes(`href="${item.instagram.value}"`) || !/\bcatalog-action--instagram\b/.test(card.body)) {
    fail(`${item.id}: verified Instagram profile is missing from the provisions catalog`);
  }
}
const mcPato = guide.places.find((place) => place.legacyId === 'super-mcpato');
const mcPatoUrl = 'https://www.instagram.com/minimarket_mcpato/';
if (mcPato?.instagram?.value !== mcPatoUrl || mcPato.instagram.verifiedBy !== 'editorial_verified_profile' ||
    !provisionsHtml.includes(`href="${mcPatoUrl}"`) || /mc\.pato_supermercado/i.test(JSON.stringify(guide) + provisionsHtml)) {
  fail('McPato must use the verified minimarket_mcpato profile and never the retired handle');
}

const expectedRoutes = new Map();
for (const offering of guide.offerings) {
  if (offering.routeUrl) expectedRoutes.set(`offering-${offering.id}`, offering.routeUrl);
}
for (const entry of activityEntries) {
  if (entry.routeAccess?.url) expectedRoutes.set(entry.id, entry.routeAccess.url);
}
const renderedRoutes = [];
for (const card of activityCards) {
  const matches = [...card.body.matchAll(/<a\b[^>]*class="[^"]*\bcatalog-action--route\b[^"]*"[^>]*href="([^"]+)"[^>]*>/g)];
  const expected = expectedRoutes.get(card.attributes['data-id']);
  if (!expected && matches.length) fail(`${card.attributes['data-id']}: unexpected route action`);
  if (expected && (matches.length !== 1 || matches[0][1] !== expected)) fail(`${card.attributes['data-id']}: direct route action mismatch`);
  for (const match of matches) {
    renderedRoutes.push(match[1]);
    if (!match[0].includes('target="_blank"') || !match[0].includes('rel="noopener"')) {
      fail(`${card.attributes['data-id']}: route action must open safely in a new tab`);
    }
  }
}
if (renderedRoutes.length !== expectedRoutes.size || renderedRoutes.some((url) => !directRoute(url))) {
  fail('route actions must link to individual SUDA, Trailforks or verified Wikiloc routes, never generic directories');
}
if (!renderedRoutes.some((url) => url.startsWith('https://suda.io/activity/')) ||
    !renderedRoutes.some((url) => url.startsWith('https://www.trailforks.com/trails/'))) {
  fail('Activities must expose direct routes from both SUDA and Trailforks');
}

if (!process.exitCode) {
  console.log(`  PASS (Explore allowlist; ${activityCards.length} activities; ${provisionCards.length} food/provision entries; ${renderedRoutes.length} direct routes)`);
}
