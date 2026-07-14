#!/usr/bin/env bash
# Read-only production gates. Generator checks run exclusively in a temporary copy.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== Gate 1: JavaScript syntax ==="
for file in js/*.js scripts/*.mjs tests/*.mjs; do
  node --check "$file"
done
echo "  PASS"

echo "=== Gate 2: complete i18n contract ==="
node tests/verify-i18n.mjs

echo "=== Gate 3: public CordalSur contract ==="
node tests/verify-public-contract.mjs
node tests/verify-access-session.mjs

echo "=== Gate 4: generator idempotency (temporary copy) ==="
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/site"
cp -R . "$tmp/site/"

node "$tmp/site/scripts/apply-host-data.mjs" "$tmp/site" "$tmp/site/data/host-data.json" >/dev/null
first="$(node - "$tmp/site" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
const files = [
  'js/lang.js', 'index.html', 'check-in.html', 'check-out.html',
  'restaurantes.html', 'actividades.html', 'clima.html', 'tickets.html',
  'instrucciones.html', 'botiquin.html', 'buggy.html', 'js/whatsapp.js'
];
const hash = crypto.createHash('sha256');
for (const file of files) hash.update(fs.readFileSync(path.join(root, file)));
process.stdout.write(hash.digest('hex'));
NODE
)"
node "$tmp/site/scripts/apply-host-data.mjs" "$tmp/site" "$tmp/site/data/host-data.json" >/dev/null
second="$(node - "$tmp/site" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
const files = [
  'js/lang.js', 'index.html', 'check-in.html', 'check-out.html',
  'restaurantes.html', 'actividades.html', 'clima.html', 'tickets.html',
  'instrucciones.html', 'botiquin.html', 'buggy.html', 'js/whatsapp.js'
];
const hash = crypto.createHash('sha256');
for (const file of files) hash.update(fs.readFileSync(path.join(root, file)));
process.stdout.write(hash.digest('hex'));
NODE
)"
test "$first" = "$second"
node "$tmp/site/scripts/apply-host-data.mjs" "$tmp/site" "$tmp/site/data/host-data.sample.json" >/dev/null
echo "  PASS"

echo "=== Gate 5: canonical snapshot parity ==="
check_snapshot() {
  if ! cmp -s "$1" "$2"; then
    echo "  FAIL: snapshot $2 differs from $1" >&2
    exit 1
  fi
}
check_snapshot index.html data/.baseline/index.html
check_snapshot check-in.html data/.baseline/check-in.html
check_snapshot check-out.html data/.baseline/check-out.html
check_snapshot botiquin.html data/.baseline/botiquin.html
check_snapshot buggy.html data/.baseline/buggy.html
check_snapshot actividades.html data/.baseline/actividades.html
check_snapshot clima.html data/.baseline/clima.html
check_snapshot tickets.html data/.baseline/tickets.html
check_snapshot instrucciones.html data/.baseline/instrucciones.html
check_snapshot restaurantes.html data/.baseline/restaurantes.html
check_snapshot css/styles.css data/.baseline/css-styles.css
check_snapshot js/lang.js data/.baseline/js/lang.js
check_snapshot js/lang.js data/.baseline/js-lang.js
check_snapshot js/lang.js data/.baseline/lang.js
check_snapshot js/activities.js data/.baseline/js/activities.js
check_snapshot js/activities.js data/.baseline/activities.js
check_snapshot js/restaurants.js data/.baseline/js/restaurants.js
check_snapshot js/restaurants.js data/.baseline/restaurants.js
check_snapshot staff/README.md data/.baseline/staff/README.md
echo "  PASS"

echo "=== All gates passed ==="
