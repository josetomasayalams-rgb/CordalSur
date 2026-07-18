import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const apiBase = String(process.env.CORDAL_SUR_ACCESS_API || '').trim().replace(/\/+$/, '');
const token = String(process.env.CORDAL_SUR_ADMIN_TOKEN || '').trim();
const output = path.resolve(ROOT, process.argv.find((argument) => argument.startsWith('--output='))?.slice(9) || '.research/place-overrides.runtime.json');

if (!/^https:\/\//.test(apiBase)) throw new Error('CORDAL_SUR_ACCESS_API must be an HTTPS origin.');
if (!token) throw new Error('CORDAL_SUR_ADMIN_TOKEN is required and must remain outside source control.');

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 15000);
let response;
try {
  response = await fetch(`${apiBase}/v1/admin/place-overrides`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    signal: controller.signal
  });
} finally {
  clearTimeout(timer);
}
if (!response.ok) throw new Error(`Override export failed with HTTP ${response.status}.`);
const body = await response.json();
if (!Array.isArray(body.overrides)) throw new Error('Override export returned an invalid contract.');
fs.mkdirSync(path.dirname(output), { recursive: true });
const temporary = `${output}.tmp`;
fs.writeFileSync(temporary, `${JSON.stringify({ exportedAt: new Date().toISOString(), overrides: body.overrides }, null, 2)}\n`, { mode: 0o600 });
fs.renameSync(temporary, output);
console.log(`Exported ${body.overrides.length} overrides to ${path.relative(ROOT, output)}`);
