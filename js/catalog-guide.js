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
  var manualDialog = root.querySelector('[data-catalog-manual-dialog]');
  var manualCanvas = root.querySelector('[data-catalog-manual-map]');
  var manualStatus = root.querySelector('[data-catalog-manual-status]');
  var manualConfirm = root.querySelector('[data-catalog-manual-confirm]');
  var manualTileRetry = root.querySelector('[data-catalog-manual-tile-retry]');
  var buttons = Array.prototype.slice.call(root.querySelectorAll('[data-catalog-filter]'));
  var originButtons = Array.prototype.slice.call(root.querySelectorAll('[data-catalog-origin]'));
  var cards = Array.prototype.slice.call(root.querySelectorAll('[data-id]'));
  var activeCategory = 'all';
  var controller = null;
  var currentSnapshot = null;
  var locationGeneration = 0;
  var roadCoverage = null;
  var manualMap = null;
  var manualMarker = null;
  var manualCandidate = null;
  var manualTileLayer = null;
  var leafletPromise = null;
  var graphExpectation = {
    schemaVersion: root.getAttribute('data-graph-schema-version') || null,
    version: root.getAttribute('data-graph-version') || null,
    hash: root.getAttribute('data-graph-hash') || null
  };
  var apartment = {
    lat: Number(root.getAttribute('data-apartment-lat')),
    lon: Number(root.getAttribute('data-apartment-lon'))
  };

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

  function setDistance(card, result) {
    var rawMeters = result && result.meters;
    var meters = rawMeters === '' || rawMeters === null || rawMeters === undefined ? NaN : Number(rawMeters);
    card.setAttribute('data-distance', Number.isFinite(meters) ? String(meters) : '');
    card.setAttribute('data-distance-source', result && result.source || 'unknown');
    card.setAttribute('data-road-access-nearby', result && result.accessNearby ? 'true' : 'false');
    card.setAttribute('data-distance-coverage', result && result.coverage || 'unknown');
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
      var source = card.getAttribute('data-distance-source') || 'unknown';
      var label = card.querySelector('[data-distance-label]');
      var note = card.querySelector('[data-road-distance-note]');
      if (!label || !note) return;
      if (!Number.isFinite(meters)) {
        label.textContent = translate('guide.road.unavailable', 'Distancia no disponible');
        note.textContent = '';
        return;
      }
      label.textContent = window.CordalRoadDistances.formatMeters(meters, language);
      if (source === 'direct-current') note.textContent = translate('guide.road.direct', 'en línea recta · aprox.');
      else if (source === 'road-current' || source === 'road-apartment') {
        note.textContent = translate('guide.road.approx', 'por camino · aprox.') + (card.getAttribute('data-road-access-nearby') === 'true' ? ' · ' + translate('guide.road.access', 'hasta acceso cercano') : '');
      } else note.textContent = '';
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

  function restoreApartment(stopController) {
    locationGeneration += 1;
    currentSnapshot = null;
    roadCoverage = null;
    if (stopController !== false && controller) controller.stop();
    if (window.CordalRoadDistances) window.CordalRoadDistances.destroy();
    cards.forEach(function (card) {
      setDistance(card, {
        meters: card.getAttribute('data-apartment-distance'),
        source: card.getAttribute('data-apartment-distance') ? 'road-apartment' : 'unknown',
        accessNearby: card.getAttribute('data-apartment-access-nearby') === 'true',
        coverage: 'covered'
      });
    });
    setOrigin('apartment');
    locationStatus.textContent = translate('catalog.origin.private', 'GPS opcional · sólo en este dispositivo');
    update();
  }

  function applyDirect(snapshot) {
    cards.forEach(function (card) {
      var destination = { lat: Number(card.getAttribute('data-lat')), lon: Number(card.getAttribute('data-lon')) };
      setDistance(card, {
        meters: window.CordalLocationMotion.distanceMeters(snapshot, destination),
        source: 'direct-current',
        accessNearby: false,
        coverage: 'direct'
      });
    });
  }

  function warmRoadEngine() {
    return window.CordalRoadDistances.init({ expectedGraph: graphExpectation });
  }

  function calculateRoad(snapshot) {
    var generation = ++locationGeneration;
    locationStatus.textContent = translate('catalog.origin.calculating', 'Mejorando con distancias viales…');
    window.CordalRoadDistances.routeFrom(snapshot, { expectedGraph: graphExpectation }).then(function (message) {
      if (generation !== locationGeneration || !currentSnapshot) return;
      if (message.coverage === 'outside-network') {
        roadCoverage = 'outside-network';
        locationStatus.textContent = translate('guide.road.outsideNetwork', 'Fuera de la red vial; conservamos distancias en línea recta.');
        update();
        return;
      }
      roadCoverage = 'covered';
      cards.forEach(function (card) {
        var route = message.distances[card.getAttribute('data-id')];
        if (!route || !Number.isFinite(Number(route.meters))) return;
        setDistance(card, {
          meters: route.meters,
          source: 'road-current',
          accessNearby: Boolean(route.accessNearby),
          coverage: 'covered'
        });
      });
      locationStatus.textContent = translate('catalog.origin.ready', 'Distancias desde tu ubicación · sólo en este dispositivo');
      update();
    }).catch(function (error) {
      if (error && error.stale) return;
      if (generation !== locationGeneration) return;
      roadCoverage = 'routing-error';
      locationStatus.textContent = translate('guide.road.errorDirect', 'La ruta vial no respondió; conservamos distancias en línea recta.');
      update();
    });
  }

  function showSnapshot(snapshot, shouldReroute) {
    currentSnapshot = snapshot;
    applyDirect(snapshot);
    setOrigin('location');
    locationStatus.textContent = translate('catalog.origin.directReady', 'Resultados cercanos listos · mejorando rutas…');
    update();
    if (shouldReroute !== false) calculateRoad(snapshot);
  }

  function stateMessage(event) {
    var hasSnapshot = Boolean(event.snapshot || currentSnapshot);
    if (event.state === 'requesting') return translate('guide.location.requesting', 'Solicitando ubicación…');
    if (event.state === 'refining') return translate(hasSnapshot ? 'guide.location.refiningWithFix' : 'guide.location.refining', 'Mejorando la precisión del GPS…');
    if (event.state === 'degraded') return translate(hasSnapshot ? 'guide.location.degraded' : 'guide.location.unavailableHelp', 'Precisión limitada; puedes elegir un punto manual.');
    if (event.state === 'denied') return translate('guide.location.deniedHelp', 'Permiso denegado. Habilítalo en el navegador o elige un punto manual.');
    if (event.state === 'timeout') return translate('guide.location.timeout', 'El GPS tardó demasiado. Inténtalo otra vez.');
    if (event.state === 'unavailable' && event.error && event.error.reason === 'insecure-context') return translate('guide.location.insecure', 'Abre esta página segura en Safari o Chrome para usar ubicación.');
    if (event.state === 'unavailable') return translate('guide.location.unavailableHelp', 'No pudimos obtener tu ubicación; prueba de nuevo o elige un punto manual.');
    return null;
  }

  function handleLocationEvent(event) {
    if (!event) return;
    if (event.type === 'snapshot') {
      if (event.final && currentSnapshot && currentSnapshot.timestamp === event.snapshot.timestamp && !event.shouldReroute) return;
      showSnapshot(event.snapshot, event.shouldReroute);
      return;
    }
    if (event.type !== 'state') return;
    if (event.state === 'denied') {
      locationGeneration += 1;
      roadCoverage = null;
      if (window.CordalRoadDistances) window.CordalRoadDistances.destroy();
    }
    if (event.state === 'denied' && !event.snapshot && currentSnapshot) {
      restoreApartment(false);
      locationStatus.textContent = stateMessage(event);
      return;
    }
    var message = stateMessage(event);
    if (message) locationStatus.textContent = message;
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    if (!document.querySelector('link[data-catalog-leaflet]')) {
      var stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = 'assets/vendor/leaflet/leaflet.css';
      stylesheet.setAttribute('data-catalog-leaflet', '');
      document.head.appendChild(stylesheet);
    }
    leafletPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'assets/vendor/leaflet/leaflet.js';
      script.setAttribute('data-catalog-leaflet', '');
      script.onload = function () { if (window.L) resolve(window.L); else reject(new Error('Leaflet unavailable')); };
      script.onerror = function () { reject(new Error('Leaflet unavailable')); };
      document.head.appendChild(script);
    });
    return leafletPromise;
  }

  function addManualTiles() {
    if (!manualMap || !window.L) return;
    if (manualTileLayer) manualMap.removeLayer(manualTileLayer);
    if (manualTileRetry) manualTileRetry.hidden = true;
    var errors = 0;
    manualTileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    });
    manualTileLayer.on('tileerror', function () {
      errors += 1;
      if (errors >= 2) {
        manualStatus.textContent = translate('guide.map.tilesUnavailable', 'El mapa base no está disponible; todavía puedes marcar sobre la geometría visible.');
        if (manualTileRetry) manualTileRetry.hidden = false;
      }
    });
    manualTileLayer.on('tileload', function () {
      errors = 0;
      if (manualTileRetry) manualTileRetry.hidden = true;
    });
    manualTileLayer.addTo(manualMap);
  }

  function initializeManualMap() {
    if (manualMap) {
      setTimeout(function () { manualMap.invalidateSize(); }, 20);
      return;
    }
    manualMap = L.map(manualCanvas, { zoomControl: true, attributionControl: true, minZoom: 8, maxZoom: 19 });
    manualMap.setView([apartment.lat, apartment.lon], 12);
    addManualTiles();
    L.circleMarker([apartment.lat, apartment.lon], { radius: 7, color: '#fff8e9', weight: 3, fillColor: '#d9a24f', fillOpacity: 1, interactive: false }).addTo(manualMap);
    manualMap.on('click', function (event) {
      manualCandidate = { lat: event.latlng.lat, lon: event.latlng.lng, accuracy: 0 };
      if (manualMarker) manualMarker.setLatLng(event.latlng);
      else manualMarker = L.circleMarker(event.latlng, { radius: 9, color: '#fff8e9', weight: 3, fillColor: '#153b33', fillOpacity: 1 }).addTo(manualMap);
      manualConfirm.disabled = false;
      manualStatus.textContent = translate('guide.location.manualReady', 'Punto elegido. Confirma para usarlo.');
    });
  }

  function openManualPicker() {
    closeDialog(locationDialog);
    manualCandidate = null;
    manualConfirm.disabled = true;
    manualStatus.textContent = translate('guide.location.manualLoading', 'Cargando mapa local…');
    openDialog(manualDialog);
    loadLeaflet().then(function () {
      initializeManualMap();
      manualStatus.textContent = translate('guide.location.manualWaiting', 'Toca el mapa para elegir un punto.');
    }).catch(function () {
      manualStatus.textContent = translate('guide.map.unavailable', 'El mapa no pudo cargar. Puedes cerrar e intentarlo otra vez.');
    });
  }

  function requestLocation(choice) {
    if (choice === 'none') {
      closeDialog(locationDialog);
      restoreApartment();
      return;
    }
    if (choice === 'manual') {
      openManualPicker();
      return;
    }
    closeDialog(locationDialog);
    locationStatus.textContent = translate('guide.location.requesting', 'Solicitando ubicación…');
    warmRoadEngine().catch(function () { /* direct fallback is immediate */ });
    controller.start(choice);
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
      else openDialog(locationDialog);
    });
  });
  root.querySelectorAll('[data-catalog-location-choice]').forEach(function (button) {
    button.addEventListener('click', function () { requestLocation(button.getAttribute('data-catalog-location-choice')); });
  });
  if (manualConfirm) manualConfirm.addEventListener('click', function () {
    if (!manualCandidate || !controller) return;
    var candidate = manualCandidate;
    closeDialog(manualDialog);
    controller.setManual(candidate);
  });
  if (manualDialog) manualDialog.addEventListener('close', function () {
    manualCandidate = null;
    if (manualConfirm) manualConfirm.disabled = true;
    if (manualMarker && manualMap) manualMap.removeLayer(manualMarker);
    manualMarker = null;
  });
  if (manualTileRetry) manualTileRetry.addEventListener('click', addManualTiles);
  if (search) search.addEventListener('input', update);
  if (sort) sort.addEventListener('change', update);
  if (window.GH_I18N && typeof window.GH_I18N.subscribe === 'function') window.GH_I18N.subscribe(update);

  if (window.CordalLocationController && typeof window.CordalLocationController.create === 'function') {
    controller = window.CordalLocationController.create({ onEvent: handleLocationEvent });
  } else {
    locationStatus.textContent = translate('guide.location.unavailableHelp', 'Ubicación no disponible; puedes seguir desde el departamento.');
    originButtons.forEach(function (button) { if (button.getAttribute('data-catalog-origin') === 'location') button.disabled = true; });
  }

  window.addEventListener('pagehide', function () {
    locationGeneration += 1;
    currentSnapshot = null;
    if (controller) controller.destroy();
    if (window.CordalRoadDistances) window.CordalRoadDistances.destroy();
  });
  document.addEventListener('cordal:access-ended', function () { restoreApartment(); });
  restoreApartment();
}());
