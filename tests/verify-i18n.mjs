import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['es', 'pt', 'en'];
const fail = (message) => {
  console.error(`  FAIL: ${message}`);
  process.exitCode = 1;
};

const source = fs.readFileSync(path.join(ROOT, 'js/lang.js'), 'utf8');
const instrumented = source.replace(
  'var I18N = {',
  'var I18N = globalThis.__CORDAL_I18N__ = {'
);
const noop = () => {};
const documentElement = {
  classList: { add: noop },
  getAttribute: () => null,
  lang: ''
};
const context = {
  document: {
    addEventListener: noop,
    documentElement,
    querySelector: () => null,
    querySelectorAll: () => [],
    title: ''
  },
  localStorage: { getItem: () => '', setItem: noop },
  window: { addEventListener: noop, matchMedia: () => ({ matches: true }) }
};
vm.createContext(context);
vm.runInContext(instrumented, context, { filename: 'js/lang.js' });
const dictionaries = context.__CORDAL_I18N__;

if (!dictionaries) fail('lang.js did not expose its dictionaries to the verifier');

const baseKeys = Object.keys(dictionaries.es).sort();
for (const lang of LANGS) {
  const keys = Object.keys(dictionaries[lang] || {}).sort();
  const missing = baseKeys.filter((key) => !keys.includes(key));
  const extra = keys.filter((key) => !baseKeys.includes(key));
  if (missing.length || extra.length) {
    fail(`${lang} key parity: missing=[${missing.join(', ')}] extra=[${extra.join(', ')}]`);
  }
}

for (const lang of LANGS) {
  const marker = `${lang}: {`;
  const start = source.indexOf(marker);
  const end = source.indexOf('\n    }', start + marker.length);
  if (start < 0 || end < 0) {
    fail(`could not locate ${lang} dictionary block`);
    continue;
  }
  const body = source.slice(start + marker.length, end);
  const seen = new Set();
  const duplicates = new Set();
  for (const match of body.matchAll(/'([a-zA-Z0-9_.-]+)':\s*'/g)) {
    if (seen.has(match[1])) duplicates.add(match[1]);
    seen.add(match[1]);
  }
  if (duplicates.size) fail(`${lang} duplicate keys: ${[...duplicates].join(', ')}`);
}

const placeholders = (value) => [...String(value).matchAll(/\{([a-zA-Z0-9_]+)\}/g)]
  .map((match) => match[1]).sort().join(',');
for (const key of baseKeys) {
  const expected = placeholders(dictionaries.es[key]);
  for (const lang of ['pt', 'en']) {
    const actual = placeholders(dictionaries[lang][key]);
    if (actual !== expected) fail(`${key}: placeholder mismatch es=[${expected}] ${lang}=[${actual}]`);
  }
}

const requiredPrefixes = ['access.', 'admin.', 'emergency.', 'whatsapp.checkin.'];
for (const prefix of requiredPrefixes) {
  if (!baseKeys.some((key) => key.startsWith(prefix))) fail(`missing required namespace ${prefix}`);
}
for (const key of ['brand', 'act.filter.count', 'rest.filter.count']) {
  if (!baseKeys.includes(key)) fail(`missing required key ${key}`);
}
for (const lang of LANGS) {
  if (dictionaries[lang].brand !== 'Cordal Sur') fail(`${lang}.brand must be Cordal Sur`);
  for (const key of ['act.filter.count', 'rest.filter.count']) {
    if (placeholders(dictionaries[lang][key]) !== 'shown,total') {
      fail(`${lang}.${key} must contain {shown} and {total}`);
    }
  }
}

const hostData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/host-data.json'), 'utf8'));
for (const [key, value] of Object.entries(hostData.scalar || {})) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`data.scalar.${key} must be an { es, pt, en } object`);
    continue;
  }
  for (const lang of LANGS) {
    if (typeof value[lang] !== 'string') fail(`data.scalar.${key}.${lang} must be a string`);
  }
}

const htmlFiles = fs.readdirSync(ROOT).filter((file) => file.endsWith('.html'));
for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const match of html.matchAll(/data-i18n(?:-aria|-title|-placeholder)?="([^"]+)"/g)) {
    if (!baseKeys.includes(match[1])) fail(`${file}: unknown i18n key ${match[1]}`);
  }

  // Inputs and interactive controls must not freeze translated accessibility copy.
  for (const match of html.matchAll(/<(?:a|button|input)\b[^>]*(?:aria-label|placeholder|title)="[^"]+"[^>]*>/gi)) {
    const tag = match[0];
    if (/aria-label=/.test(tag) && !/data-i18n-aria=/.test(tag) && !/aria-label="Built by /.test(tag)) {
      fail(`${file}: hardcoded aria-label without data-i18n-aria: ${tag.slice(0, 120)}`);
    }
    if (/placeholder=/.test(tag) && !/data-i18n-placeholder=/.test(tag)) {
      fail(`${file}: hardcoded placeholder without data-i18n-placeholder: ${tag.slice(0, 120)}`);
    }
    if (/title=/.test(tag) && !/data-i18n-title=/.test(tag) && !/title="(?:WhatsApp|Instagram|≈)"/.test(tag)) {
      fail(`${file}: hardcoded title without data-i18n-title: ${tag.slice(0, 120)}`);
    }
  }
}

for (const file of ['js/access.js', 'js/admin.js']) {
  const runtime = fs.readFileSync(path.join(ROOT, file), 'utf8');
  if (/\bvar\s+COPY\s*=/.test(runtime)) {
    fail(`${file}: duplicated translation dictionary must not drift from js/lang.js`);
  }
  for (const match of runtime.matchAll(/['"]((?:access|admin)\.[a-zA-Z0-9_.-]+)['"]/g)) {
    if (match[1].endsWith('.html') || match[1].endsWith('.')) continue;
    if (!baseKeys.includes(match[1])) fail(`${file}: unknown i18n key ${match[1]}`);
  }
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const consumer = file === 'admin.html' ? 'js/admin.js' : 'js/access.js';
  if (!html.includes(consumer)) continue;
  if (html.indexOf('js/lang.js') < 0 || html.indexOf('js/lang.js') > html.indexOf(consumer)) {
    fail(`${file}: js/lang.js must load before ${consumer}`);
  }
}

const suspiciousPortuguese = /\b(?:años|hacia|experts|trailhead|cocktails)\b|médía|meio día|\/día|um día|O ano todo/i;
for (const [key, value] of Object.entries(dictionaries.pt)) {
  if (suspiciousPortuguese.test(value)) fail(`pt.${key} contains mixed-language copy: ${value}`);
}

if (!source.includes("lang === 'pt' ? 'pt-BR' : lang")) fail('Portuguese document language must be pt-BR');
if (!source.includes('document.title = lookup(lang, documentTitleKey)')) fail('document title localization is not wired');
if (!source.includes("querySelectorAll('[data-i18n-placeholder]')")) fail('placeholder localization is not wired');
if (!source.includes("querySelectorAll('[data-i18n-title]')")) fail('title attribute localization is not wired');

if (!process.exitCode) console.log(`  PASS (${baseKeys.length} keys × ${LANGS.length} languages)`);
