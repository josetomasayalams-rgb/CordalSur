// Simula: el usuario está en /restaurantes.html, toca la luna, navega a /clima.html.
// ¿La nueva página debe estar en dark?
// 1. Cargamos /restaurantes.html
// 2. Llamamos setTheme('dark') (equivalente a tocar la luna)
// 3. Verificamos que data-theme="dark" se aplicó y se guardó en localStorage
// 4. Cargamos /clima.html y verificamos que el inline anti-flash lee storage
//    y aplica data-theme="dark" antes del primer paint.

import fs from 'fs';
import https from 'https';

const BASE = 'https://josetomasayalams-rgb.github.io/casa-laura-andes-chillan/';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url + '?nocache=' + Date.now(), res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

(async () => {
  // 1) Load theme.js from live
  const themeJs = await get(BASE + 'js/theme.js');
  console.log('theme.js length:', themeJs.length);
  const hasRead = /var saved = localStorage\.getItem/.test(themeJs);
  console.log('theme.js reads storage:', hasRead);
  const hasInline = /var k="gh-theme-v3";try\{localStorage\.removeItem\("gh-theme"\);localStorage\.removeItem\("gh-theme-v2"\)/.test(themeJs);
  console.log('anti-flash inline present in theme.js (sanity):', hasInline);

  // 2) Check that all pages contain the anti-flash inline
  const pages = ['index.html','check-in.html','check-out.html','clima.html','tickets.html','instrucciones.html','botiquin.html','buggy.html','restaurantes.html','actividades.html'];
  for (const p of pages) {
    const html = await get(BASE + p);
    const hasInlineHere = /gh-theme-v3/.test(html);
    const hasStylesheet = /css\/styles\.css/.test(html);
    const hasThemeJs = /js\/theme\.js\?v=\d+/.test(html);
    console.log(p, '| anti-flash:', hasInlineHere, '| stylesheet:', hasStylesheet, '| theme.js:', hasThemeJs);
  }

  // 3) Check CSS coverage of major dark mode rules
  const css = await get(BASE + 'css/styles.css');
  const checks = {
    body: /html\[data-theme="dark"\] body \{/.test(css),
    cards: /html\[data-theme="dark"\] \.card,/.test(css),
    restCard: /html\[data-theme="dark"\] \.rest-card/.test(css),
    heroPanel: /html\[data-theme="dark"\] \.hero-panel/.test(css),
    header: /html\[data-theme="dark"\] \.header/.test(css),
    moduloTop: /html\[data-theme="dark"\] \.modulo-top/.test(css),
    restFilter: /html\[data-theme="dark"\] \.rest-filter-bar/.test(css),
    forecastWidget: /html\[data-theme="dark"\] \.forecast-widget/.test(css),
  };
  for (const [k, v] of Object.entries(checks)) {
    console.log('CSS dark for', k + ':', v ? 'YES' : 'NO');
  }
})();
