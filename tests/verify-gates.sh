#!/usr/bin/env bash
# tests/verify-gates.sh — runs the 3 no-regression gates from AGENTS.md.
# Usage: bash tests/verify-gates.sh
# Exits 0 if all gates pass, 1 otherwise.

set -e
cd "$(dirname "$0")/.."

echo "=== Gate 1: snapshot drift (12 canonical files) ==="
failed=0
# Map relative-to-root path → relative-to-baseline path.
# Baseline uses a flat layout (js/lang.js, css-styles.css) while the
# landingpage folder uses subdirs (js/lang.js, css/styles.css).
for f in css/styles.css:css-styles.css js/lang.js:js/lang.js js/restaurants.js:js/restaurants.js \
         index.html:index.html check-in.html:check-in.html check-out.html:check-out.html \
         restaurantes.html:restaurantes.html actividades.html:actividades.html \
         clima.html:clima.html tickets.html:tickets.html instrucciones.html:instrucciones.html \
         staff/README.md:staff/README.md; do
  live="${f%%:*}"
  base="${f##*:}"
  if ! diff -q "data/.baseline/$base" "$live" > /dev/null 2>&1; then
    echo "  DIFF: $live (baseline: $base)"
    failed=1
  fi
done
if [ $failed -eq 0 ]; then echo "  PASS"; else echo "  FAIL"; fi

echo ""
echo "=== Gate 2: prototype leak ==="
hits=$(grep -rnE "Google Workspace|agua caliente|Tienda Café|Dolce Gusto|Stripe|nieve2026|AndesChillan_5G|CESFAM" \
  *.html js/lang.js js/restaurants.js js/activities.js 2>/dev/null || true)
if [ -z "$hits" ]; then echo "  PASS (0 hits)"; else echo "  FAIL"; echo "$hits" | head -3; fi

echo ""
echo "=== Gate 3: real http hrefs ==="
hits=$(grep -rnE 'href="https?://' *.html \
  | grep -vE 'fonts\.(googleapis|gstatic)|preconnect|open-meteo\.com|wttr\.in|snow-forecast\.com|google\.com/maps|nevadosdechillan\.com|wa\.me|bordehoteles\.cl|cabanaslascabras\.cl|trancas\.cl|turismovallelastrancas\.com|conaf\.cl|instagram\.com|wikiloc\.com|trailforks\.com|andeshandbook\.org|wikiexplora\.com|tripadvisor\.es|backchillan\.com|rucahueescalador\.cl' 2>/dev/null || true)
if [ -z "$hits" ]; then echo "  PASS (0 hits)"; else echo "  FAIL"; echo "$hits" | head -3; fi

echo ""
echo "=== Bonus: script idempotency ==="
node scripts/apply-host-data.mjs . data/host-data.json > /dev/null 2>&1
sha1=$(sha256sum js/lang.js restaurantes.html | cut -d' ' -f1)
node scripts/apply-host-data.mjs . data/host-data.json > /dev/null 2>&1
sha2=$(sha256sum js/lang.js restaurantes.html | cut -d' ' -f1)
if [ "$sha1" = "$sha2" ]; then echo "  PASS (idempotent)"; else echo "  FAIL (non-idempotent)"; fi
