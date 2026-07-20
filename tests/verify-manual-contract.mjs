import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANGUAGES = ['es', 'pt', 'en'];
const RULE_IDS = [
  'arrival-departure',
  'guests',
  'quiet-parties',
  'lodging-use',
  'cleaning-trash',
  'smoking',
  'textiles',
  'locker-key',
  'parking',
  'common-areas',
  'damage-loss',
  'personal-items',
  'noncompliance'
];
const THERMOSTAT_STEPS = ['set', 'reach', 'reset', 'raise'];
const fail = (message) => {
  console.error(`  FAIL: ${message}`);
  process.exitCode = 1;
};
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function parseAttributes(source) {
  const attributes = {};
  const matcher = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(matcher)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attributes;
}

function parseHtml(source) {
  const root = { tagName: '#root', attributes: {}, children: [], parent: null };
  const stack = [root];
  const voidElements = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);
  const withoutRawContent = source
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2')
    .replace(/(<style\b[^>]*>)[\s\S]*?(<\/style>)/gi, '$1$2');
  const tokenPattern = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>/g;
  let cursor = 0;

  function appendText(text) {
    if (text) stack.at(-1).children.push({ tagName: '#text', text, parent: stack.at(-1) });
  }

  for (const match of withoutRawContent.matchAll(tokenPattern)) {
    appendText(withoutRawContent.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const token = match[0];
    if (token.startsWith('<!--') || token.startsWith('<!')) continue;

    const closing = /^<\//.test(token);
    const name = token.match(/^<\/?\s*([^\s/>]+)/)?.[1]?.toLowerCase();
    if (!name) continue;
    if (closing) {
      const matchingIndex = stack.map((node) => node.tagName).lastIndexOf(name);
      if (matchingIndex > 0) stack.length = matchingIndex;
      continue;
    }

    const attributeSource = token
      .replace(/^<\s*[^\s/>]+/, '')
      .replace(/\/?\s*>$/, '');
    const node = {
      tagName: name,
      attributes: parseAttributes(attributeSource),
      children: [],
      parent: stack.at(-1)
    };
    stack.at(-1).children.push(node);
    if (!voidElements.has(name) && !/\/\s*>$/.test(token)) stack.push(node);
  }
  appendText(withoutRawContent.slice(cursor));
  return root;
}

function descendants(node, predicate) {
  const matches = [];
  for (const child of node.children || []) {
    if (child.tagName !== '#text' && predicate(child)) matches.push(child);
    if (child.tagName !== '#text') matches.push(...descendants(child, predicate));
  }
  return matches;
}

function textContent(node) {
  return (node.children || []).map((child) => (
    child.tagName === '#text' ? child.text : textContent(child)
  )).join('').replace(/\s+/g, ' ').trim();
}

function hasI18nKey(node, key) {
  return node.attributes?.['data-i18n'] === key ||
    descendants(node, (child) => child.attributes['data-i18n'] === key).length > 0;
}

function loadDictionaries(source) {
  const marker = 'var I18N = {';
  if (!source.includes(marker)) {
    fail('js/lang.js does not expose the expected I18N dictionary declaration');
    return {};
  }
  const instrumented = source.replace(marker, 'var I18N = globalThis.__CORDAL_I18N__ = {');
  const noop = () => {};
  const context = {
    document: {
      addEventListener: noop,
      documentElement: { classList: { add: noop }, getAttribute: () => null, lang: '' },
      querySelector: () => null,
      querySelectorAll: () => [],
      title: ''
    },
    localStorage: { getItem: () => '', setItem: noop },
    window: { addEventListener: noop, matchMedia: () => ({ matches: true }) }
  };
  vm.createContext(context);
  try {
    vm.runInContext(instrumented, context, { filename: 'js/lang.js' });
  } catch (error) {
    fail(`js/lang.js could not be evaluated: ${error.message}`);
  }
  return context.__CORDAL_I18N__ || {};
}

function isNonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertLocalizedKey(key, hostData, dictionaries) {
  const editorial = hostData.scalar?.[key];
  if (!editorial || typeof editorial !== 'object' || Array.isArray(editorial)) {
    fail(`data/host-data.json must define scalar.${key}`);
  }
  for (const language of LANGUAGES) {
    if (!isNonEmpty(editorial?.[language])) {
      fail(`data/host-data.json scalar.${key}.${language} must be non-empty`);
    }
    if (!isNonEmpty(dictionaries[language]?.[key])) {
      fail(`js/lang.js ${language}.${key} must be non-empty`);
    }
  }
}

function normalizeAssetReference(value) {
  return String(value || '').replace(/^\.\//, '');
}

const html = read('instrucciones.html');
const hostData = JSON.parse(read('data/host-data.json'));
const dictionaries = loadDictionaries(read('js/lang.js'));
const documentTree = parseHtml(html);
const elements = descendants(documentTree, () => true);

const headings = elements.filter((node) => node.tagName === 'h1');
if (headings.length !== 1) fail(`Manual must contain exactly one <h1>; found ${headings.length}`);
else if (headings[0].attributes.hidden !== undefined || headings[0].attributes['aria-hidden'] === 'true') {
  fail('Manual <h1> must be exposed to assistive technology');
}

const expectedAssets = [
  ['script', 'src', 'js/lang.js?v=18'],
  ['script', 'src', 'js/manual.js?v=2'],
  ['link', 'href', 'css/styles.css?v=28']
];
for (const [tagName, attribute, expected] of expectedAssets) {
  const basename = expected.split('?')[0];
  const matches = elements.filter((node) => (
    node.tagName === tagName && normalizeAssetReference(node.attributes[attribute]).split('?')[0] === basename
  ));
  if (matches.length !== 1) {
    fail(`Manual must load exactly one ${basename} asset; found ${matches.length}`);
  } else if (normalizeAssetReference(matches[0].attributes[attribute]) !== expected) {
    fail(`Manual must load cache-busted ${expected}`);
  }
}

const ruleNodes = elements.filter((node) => Object.hasOwn(node.attributes, 'data-manual-rule'));
const actualRuleIds = ruleNodes.map((node) => node.attributes['data-manual-rule']);
const actualRuleSet = new Set(actualRuleIds);
const missingRuleIds = RULE_IDS.filter((id) => !actualRuleSet.has(id));
const unexpectedRuleIds = [...actualRuleSet].filter((id) => !RULE_IDS.includes(id));
const duplicateRuleIds = actualRuleIds.filter((id, index) => actualRuleIds.indexOf(id) !== index);
if (actualRuleIds.length !== RULE_IDS.length || missingRuleIds.length || unexpectedRuleIds.length || duplicateRuleIds.length) {
  fail(
    `Manual rules must be exactly the 13 canonical IDs; ` +
    `missing=[${missingRuleIds.join(', ')}] unexpected=[${unexpectedRuleIds.join(', ')}] ` +
    `duplicates=[${[...new Set(duplicateRuleIds)].join(', ')}] count=${actualRuleIds.length}`
  );
}

for (const id of RULE_IDS) {
  const titleKey = `manual.rule.${id}.title`;
  const bodyKey = `manual.rule.${id}.body`;
  assertLocalizedKey(titleKey, hostData, dictionaries);
  assertLocalizedKey(bodyKey, hostData, dictionaries);

  const ruleNode = ruleNodes.find((node) => node.attributes['data-manual-rule'] === id);
  if (!ruleNode) continue;
  const disclosure = ruleNode.tagName === 'details'
    ? ruleNode
    : descendants(ruleNode, (node) => node.tagName === 'details')[0];
  if (!disclosure) {
    fail(`${id}: data-manual-rule must identify or contain a <details> disclosure`);
    continue;
  }
  const summaries = disclosure.children.filter((node) => node.tagName === 'summary');
  if (summaries.length !== 1) {
    fail(`${id}: rule disclosure must have exactly one direct <summary>; found ${summaries.length}`);
    continue;
  }
  const summary = summaries[0];
  if (summary.attributes.hidden !== undefined || summary.attributes.inert !== undefined ||
      summary.attributes['aria-hidden'] === 'true' || summary.attributes.tabindex === '-1') {
    fail(`${id}: <summary> must remain keyboard and assistive-technology accessible`);
  }
  if (!hasI18nKey(summary, titleKey)) fail(`${id}: <summary> must render ${titleKey}`);
  if (!hasI18nKey(ruleNode, bodyKey)) fail(`${id}: rule disclosure must render ${bodyKey}`);
}

const disclosures = elements.filter((node) => node.tagName === 'details');
for (const [index, disclosure] of disclosures.entries()) {
  const summaries = disclosure.children.filter((node) => node.tagName === 'summary');
  if (summaries.length !== 1) {
    fail(`details #${index + 1} must have exactly one direct <summary>`);
    continue;
  }
  const summary = summaries[0];
  if (summary.attributes.hidden !== undefined || summary.attributes.inert !== undefined ||
      summary.attributes['aria-hidden'] === 'true' || summary.attributes.tabindex === '-1') {
    fail(`details #${index + 1} summary must remain keyboard and assistive-technology accessible`);
  }
  const localizedSummary = summary.attributes['data-i18n'] ||
    descendants(summary, (node) => Boolean(node.attributes['data-i18n'])).length > 0;
  if (!localizedSummary && !textContent(summary)) {
    fail(`details #${index + 1} has no accessible summary text`);
  }
}

const feeNodes = elements.filter((node) => Object.hasOwn(node.attributes, 'data-fee-clp'));
if (!feeNodes.some((node) => node.attributes['data-fee-clp'] === '20000')) {
  fail('Manual must expose data-fee-clp="20000" for the locker-key replacement fee');
}
if (feeNodes.some((node) => node.attributes['data-fee-clp'] !== '20000')) {
  fail('Every data-fee-clp marker must use the canonical 20000 CLP amount');
}

const feeKey = 'manual.locker.fee.value';
assertLocalizedKey(feeKey, hostData, dictionaries);
for (const language of LANGUAGES) {
  const editorialDigits = String(hostData.scalar?.[feeKey]?.[language] || '').replace(/\D/g, '');
  const runtimeDigits = String(dictionaries[language]?.[feeKey] || '').replace(/\D/g, '');
  if (editorialDigits !== '20000') fail(`scalar.${feeKey}.${language} must contain exactly the 20000 CLP amount`);
  if (runtimeDigits !== '20000') fail(`${language}.${feeKey} must contain exactly the 20000 CLP amount`);
}
if (!elements.some((node) => node.attributes['data-i18n'] === feeKey)) {
  fail(`Manual must render the ${feeKey} translation`);
}

for (const step of THERMOSTAT_STEPS) {
  for (const field of ['title', 'body']) {
    const key = `manual.thermostat.step.${step}.${field}`;
    assertLocalizedKey(key, hostData, dictionaries);
    if (!elements.some((node) => node.attributes['data-i18n'] === key)) {
      fail(`Manual must render thermostat copy ${key}`);
    }
  }
}

if (!process.exitCode) {
  console.log('  PASS (13 multilingual rules, accessible disclosures, locker fee and thermostat contract)');
}
