(function () {
  'use strict';

  var root = document.querySelector('[data-canonical-catalog]');
  if (!root) return;

  var grid = root.querySelector('[data-catalog-grid]');
  var search = root.querySelector('[data-catalog-search]');
  var sort = root.querySelector('[data-catalog-sort]');
  var count = root.querySelector('[data-catalog-count]');
  var empty = root.querySelector('[data-catalog-empty]');
  var buttons = Array.prototype.slice.call(root.querySelectorAll('[data-catalog-filter]'));
  var cards = Array.prototype.slice.call(root.querySelectorAll('[data-id]'));
  var activeCategory = 'all';

  function normalized(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function distance(card) {
    return Number(card.getAttribute('data-distance') || Number.POSITIVE_INFINITY);
  }

  function update() {
    var query = normalized(search && search.value);
    var visible = cards.filter(function (card) {
      var categoryMatches = activeCategory === 'all' || card.getAttribute('data-category') === activeCategory;
      var textMatches = !query || normalized(card.textContent).indexOf(query) >= 0;
      card.hidden = !(categoryMatches && textMatches);
      return !card.hidden;
    });

    visible.sort(function (left, right) {
      if (sort && sort.value === 'alphabetical') {
        return normalized(left.querySelector('h3').textContent).localeCompare(normalized(right.querySelector('h3').textContent));
      }
      return distance(left) - distance(right) || normalized(left.querySelector('h3').textContent).localeCompare(normalized(right.querySelector('h3').textContent));
    }).forEach(function (card) { grid.appendChild(card); });

    count.textContent = visible.length + ' ' + translate('guide.quality.places', 'lugares');
    empty.hidden = visible.length !== 0;
  }

  function translate(key, fallback) {
    if (window.GH_I18N && typeof window.GH_I18N.t === 'function') {
      var value = window.GH_I18N.t(key);
      if (value && value !== key) return value;
    }
    return fallback;
  }

  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      activeCategory = button.getAttribute('data-catalog-filter') || 'all';
      buttons.forEach(function (candidate) {
        var active = candidate === button;
        candidate.classList.toggle('is-active', active);
        candidate.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      update();
    });
  });

  if (search) search.addEventListener('input', update);
  if (sort) sort.addEventListener('change', update);
  window.addEventListener('gh:language-changed', update);
  document.addEventListener('cordal:language-changed', update);
  update();
}());
