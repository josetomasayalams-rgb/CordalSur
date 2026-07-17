(function () {
  'use strict';

  var results = document.getElementById('nearby-results');
  var locate = document.getElementById('nearby-locate');
  var status = document.getElementById('nearby-status');
  var count = document.getElementById('nearby-count');
  var empty = document.getElementById('nearby-empty');
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
  var svg = document.getElementById('guide-map-svg');
  var popover = document.getElementById('guide-map-popover');
  if (!results || !locate || !categories || !svg) return;

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var data = null;
  var mode = 'apartment';
  var activeCategory = 'all';
  var userPosition = null;
  var selectedId = null;
  var viewBox = { x: 0, y: 0, width: 1000, height: 620 };
  var projection = null;
  var filteredPlaces = [];

  function t(key) { return window.GH_I18N ? window.GH_I18N.t(key) : key; }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function distanceKm(a, b) {
    var radians = Math.PI / 180;
    var dLat = (b.lat - a.lat) * radians;
    var dLon = (b.lon - a.lon) * radians;
    var lat1 = a.lat * radians;
    var lat2 = b.lat * radians;
    var h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function formatDistance(value) {
    var lang = window.GH_I18N ? window.GH_I18N.getLang() : 'es';
    return new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : lang, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value) + ' km';
  }

  function value(field) { return field && typeof field === 'object' && 'value' in field ? field.value : field; }

  function ratingValue(place) {
    return Math.max(Number(place.googleRating && place.googleRating.value || 0), Number(place.tripadvisorRating && place.tripadvisorRating.value || 0));
  }

  function popularity(place) {
    return Math.max(Number(place.googleRating && place.googleRating.reviewCount || 0), Number(place.tripadvisorRating && place.tripadvisorRating.reviewCount || 0));
  }

  function categoryLabel(id) {
    var translated = t('guide.cat.' + id);
    if (translated !== 'guide.cat.' + id) return translated;
    var category = data && data.categories.find(function (item) { return item.id === id; });
    return category ? category.label : id;
  }

  function categoryColor(id) {
    var category = data && data.categories.find(function (item) { return item.id === id; });
    return category ? category.color : '#66706c';
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
      var px = ax + fraction * dx;
      var py = ay + fraction * dy;
      var candidateDistance = Math.hypot(px, py);
      var segmentLength = Math.hypot(dx, dy);
      if (!best || candidateDistance < best.distanceMeters) best = { distanceMeters: candidateDistance, progressMeters: progress + fraction * segmentLength };
      progress += segmentLength;
    }
    return best || { distanceMeters: Infinity, progressMeters: 0 };
  }

  function currentOrigin() {
    if (userPosition) return userPosition;
    if (mode === 'nearby') return data.geometry.corridor.ruralStart;
    return { lat: data.geometry.apartment.lat, lon: data.geometry.apartment.lon };
  }

  function placesForState() {
    var origin = currentOrigin();
    var query = normalize(search.value);
    var minimumRating = Number(rating.value || 0);
    var maximumDistance = Number(distance.value || 0);
    var userProgress = userPosition ? lineProjection(data._centerline, userPosition).progressMeters : 0;
    var list = data.places.filter(function (place) {
      if (mode === 'apartment' && !place.discovery.apartment) return false;
      if ((mode === 'nearby' || mode === 'route') && !place.discovery.corridor) return false;
      if (mode === 'nearby' && userPosition && !showBehind.checked && place.discovery.routeProgressMeters < userProgress) return false;
      if (activeCategory !== 'all' && place.category !== activeCategory) return false;
      var directDistance = distanceKm(origin, place.location);
      if (maximumDistance && directDistance > maximumDistance) return false;
      if (minimumRating && ratingValue(place) < minimumRating) return false;
      if (query) {
        var haystack = normalize([place.name, categoryLabel(place.category), place.municipality, value(place.address)].filter(Boolean).join(' '));
        if (!haystack.includes(query)) return false;
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

  function action(href, label, className) {
    if (!href) return '';
    return '<a class="' + className + '" href="' + escapeHtml(href) + '" target="_blank" rel="noopener">' + escapeHtml(label) + '</a>';
  }

  function renderCards() {
    filteredPlaces = placesForState();
    results.innerHTML = filteredPlaces.map(function (place) {
      var approximate = place.coordinateKind === 'center_candidate' || place.status === 'candidate_coordinate';
      var closed = place.operatingStatus === 'closed';
      var phone = value(place.phone);
      var sources = (place.sources || []).map(function (source) {
        var label = source.sourceLabel || source.provider;
        return source.url ? '<a href="' + escapeHtml(source.url) + '" target="_blank" rel="noopener">' + escapeHtml(label) + '</a>' : '<span>' + escapeHtml(label) + '</span>';
      }).join('');
      return '<article class="nearby-card guide-place" data-place-id="' + escapeHtml(place.id) + '" tabindex="0" style="--place-color:' + escapeHtml(categoryColor(place.category)) + '">' +
        '<div class="nearby-card__top"><span class="guide-place__dot" aria-hidden="true"></span><div class="guide-place__heading"><span class="guide-place__category">' + escapeHtml(categoryLabel(place.category)) + '</span><h3>' + escapeHtml(place.name) + '</h3><p>' + escapeHtml(place.municipality || value(place.address) || t('guide.location.unknown')) + '</p></div><strong class="nearby-card__distance">≈ ' + escapeHtml(formatDistance(place._distanceKm)) + '<small>' + escapeHtml(t('guide.straightLine')) + '</small></strong></div>' +
        (approximate ? '<p class="guide-place__warning">' + escapeHtml(t('guide.coordinate.warning')) + '</p>' : '') +
        (closed ? '<p class="guide-place__warning guide-place__warning--closed">' + escapeHtml(t('guide.status.closed')) + '</p>' : '') +
        '<div class="guide-place__ratings">' + ratingHtml(place) + '</div>' +
        '<div class="guide-place__sources"><span>' + escapeHtml(t('guide.sources')) + '</span>' + sources + '</div>' +
        '<div class="nearby-card__actions">' +
          action(place.navigationUrl, t('guide.action.navigate'), 'guide-action guide-action--primary' + (closed ? ' is-disabled' : '')) +
          action(place.googleMapsUrl, t('guide.action.maps'), 'guide-action') +
          action(value(place.website), t('guide.action.website'), 'guide-action') +
          action(value(place.instagram), 'Instagram', 'guide-action') +
          (phone ? '<a class="guide-action" href="tel:' + escapeHtml(String(phone).replace(/[^+\d]/g, '')) + '">' + escapeHtml(t('nearby.call')) + '</a>' : '') +
        '</div></article>';
    }).join('');
    count.textContent = String(filteredPlaces.length);
    empty.hidden = filteredPlaces.length > 0;
    results.querySelectorAll('[data-place-id]').forEach(function (card) {
      card.addEventListener('focus', function () { selectPlace(card.getAttribute('data-place-id'), false); });
      card.addEventListener('mouseenter', function () { selectPlace(card.getAttribute('data-place-id'), false); });
    });
  }

  function renderCategories() {
    var available = new Map();
    data.places.forEach(function (place) {
      var inMode = mode === 'apartment' ? place.discovery.apartment : place.discovery.corridor;
      if (inMode) available.set(place.category, (available.get(place.category) || 0) + 1);
    });
    var buttons = [{ id: 'all', label: t('nearby.cat.all'), count: [...available.values()].reduce(function (sum, item) { return sum + item; }, 0) }]
      .concat(data.categories.filter(function (item) { return available.has(item.id); }).map(function (item) { return { id: item.id, label: categoryLabel(item.id), count: available.get(item.id) }; }));
    categories.innerHTML = buttons.map(function (item) {
      var active = item.id === activeCategory;
      return '<button type="button" class="guide-category' + (active ? ' is-active' : '') + '" data-guide-category="' + escapeHtml(item.id) + '" aria-pressed="' + active + '">' +
        (item.id === 'all' ? '' : '<i style="--category-color:' + escapeHtml(categoryColor(item.id)) + '"></i>') + '<span>' + escapeHtml(item.label) + '</span><b>' + item.count + '</b></button>';
    }).join('');
  }

  function createSvg(name, attributes) {
    var node = document.createElementNS(SVG_NS, name);
    Object.keys(attributes || {}).forEach(function (key) { node.setAttribute(key, attributes[key]); });
    return node;
  }

  function configureProjection() {
    var all = [];
    data.geometry.corridor.geometry.coordinates.forEach(function (point) { all.push({ lon: point[0], lat: point[1] }); });
    data.geometry.corridor.bufferGeometry.coordinates[0].forEach(function (point) { all.push({ lon: point[0], lat: point[1] }); });
    data.places.forEach(function (place) { all.push(place.location); });
    var west = Math.min.apply(null, all.map(function (point) { return point.lon; }));
    var east = Math.max.apply(null, all.map(function (point) { return point.lon; }));
    var south = Math.min.apply(null, all.map(function (point) { return point.lat; }));
    var north = Math.max.apply(null, all.map(function (point) { return point.lat; }));
    var padding = 35;
    projection = {
      west: west, east: east, south: south, north: north,
      point: function (point) {
        return {
          x: padding + (point.lon - west) / (east - west) * (1000 - padding * 2),
          y: padding + (north - point.lat) / (north - south) * (620 - padding * 2)
        };
      }
    };
  }

  function pathData(coordinates) {
    return coordinates.map(function (coordinate, index) {
      var point = projection.point({ lon: coordinate[0], lat: coordinate[1] });
      return (index ? 'L' : 'M') + point.x.toFixed(1) + ' ' + point.y.toFixed(1);
    }).join(' ');
  }

  function setViewBox(next) {
    viewBox = next;
    svg.setAttribute('viewBox', [next.x, next.y, next.width, next.height].join(' '));
  }

  function fitMap() {
    setViewBox({ x: 0, y: 0, width: 1000, height: 620 });
    renderMap();
  }

  function zoom(factor, center) {
    var width = Math.max(120, Math.min(1000, viewBox.width * factor));
    var height = width * 0.62;
    var x = (center ? center.x : viewBox.x + viewBox.width / 2) - width / 2;
    var y = (center ? center.y : viewBox.y + viewBox.height / 2) - height / 2;
    setViewBox({ x: Math.max(0, Math.min(1000 - width, x)), y: Math.max(0, Math.min(620 - height, y)), width: width, height: height });
    renderMap();
  }

  function mapBase() {
    svg.innerHTML = '';
    svg.appendChild(createSvg('rect', { x: 0, y: 0, width: 1000, height: 620, class: 'guide-map__background' }));
    if (mode !== 'apartment') {
      svg.appendChild(createSvg('path', { d: pathData(data.geometry.corridor.bufferGeometry.coordinates[0]) + ' Z', class: 'guide-map__corridor' }));
    }
    if (mode === 'apartment') {
      var apartment = projection.point({ lat: data.geometry.apartment.lat, lon: data.geometry.apartment.lon });
      var eastPoint = { lat: data.geometry.apartment.lat, lon: data.geometry.apartment.lon + data.geometry.apartment.radiusMeters / (111320 * Math.cos(data.geometry.apartment.lat * Math.PI / 180)) };
      var radius = Math.abs(projection.point(eastPoint).x - apartment.x);
      svg.appendChild(createSvg('circle', { cx: apartment.x, cy: apartment.y, r: radius, class: 'guide-map__radius' }));
    }
    svg.appendChild(createSvg('path', { d: pathData(data.geometry.corridor.geometry.coordinates), class: 'guide-map__route' }));
    var apartmentPoint = projection.point({ lat: data.geometry.apartment.lat, lon: data.geometry.apartment.lon });
    svg.appendChild(createSvg('circle', { cx: apartmentPoint.x, cy: apartmentPoint.y, r: 9, class: 'guide-map__home' }));
    if (userPosition) {
      var user = projection.point(userPosition);
      svg.appendChild(createSvg('circle', { cx: user.x, cy: user.y, r: 10, class: 'guide-map__user-ring' }));
      svg.appendChild(createSvg('circle', { cx: user.x, cy: user.y, r: 4, class: 'guide-map__user' }));
    }
  }

  function renderMap() {
    if (!projection) return;
    mapBase();
    var cellSize = Math.max(18, viewBox.width / 11);
    var clusters = new Map();
    filteredPlaces.forEach(function (place) {
      var point = projection.point(place.location);
      var key = Math.floor(point.x / cellSize) + ':' + Math.floor(point.y / cellSize);
      var cluster = clusters.get(key) || { places: [], x: 0, y: 0 };
      cluster.places.push(place);
      cluster.x += point.x;
      cluster.y += point.y;
      clusters.set(key, cluster);
    });
    clusters.forEach(function (cluster) {
      cluster.x /= cluster.places.length;
      cluster.y /= cluster.places.length;
      var group = createSvg('g', { class: 'guide-map__marker', tabindex: '0', role: 'button', 'aria-label': cluster.places.length > 1 ? cluster.places.length + ' ' + t('guide.map.cluster') : cluster.places[0].name });
      var selected = cluster.places.some(function (place) { return place.id === selectedId; });
      group.appendChild(createSvg('circle', { cx: cluster.x, cy: cluster.y, r: cluster.places.length > 1 ? 15 : 9, fill: cluster.places.length > 1 ? '#153b33' : categoryColor(cluster.places[0].category), class: selected ? 'is-selected' : '' }));
      if (cluster.places.length > 1) {
        var label = createSvg('text', { x: cluster.x, y: cluster.y + 4, 'text-anchor': 'middle' });
        label.textContent = cluster.places.length;
        group.appendChild(label);
      }
      group.addEventListener('click', function () {
        if (cluster.places.length > 1) zoom(0.5, { x: cluster.x, y: cluster.y });
        else selectPlace(cluster.places[0].id, true);
      });
      group.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); group.dispatchEvent(new Event('click')); } });
      svg.appendChild(group);
    });
  }

  function selectPlace(id, scroll) {
    selectedId = id;
    var place = data.places.find(function (item) { return item.id === id; });
    results.querySelectorAll('[data-place-id]').forEach(function (card) { card.classList.toggle('is-selected', card.getAttribute('data-place-id') === id); });
    if (place) {
      popover.hidden = false;
      popover.innerHTML = '<strong>' + escapeHtml(place.name) + '</strong><span>' + escapeHtml(categoryLabel(place.category)) + '</span>';
      if (scroll) {
        var card = results.querySelector('[data-place-id="' + CSS.escape(id) + '"]');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
    renderMap();
  }

  function updateModeCopy() {
    modeSummary.textContent = t('guide.mode.' + mode + '.summary');
    showBehindWrap.hidden = mode !== 'nearby';
    if (!userPosition) status.textContent = mode === 'nearby' ? t('guide.location.nearbyFallback') : t('guide.location.fallback');
  }

  function renderQuality() {
    var stats = data.meta.statistics;
    quality.innerHTML = '<span><b>' + escapeHtml(stats.publishedPlaces) + '</b> ' + escapeHtml(t('guide.quality.places')) + '</span>' +
      '<span><b>' + escapeHtml(stats.duplicatesMerged) + '</b> ' + escapeHtml(t('guide.quality.merged')) + '</span>' +
      '<span><b>' + escapeHtml(data.providers.filter(function (provider) { return provider.enabled; }).length) + '</b> ' + escapeHtml(t('guide.quality.providers')) + '</span>';
  }

  function render() {
    if (!data) return;
    renderCategories();
    renderCards();
    renderMap();
    updateModeCopy();
  }

  function setMode(next) {
    mode = next;
    activeCategory = 'all';
    modeGroup.querySelectorAll('[data-guide-mode]').forEach(function (button) {
      var active = button.getAttribute('data-guide-mode') === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    fitMap();
    render();
  }

  modeGroup.addEventListener('click', function (event) {
    var button = event.target.closest('[data-guide-mode]');
    if (button) setMode(button.getAttribute('data-guide-mode'));
  });
  routeFeatured.addEventListener('click', function () { setMode('route'); document.getElementById('guide-mode').scrollIntoView({ behavior: 'smooth' }); });
  categories.addEventListener('click', function (event) {
    var button = event.target.closest('[data-guide-category]');
    if (!button) return;
    activeCategory = button.getAttribute('data-guide-category');
    render();
  });
  [search, rating, distance, sort, showBehind].forEach(function (control) { control.addEventListener(control === search ? 'input' : 'change', render); });

  locate.addEventListener('click', function () {
    if (!navigator.geolocation) { status.textContent = t('nearby.denied'); return; }
    locate.disabled = true;
    status.textContent = t('nearby.locating');
    navigator.geolocation.getCurrentPosition(function (position) {
      userPosition = { lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy };
      locate.disabled = false;
      status.textContent = t('nearby.live') + (Number.isFinite(position.coords.accuracy) ? ' · ±' + Math.round(position.coords.accuracy) + ' m' : '');
      setMode('nearby');
    }, function () {
      userPosition = null;
      locate.disabled = false;
      status.textContent = t('nearby.denied');
      render();
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
  });

  document.getElementById('guide-map-fit').addEventListener('click', fitMap);
  document.getElementById('guide-map-in').addEventListener('click', function () { zoom(0.65); });
  document.getElementById('guide-map-out').addEventListener('click', function () { zoom(1.5); });
  window.addEventListener('pagehide', function () { userPosition = null; });

  if (window.GH_I18N) window.GH_I18N.subscribe(function () { renderQuality(); render(); });

  fetch('data/destination-guide.json').then(function (response) {
    if (!response.ok) throw new Error('destination guide unavailable');
    return response.json();
  }).then(function (payload) {
    data = payload;
    data._centerline = data.geometry.corridor.geometry.coordinates.map(function (point) { return { lon: point[0], lat: point[1] }; });
    configureProjection();
    renderQuality();
    render();
  }).catch(function () {
    empty.hidden = false;
    empty.textContent = t('guide.loadError');
    status.textContent = t('guide.loadError');
  });
})();
