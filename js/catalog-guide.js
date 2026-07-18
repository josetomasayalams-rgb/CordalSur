(function () {
  'use strict';

  var root = document.querySelector('[data-canonical-catalog]');
  if (!root) return;

  var grid = root.querySelector('[data-catalog-grid]');
  var search = root.querySelector('[data-catalog-search]');
  var sort = root.querySelector('[data-catalog-sort]');
  var count = root.querySelector('[data-catalog-count]');
  var empty = root.querySelector('[data-catalog-empty]');
  var locationStatus = root.querySelector('[data-catalog-location-status]');
  var locationDialog = root.querySelector('[data-catalog-location-dialog]');
  var buttons = Array.prototype.slice.call(root.querySelectorAll('[data-catalog-filter]'));
  var originButtons = Array.prototype.slice.call(root.querySelectorAll('[data-catalog-origin]'));
  var cards = Array.prototype.slice.call(root.querySelectorAll('[data-id]'));
  var activeCategory = 'all';
  var watchId = null;
  var locationTracker = window.CordalLocationMotion.createTracker({ maximumAccuracy: 150 });
  var locationGeneration = 0;

  function translate(key, fallback) {
    if (window.GH_I18N && typeof window.GH_I18N.t === 'function') {
      var value = window.GH_I18N.t(key);
      if (value && value !== key) return value;
    }
    return fallback;
  }

  function normalized(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function distance(card) {
    var raw = card.getAttribute('data-distance');
    return raw === '' ? Number.POSITIVE_INFINITY : Number(raw);
  }

  function setOrigin(mode) {
    originButtons.forEach(function (button) {
      var active = button.getAttribute('data-catalog-origin') === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function renderDistances() {
    var language = window.GH_I18N && window.GH_I18N.getLang ? window.GH_I18N.getLang() : 'es';
    cards.forEach(function (card) {
      var meters = distance(card);
      var label = card.querySelector('[data-distance-label]');
      var note = card.querySelector('[data-road-distance-note]');
      if (!label || !note) return;
      if (!Number.isFinite(meters)) {
        label.textContent = translate('guide.road.unavailable', 'Distancia vial no disponible');
        note.textContent = '';
      } else {
        label.textContent = window.CordalRoadDistances.formatMeters(meters, language);
        note.textContent = translate('guide.road.approx', 'por camino · aprox.') + (card.getAttribute('data-road-access-nearby') === 'true' ? ' · ' + translate('guide.road.access', 'hasta acceso cercano') : '');
      }
    });
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
    renderDistances();
  }

  function restoreApartment() {
    locationGeneration += 1;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    locationTracker.reset();
    if (window.CordalRoadDistances) window.CordalRoadDistances.destroy();
    cards.forEach(function (card) {
      card.setAttribute('data-distance', card.getAttribute('data-apartment-distance') || '');
      card.setAttribute('data-road-access-nearby', card.getAttribute('data-apartment-access-nearby') || card.getAttribute('data-road-access-nearby') || 'false');
    });
    setOrigin('apartment');
    locationStatus.textContent = translate('catalog.origin.private', 'GPS opcional · sólo en este dispositivo');
    update();
  }

  function routePosition(position) {
    var tracked = locationTracker.accept(position);
    if (!tracked.accepted) {
      if (tracked.reason === 'low_accuracy' && !tracked.point) locationStatus.textContent = translate('guide.location.unavailable', 'La precisión del GPS no es suficiente todavía.');
      return;
    }
    var generation = ++locationGeneration;
    locationStatus.textContent = translate('catalog.origin.calculating', 'Calculando distancias viales…');
    window.CordalRoadDistances.routeFrom(tracked.point).then(function (message) {
      if (generation !== locationGeneration) return;
      cards.forEach(function (card) {
        var route = message.distances[card.getAttribute('data-id')];
        card.setAttribute('data-distance', route ? route.meters : '');
        card.setAttribute('data-road-access-nearby', route && route.accessNearby ? 'true' : 'false');
      });
      setOrigin('location');
      locationStatus.textContent = translate('catalog.origin.ready', 'Distancias desde tu ubicación · sólo en este dispositivo');
      update();
    }).catch(function (error) {
      if (error && error.stale) return;
      if (generation !== locationGeneration) return;
      locationStatus.textContent = translate('guide.location.error', 'No pudimos calcular desde tu ubicación. Puedes seguir desde el departamento.');
    });
  }

  function locationFailure() {
    locationStatus.textContent = translate('guide.location.error', 'No pudimos usar tu ubicación. Puedes seguir desde el departamento.');
  }

  function requestLocation(choice) {
    if (choice === 'none') { restoreApartment(); return; }
    if (!navigator.geolocation) { locationFailure(); return; }
    var options = { enableHighAccuracy: true, maximumAge: choice === 'session' ? 10000 : 0, timeout: 15000 };
    locationStatus.textContent = translate('guide.location.requesting', 'Solicitando ubicación…');
    if (choice === 'session') watchId = navigator.geolocation.watchPosition(routePosition, locationFailure, options);
    else navigator.geolocation.getCurrentPosition(routePosition, locationFailure, options);
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

  originButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      if (button.getAttribute('data-catalog-origin') === 'apartment') restoreApartment();
      else if (locationDialog && typeof locationDialog.showModal === 'function') locationDialog.showModal();
      else requestLocation('once');
    });
  });
  root.querySelectorAll('[data-catalog-location-choice]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (locationDialog) locationDialog.close();
      requestLocation(button.getAttribute('data-catalog-location-choice'));
    });
  });
  if (search) search.addEventListener('input', update);
  if (sort) sort.addEventListener('change', update);
  if (window.GH_I18N && typeof window.GH_I18N.subscribe === 'function') window.GH_I18N.subscribe(update);
  window.addEventListener('pagehide', function () {
    locationGeneration += 1;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    locationTracker.reset();
    if (window.CordalRoadDistances) window.CordalRoadDistances.destroy();
  });
  document.addEventListener('cordal:access-ended', restoreApartment);
  restoreApartment();
}());
