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
  var shownCount = cards.length;

  function renderCount(lang) {
    if (!countEl) return;
    var vars = { shown: shownCount, total: cards.length };
    if (window.GH_I18N && typeof window.GH_I18N.format === 'function') {
      countEl.textContent = window.GH_I18N.format('act.filter.count', vars, lang);
      return;
    }
    countEl.textContent = shownCount + ' / ' + cards.length;
  }

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
    shownCount = shown;
    renderCount(window.GH_I18N && window.GH_I18N.getLang());
  }

  bar.addEventListener('click', function (e) {
    var btn = e.target.closest('.rest-filter__btn');
    if (!btn) return;
    var filter = btn.getAttribute('data-filter');
    if (filter) applyFilter(filter);
  });

  if (window.GH_I18N && typeof window.GH_I18N.subscribe === 'function') {
    window.GH_I18N.subscribe(renderCount);
  }

  applyFilter('all');
})();
