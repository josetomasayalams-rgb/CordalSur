(function () {
  'use strict';

  var results = document.getElementById('nearby-results');
  var locate = document.getElementById('nearby-locate');
  var status = document.getElementById('nearby-status');
  var count = document.getElementById('nearby-count');
  var empty = document.getElementById('nearby-empty');
  var loading = document.getElementById('nearby-loading');
  var resultsRegion = document.getElementById('guide-results-region');
  var categories = document.getElementById('guide-categories');
  var search = document.getElementById('guide-search');
  var rating = document.getElementById('guide-rating');
  var distance = document.getElementById('guide-distance');
  var sort = document.getElementById('guide-sort');
  var showBehind = document.getElementById('guide-behind');
  var showBehindWrap = document.getElementById('guide-behind-wrap');
  var modeGroup = document.getElementById('guide-mode');
  var routeFeatured = document.getElementById('guide-route-featured');
  var modeSummary = document.getElementById('guide-mode-summary');
  var quality = document.getElementById('guide-quality');
  var mapCanvas = document.getElementById('guide-map-canvas');
  var mapFallback = document.getElementById('guide-map-fallback');
  var mapShell = document.getElementById('guide-map-shell');
  var mapToggle = document.getElementById('guide-map-toggle');
  var mapToggleLabel = document.getElementById('guide-map-toggle-label');
  var locationDialog = document.getElementById('guide-location-dialog');
  var layout = document.querySelector('.guide-layout');
  var total = document.getElementById('guide-place-total');
  if (!results || !locate || !categories || !mapCanvas) return;

  var LODGING = { hotel: true, cabin: true };
  var data = null;
  var publicPlaces = [];
  var mode = 'apartment';
  var activeCategory = 'all';
  var userPosition = null;
  var locationMode = 'none';
  var watchId = null;
  var selectedId = null;
  var filteredPlaces = [];
  var map = null;
  var geometryLayer = null;
  var markerCluster = null;
  var markers = new Map();
  var userMarker = null;
  var MAP_VISIBILITY_KEY = 'cordal-guide-map-visible';
  var mapVisible = true;

  function t(key) { return window.GH_I18N ? window.GH_I18N.t(key) : key; }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function value(field) {
    return field && typeof field === 'object' && Object.prototype.hasOwnProperty.call(field, 'value') ? field.value : field;
  }

  function distanceKm(a, b) {
    var radians = Math.PI / 180;
    var dLat = (b.lat - a.lat) * radians;
    var dLon = (b.lon - a.lon) * radians;
    var lat1 = a.lat * radians;
    var lat2 = b.lat * radians;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function formatDistance(kilometres) {
    var lang = window.GH_I18N ? window.GH_I18N.getLang() : 'es';
    return new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : lang, { maximumFractionDigits: kilometres < 10 ? 1 : 0 }).format(kilometres) + ' km';
  }

  function ratingValue(place) {
    return Math.max(Number(place.googleRating && place.googleRating.value || 0), Number(place.tripadvisorRating && place.tripadvisorRating.value || 0));
  }

  function popularity(place) {
    return Math.max(Number(place.googleRating && place.googleRating.reviewCount || 0), Number(place.tripadvisorRating && place.tripadvisorRating.reviewCount || 0));
  }

  function categoryLabel(id) {
    var translated = t('guide.cat.' + id);
    if (translated !== 'guide.cat.' + id) return translated;
    var item = data && data.categories.find(function (category) { return category.id === id; });
    return item ? item.label : id;
  }

  function categoryColor(id) {
    var item = data && data.categories.find(function (category) { return category.id === id; });
    return item ? item.color : '#66706c';
  }

  function lineProjection(line, target) {
    var best = null;
    var progress = 0;
    for (var index = 1; index < line.length; index += 1) {
      var start = line[index - 1];
      var end = line[index];
      var refLat = target.lat * Math.PI / 180;
      var scaleX = 111320 * Math.cos(refLat);
      var ax = (start.lon - target.lon) * scaleX;
      var ay = (start.lat - target.lat) * 110540;
      var bx = (end.lon - target.lon) * scaleX;
      var by = (end.lat - target.lat) * 110540;
      var dx = bx - ax;
      var dy = by - ay;
      var lengthSquared = dx * dx + dy * dy;
      var fraction = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
      var candidate = { distanceMeters: Math.hypot(ax + fraction * dx, ay + fraction * dy), progressMeters: progress + fraction * Math.hypot(dx, dy) };
      if (!best || candidate.distanceMeters < best.distanceMeters) best = candidate;
      progress += Math.hypot(dx, dy);
    }
    return best || { distanceMeters: Infinity, progressMeters: 0 };
  }

  function currentOrigin() {
    if (mode === 'nearby') return userPosition || data.geometry.corridor.ruralStart;
    if (mode === 'route') return data.geometry.corridor.ruralStart;
    return { lat: data.geometry.apartment.lat, lon: data.geometry.apartment.lon };
  }

  function placesForState() {
    var origin = currentOrigin();
    var query = normalize(search.value);
    var minimumRating = Number(rating.value || 0);
    var maximumDistance = Number(distance.value || 0);
    var userProgress = userPosition ? lineProjection(data._centerline, userPosition).progressMeters : 0;
    var list = publicPlaces.filter(function (place) {
      if (mode === 'apartment' && !place.discovery.apartment) return false;
      if (mode !== 'apartment' && !place.discovery.corridor) return false;
      if (mode === 'nearby' && userPosition && !showBehind.checked && place.discovery.routeProgressMeters < userProgress) return false;
      if (activeCategory !== 'all' && place.category !== activeCategory) return false;
      var directDistance = distanceKm(origin, place.location);
      if (maximumDistance && directDistance > maximumDistance) return false;
      if (minimumRating && ratingValue(place) < minimumRating) return false;
      if (query) {
        var haystack = normalize([place.name, categoryLabel(place.category), place.municipality, value(place.address)].filter(Boolean).join(' '));
        if (haystack.indexOf(query) < 0) return false;
      }
      place._distanceKm = directDistance;
      return true;
    });
    list.sort(function (left, right) {
      if (sort.value === 'rating') return ratingValue(right) - ratingValue(left) || left.name.localeCompare(right.name);
      if (sort.value === 'popularity') return popularity(right) - popularity(left) || ratingValue(right) - ratingValue(left);
      if (sort.value === 'alphabetical') return left.name.localeCompare(right.name);
      return left._distanceKm - right._distanceKm || left.name.localeCompare(right.name);
    });
    return list;
  }

  function ratingHtml(place) {
    var chunks = [];
    if (place.googleRating) chunks.push('<span class="guide-source-rating"><b>Google ' + escapeHtml(place.googleRating.value) + '</b> · ' + escapeHtml(place.googleRating.reviewCount || 0) + ' ' + escapeHtml(t('guide.reviews')) + '</span>');
    if (place.tripadvisorRating) chunks.push('<span class="guide-source-rating"><b>Tripadvisor ' + escapeHtml(place.tripadvisorRating.value) + '</b> · ' + escapeHtml(place.tripadvisorRating.reviewCount || 0) + ' ' + escapeHtml(t('guide.reviews')) + '</span>');
    return chunks.join('');
  }

  var ACTION_ASSETS = {
    navigation: 'assets/icons/navigation.svg',
    maps: 'assets/icons/google-maps.svg',
    website: 'assets/icons/website.svg',
    instagram: 'assets/icons/instagram.svg',
    phone: 'assets/icons/phone.svg'
  };

  function action(href, key, type, primary) {
    if (!href) return '';
    var label = t(key);
    var external = /^https?:\/\//.test(href) ? ' target="_blank" rel="noopener"' : '';
    return '<a class="guide-action guide-action--' + escapeHtml(type) + (primary ? ' guide-action--primary' : '') + '" href="' + escapeHtml(href) + '"' + external + ' aria-label="' + escapeHtml(label) + '" title="' + escapeHtml(label) + '" data-i18n-aria="' + escapeHtml(key) + '" data-i18n-title="' + escapeHtml(key) + '"><img src="' + ACTION_ASSETS[type] + '" alt="" aria-hidden="true"><span class="sr-only" data-i18n="' + escapeHtml(key) + '">' + escapeHtml(label) + '</span></a>';
  }

  function renderCards() {
    filteredPlaces = placesForState();
    results.innerHTML = filteredPlaces.map(function (place) {
      var approximate = place.coordinateKind === 'center_candidate' || place.status === 'candidate_coordinate';
      var closed = place.operatingStatus === 'closed';
      var phone = value(place.phone);
      var address = value(place.address);
      var addressLabel = [address, place.municipality && place.municipality !== address ? place.municipality : ''].filter(Boolean).join(' · ') || t('guide.location.unknown');
      var sources = (place.sources || []).slice(0, 3).map(function (source) {
        var label = source.sourceLabel || source.provider;
        return source.url ? '<a href="' + escapeHtml(source.url) + '" target="_blank" rel="noopener">' + escapeHtml(label) + '</a>' : '<span>' + escapeHtml(label) + '</span>';
      }).join('');
      return '<article class="nearby-card guide-place" data-place-id="' + escapeHtml(place.id) + '" tabindex="0" style="--place-color:' + escapeHtml(categoryColor(place.category)) + '">' +
        '<div class="nearby-card__top"><span class="guide-place__dot" aria-hidden="true"></span><div class="guide-place__heading"><span class="guide-place__category">' + escapeHtml(categoryLabel(place.category)) + '</span><h3>' + escapeHtml(place.name) + '</h3><p class="guide-place__address">' + escapeHtml(addressLabel) + '</p></div><strong class="nearby-card__distance">≈ ' + escapeHtml(formatDistance(place._distanceKm)) + '<small>' + escapeHtml(t('guide.straightLine')) + '</small></strong></div>' +
        (approximate ? '<p class="guide-place__warning">' + escapeHtml(t('guide.coordinate.warning')) + '</p>' : '') +
        (closed ? '<p class="guide-place__warning guide-place__warning--closed">' + escapeHtml(t('guide.status.closed')) + '</p>' : '') +
        '<div class="guide-place__ratings">' + ratingHtml(place) + '</div>' +
        '<div class="guide-place__sources"><span>' + escapeHtml(t('guide.sources')) + '</span>' + sources + '</div>' +
        '<div class="nearby-card__actions">' + action(place.navigationUrl, 'guide.action.navigate', 'navigation', !closed) + action(place.googleMapsUrl, 'guide.action.maps', 'maps') + action(value(place.website), 'guide.action.website', 'website') + action(value(place.instagram), 'guide.action.instagram', 'instagram') + (phone ? action('tel:' + String(phone).replace(/[^+\d]/g, ''), 'nearby.call', 'phone') : '') + '</div></article>';
    }).join('');
    count.textContent = String(filteredPlaces.length);
    empty.hidden = filteredPlaces.length !== 0;
    results.querySelectorAll('[data-place-id]').forEach(function (card) {
      function choose() { selectPlace(card.getAttribute('data-place-id'), false, true); }
      card.addEventListener('focus', choose);
      card.addEventListener('mouseenter', choose);
      card.addEventListener('click', function (event) { if (!event.target.closest('a')) choose(); });
    });
  }

  function renderCategories() {
    var available = new Map();
    publicPlaces.forEach(function (place) {
      var inMode = mode === 'apartment' ? place.discovery.apartment : place.discovery.corridor;
      if (inMode) available.set(place.category, (available.get(place.category) || 0) + 1);
    });
    if (activeCategory !== 'all' && !available.has(activeCategory)) activeCategory = 'all';
    var allCount = Array.from(available.values()).reduce(function (sum, item) { return sum + item; }, 0);
    var buttons = [{ id: 'all', label: t('nearby.cat.all'), count: allCount }].concat(data.categories.filter(function (item) { return available.has(item.id); }).map(function (item) { return { id: item.id, label: categoryLabel(item.id), count: available.get(item.id) }; }));
    categories.innerHTML = buttons.map(function (item) {
      var active = item.id === activeCategory;
      return '<button type="button" class="guide-category' + (active ? ' is-active' : '') + '" data-guide-category="' + escapeHtml(item.id) + '" aria-pressed="' + active + '">' + (item.id === 'all' ? '' : '<i style="--category-color:' + escapeHtml(categoryColor(item.id)) + '"></i>') + '<span>' + escapeHtml(item.label) + '</span><b>' + item.count + '</b></button>';
    }).join('');
  }

  function markerIcon(place, selected) {
    return L.divIcon({
      className: 'guide-marker-wrap',
      html: '<span class="guide-marker' + (selected ? ' is-selected' : '') + '" style="--marker-color:' + escapeHtml(categoryColor(place.category)) + '"><i></i></span>',
      iconSize: [30, 36],
      iconAnchor: [15, 34],
      popupAnchor: [0, -30]
    });
  }

  function homeIcon() {
    return L.divIcon({ className: 'guide-special-wrap', html: '<span class="guide-special guide-special--home" aria-hidden="true">⌂</span>', iconSize: [34, 34], iconAnchor: [17, 17] });
  }

  function userIcon() {
    return L.divIcon({ className: 'guide-special-wrap', html: '<span class="guide-special guide-special--user" aria-hidden="true"><i></i></span>', iconSize: [34, 34], iconAnchor: [17, 17] });
  }

  function initializeMap() {
    if (!window.L) {
      mapFallback.hidden = false;
      mapCanvas.hidden = true;
      return;
    }
    map = L.map(mapCanvas, { zoomControl: false, attributionControl: false, minZoom: 8, maxZoom: 19 });
    L.control.attribution({ prefix: false }).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    markerCluster = typeof L.markerClusterGroup === 'function' ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48, spiderfyOnMaxZoom: true }) : L.layerGroup();
    markerCluster.addTo(map);
    renderGeometry();
  }

  function renderGeometry() {
    if (!map) return;
    if (geometryLayer) geometryLayer.remove();
    geometryLayer = L.layerGroup().addTo(map);
    var corridor = data.geometry.corridor;
    if (mode !== 'apartment') {
      L.geoJSON(corridor.bufferGeometry, { interactive: false, style: { color: '#38a27a', weight: 1, fillColor: '#8fd9bd', fillOpacity: 0.12 } }).addTo(geometryLayer);
    } else {
      L.circle([data.geometry.apartment.lat, data.geometry.apartment.lon], { radius: data.geometry.apartment.radiusMeters, interactive: false, color: '#8bd3b4', weight: 1, dashArray: '7 8', fillColor: '#8bd3b4', fillOpacity: 0.08 }).addTo(geometryLayer);
    }
    L.geoJSON(corridor.geometry, { interactive: false, style: { color: '#e7a957', weight: 5, opacity: 0.92 } }).addTo(geometryLayer);
    L.marker([data.geometry.apartment.lat, data.geometry.apartment.lon], { icon: homeIcon(), zIndexOffset: 900, keyboard: false }).bindTooltip(t('guide.legend.apartment'), { direction: 'top' }).addTo(geometryLayer);
    updateUserMarker();
  }

  function updateUserMarker() {
    if (!map || !geometryLayer) return;
    if (userMarker) { geometryLayer.removeLayer(userMarker); userMarker = null; }
    if (userPosition) userMarker = L.marker([userPosition.lat, userPosition.lon], { icon: userIcon(), zIndexOffset: 1000, keyboard: false }).bindTooltip(t('guide.legend.user'), { direction: 'top' }).addTo(geometryLayer);
  }

  function popupHtml(place) {
    return '<div class="guide-map-popup"><span style="--popup-color:' + escapeHtml(categoryColor(place.category)) + '">' + escapeHtml(categoryLabel(place.category)) + '</span><strong>' + escapeHtml(place.name) + '</strong><small>≈ ' + escapeHtml(formatDistance(place._distanceKm || distanceKm(currentOrigin(), place.location))) + '</small></div>';
  }

  function renderMapPlaces() {
    if (!map || !markerCluster) return;
    markerCluster.clearLayers();
    markers.clear();
    filteredPlaces.forEach(function (place) {
      var marker = L.marker([place.location.lat, place.location.lon], { icon: markerIcon(place, place.id === selectedId), title: place.name, riseOnHover: true });
      marker.bindPopup(popupHtml(place), { closeButton: true, maxWidth: 250 });
      marker.on('click', function () { selectPlace(place.id, true, false); });
      markers.set(place.id, marker);
      markerCluster.addLayer(marker);
    });
  }

  function visibleBounds() {
    if (!window.L) return null;
    var points = filteredPlaces.map(function (place) { return [place.location.lat, place.location.lon]; });
    points.push([data.geometry.apartment.lat, data.geometry.apartment.lon]);
    if (userPosition) points.push([userPosition.lat, userPosition.lon]);
    if (mode !== 'apartment') data.geometry.corridor.geometry.coordinates.forEach(function (point) { points.push([point[1], point[0]]); });
    return points.length ? L.latLngBounds(points) : null;
  }

  function fitMap() {
    if (!map) return;
    var bounds = visibleBounds();
    if (bounds && bounds.isValid()) map.fitBounds(bounds, { padding: [34, 34], maxZoom: mode === 'apartment' ? 12 : 11 });
    setTimeout(function () { map.invalidateSize(); }, 50);
  }

  function preferredMapVisibility() {
    try {
      var stored = sessionStorage.getItem(MAP_VISIBILITY_KEY);
      if (stored === 'true' || stored === 'false') return stored === 'true';
    } catch (e) {}
    return !window.matchMedia('(max-width: 760px)').matches;
  }

  function setMapVisible(next, persist) {
    mapVisible = !!next;
    if (mapShell) mapShell.hidden = !mapVisible;
    if (layout) layout.setAttribute('data-map-visible', mapVisible ? 'true' : 'false');
    if (mapToggle) mapToggle.setAttribute('aria-expanded', mapVisible ? 'true' : 'false');
    var key = mapVisible ? 'guide.map.hide' : 'guide.map.show';
    if (mapToggleLabel) {
      mapToggleLabel.setAttribute('data-i18n', key);
      mapToggleLabel.textContent = t(key);
    }
    if (persist !== false) {
      try { sessionStorage.setItem(MAP_VISIBILITY_KEY, mapVisible ? 'true' : 'false'); } catch (e) {}
    }
    if (mapVisible && map) setTimeout(function () { map.invalidateSize(); fitMap(); }, 80);
  }

  function selectPlace(id, scroll, pan) {
    selectedId = id;
    results.querySelectorAll('[data-place-id]').forEach(function (card) { card.classList.toggle('is-selected', card.getAttribute('data-place-id') === id); });
    markers.forEach(function (marker, markerId) {
      var place = publicPlaces.find(function (item) { return item.id === markerId; });
      if (place) marker.setIcon(markerIcon(place, markerId === id));
    });
    var marker = markers.get(id);
    if (marker && pan && map) map.panTo(marker.getLatLng(), { animate: true });
    if (scroll) {
      var target = Array.prototype.find.call(results.querySelectorAll('[data-place-id]'), function (card) { return card.getAttribute('data-place-id') === id; });
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function renderQuality() {
    var stats = data.meta.statistics;
    var canonicalCount = publicPlaces.filter(function (place) { return place.discovery.apartment; }).length;
    quality.innerHTML = '<span><b>' + escapeHtml(canonicalCount) + '</b> ' + escapeHtml(t('guide.quality.places')) + '</span><span><b>' + escapeHtml(stats.duplicatesMerged) + '</b> ' + escapeHtml(t('guide.quality.merged')) + '</span><span><b>' + escapeHtml(data.providers.filter(function (provider) { return provider.enabled; }).length) + '</b> ' + escapeHtml(t('guide.quality.providers')) + '</span>';
    total.textContent = String(canonicalCount);
  }

  function updateModeCopy() {
    modeSummary.textContent = t('guide.mode.' + mode + '.summary');
    showBehindWrap.hidden = mode !== 'nearby';
    if (!userPosition) status.textContent = mode === 'nearby' ? t('guide.location.nearbyFallback') : t('guide.location.fallback');
  }

  function render(shouldFit) {
    if (!data) return;
    renderCategories();
    renderCards();
    renderMapPlaces();
    updateModeCopy();
    if (shouldFit) fitMap();
  }

  function setMode(next) {
    mode = next;
    activeCategory = 'all';
    modeGroup.querySelectorAll('[data-guide-mode]').forEach(function (button) {
      var active = button.getAttribute('data-guide-mode') === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    renderGeometry();
    render(true);
  }

  function openLocationDialog() {
    if (typeof locationDialog.showModal === 'function') locationDialog.showModal();
    else locationDialog.setAttribute('open', '');
  }

  function closeLocationDialog() {
    if (typeof locationDialog.close === 'function') locationDialog.close();
    else locationDialog.removeAttribute('open');
  }

  function stopLocationWatch() {
    if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  function usePosition(position, nextMode) {
    userPosition = { lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy };
    locationMode = nextMode;
    status.textContent = t(nextMode === 'session' ? 'guide.location.sessionActive' : 'guide.location.onceActive') + (Number.isFinite(position.coords.accuracy) ? ' · ±' + Math.round(position.coords.accuracy) + ' m' : '');
    locate.disabled = false;
    updateUserMarker();
    setMode('nearby');
  }

  function locationFailure() {
    stopLocationWatch();
    locationMode = 'none';
    userPosition = null;
    locate.disabled = false;
    status.textContent = t('nearby.denied');
    updateUserMarker();
    setMode('nearby');
  }

  function requestLocation(choice) {
    closeLocationDialog();
    stopLocationWatch();
    if (choice === 'none') {
      locationMode = 'none';
      userPosition = null;
      status.textContent = t('guide.location.nearbyFallback');
      updateUserMarker();
      setMode('nearby');
      return;
    }
    if (!navigator.geolocation) { locationFailure(); return; }
    locate.disabled = true;
    status.textContent = t('nearby.locating');
    var options = { enableHighAccuracy: false, timeout: 10000, maximumAge: choice === 'once' ? 120000 : 15000 };
    if (choice === 'session') watchId = navigator.geolocation.watchPosition(function (position) { usePosition(position, 'session'); }, locationFailure, options);
    else navigator.geolocation.getCurrentPosition(function (position) { usePosition(position, 'once'); }, locationFailure, options);
  }

  modeGroup.addEventListener('click', function (event) {
    var button = event.target.closest('[data-guide-mode]');
    if (button) setMode(button.getAttribute('data-guide-mode'));
  });
  routeFeatured.addEventListener('click', function () { setMode('route'); modeGroup.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  categories.addEventListener('click', function (event) {
    var button = event.target.closest('[data-guide-category]');
    if (!button) return;
    activeCategory = button.getAttribute('data-guide-category');
    render(true);
  });
  [search, rating, distance, sort, showBehind].forEach(function (control) { control.addEventListener(control === search ? 'input' : 'change', function () { render(false); }); });
  locate.addEventListener('click', openLocationDialog);
  locationDialog.addEventListener('click', function (event) {
    var button = event.target.closest('[data-location-choice]');
    if (button) requestLocation(button.getAttribute('data-location-choice'));
    else if (event.target === locationDialog) closeLocationDialog();
  });
  if (mapToggle) mapToggle.addEventListener('click', function () { setMapVisible(!mapVisible, true); });
  document.getElementById('guide-map-fit').addEventListener('click', fitMap);
  document.getElementById('guide-map-in').addEventListener('click', function () { if (map) map.zoomIn(); });
  document.getElementById('guide-map-out').addEventListener('click', function () { if (map) map.zoomOut(); });
  window.addEventListener('resize', function () { if (map) map.invalidateSize(); });
  window.addEventListener('pagehide', function () { stopLocationWatch(); userPosition = null; locationMode = 'none'; });
  document.addEventListener('cordal:access-ended', function () { stopLocationWatch(); userPosition = null; locationMode = 'none'; updateUserMarker(); });

  if (window.GH_I18N) window.GH_I18N.subscribe(function () { renderQuality(); renderGeometry(); render(false); setMapVisible(mapVisible, false); });

  fetch('data/destination-guide.json').then(function (response) {
    if (!response.ok) throw new Error('destination guide unavailable');
    return response.json();
  }).then(function (payload) {
    data = payload;
    if (loading) loading.hidden = true;
    if (resultsRegion) resultsRegion.setAttribute('aria-busy', 'false');
    publicPlaces = data.places.filter(function (place) { return !LODGING[place.category]; });
    data._centerline = data.geometry.corridor.geometry.coordinates.map(function (point) { return { lon: point[0], lat: point[1] }; });
    renderQuality();
    initializeMap();
    setMapVisible(preferredMapVisibility(), false);
    render(true);
  }).catch(function () {
    if (loading) loading.hidden = true;
    if (resultsRegion) resultsRegion.setAttribute('aria-busy', 'false');
    mapFallback.hidden = false;
    empty.hidden = false;
    empty.textContent = t('guide.loadError');
    status.textContent = t('guide.loadError');
  });
}());
