import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSectionPalettes } from '../scripts/generate-section-palettes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const data = JSON.parse(read('data/section-palettes.json'));
const css = read('css/section-palettes.css');

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const failures = [];
const pages = new Set();
const lightAccents = new Set();
const darkAccents = new Set();

for (const [section, definition] of Object.entries(data.sections)) {
  if (pages.has(definition.page)) failures.push(`${section}: duplicate page ${definition.page}`);
  pages.add(definition.page);
  const html = read(definition.page);
  if (!html.includes(`data-section="${section}"`)) failures.push(`${definition.page}: missing data-section="${section}"`);
  if (!html.includes('css/section-palettes.css?v=1')) failures.push(`${definition.page}: missing palette stylesheet v1`);

  lightAccents.add(definition.light.accent.toLowerCase());
  darkAccents.add(definition.dark.accent.toLowerCase());
  for (const theme of ['light', 'dark']) {
    const palette = definition[theme];
    for (const key of ['accent', 'accentAlt']) {
      const ratio = contrast(palette[key], palette.onAccent);
      if (ratio < data.contrastFloor) {
        failures.push(`${section}.${theme}.${key}: contrast ${ratio.toFixed(2)} is below ${data.contrastFloor}:1`);
      }
    }
  }
}

if (lightAccents.size !== pages.size || darkAccents.size !== pages.size) {
  failures.push('every section must have a distinct accent in both themes');
}
if (css !== renderSectionPalettes(data)) failures.push('css/section-palettes.css is stale; run the generator');

if (failures.length) {
  for (const failure of failures) console.error(`  FAIL: ${failure}`);
  process.exit(1);
}

console.log(`  PASS (${pages.size} sections × 2 themes, all accent pairs >= ${data.contrastFloor}:1)`);
