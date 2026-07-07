// js/activities.js — filter bar for actividades.html.
// Reads the JSON block emitted by apply-host-data.mjs, attaches click handlers to the
// filter bar buttons, and shows/hides .rest-card elements by their data-module attribute.
// ponytail: same pattern as restaurants.js, just for the activities page.

(function () {
  'use strict';

  var dataNode = document.getElementById('activities-data');
  var bar = document.getElementById('act-filter-bar');
  if (!dataNode || !bar) return;

  var DATA;
  try { DATA = JSON.parse(dataNode.textContent); }
  catch (e) { return; }

  var countEl = document.getElementById('act-filter-count');
  var cards = document.querySelectorAll('.rest-card[data-module]');

  function applyFilter(filter) {
    var shown = 0;
    cards.forEach(function (card) {
      var mod = card.getAttribute('data-module') || '';
      var match = filter === 'all' || mod === filter;
      card.style.display = match ? '' : 'none';
      if (match) shown++;
    });
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
    if (countEl) {
      countEl.textContent = shown + ' / ' + cards.length;
    }
  }

  bar.addEventListener('click', function (e) {
    var btn = e.target.closest('.rest-filter__btn');
    if (!btn) return;
    var filter = btn.getAttribute('data-filter');
    if (filter) applyFilter(filter);
  });

  applyFilter('all');
})();
