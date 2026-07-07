// js/restaurants.js — filter bar for restaurantes.html.
// Reads the JSON block emitted by apply-host-data.mjs, attaches click handlers to the
// filter bar buttons, and shows/hides .rest-card elements by their data-categories.
// ponytail: progressive enhancement. Without JS, all cards are visible (no filter bar
// is rendered — see apply-host-data.mjs which only emits the bar inside the @LISTINGS
// block, AND we hide it via CSS when the JS hasn't initialised).

(function () {
  'use strict';

  var dataNode = document.getElementById('restaurants-data');
  var bar = document.getElementById('rest-filter-bar');
  if (!dataNode || !bar) return;

  var DATA;
  try { DATA = JSON.parse(dataNode.textContent); }
  catch (e) { return; }

  var countEl = document.getElementById('rest-filter-count');
  var cards = document.querySelectorAll('.rest-card');

  function attrEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function slugify(c) {
    return String(c).replace(/[^a-zA-Z0-9áéíóúñ ]/g, '').toLowerCase().replace(/ /g, '-');
  }

  function applyFilter(filter) {
    var shown = 0;
    cards.forEach(function (card) {
      var cats = (card.getAttribute('data-categories') || '').split(/\s+/);
      var match = filter === 'all' || cats.indexOf(filter) >= 0;
      card.style.display = match ? '' : 'none';
      if (match) shown++;
    });
    // Update active state on buttons
    var btns = bar.querySelectorAll('.rest-filter__btn');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (b.getAttribute('data-filter') === filter) {
        b.classList.add('rest-filter__btn--active');
        b.setAttribute('aria-pressed', 'true');
      } else {
        b.classList.remove('rest-filter__btn--active');
        b.setAttribute('aria-pressed', 'false');
      }
    }
    // Update count
    if (countEl) {
      countEl.textContent = shown + ' / ' + cards.length;
    }
  }

  // Delegate click
  bar.addEventListener('click', function (e) {
    var btn = e.target.closest('.rest-filter__btn');
    if (!btn) return;
    var filter = btn.getAttribute('data-filter');
    if (filter) applyFilter(filter);
  });

  // Initial state
  applyFilter('all');
})();
