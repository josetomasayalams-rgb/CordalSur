(function () {
  'use strict';

  var worker = null;
  var readyPromise = null;
  var sequence = 0;
  var pending = new Map();
  var latestRouteRequest = 0;

  function locale(language) {
    return language === 'pt' ? 'pt-BR' : (language === 'en' ? 'en' : 'es-CL');
  }

  function formatMeters(meters, language) {
    if (!Number.isFinite(Number(meters))) return null;
    var value = Number(meters);
    if (value < 1) return '< 1 m';
    var kilometres = value >= 1000;
    var formatter = new Intl.NumberFormat(locale(language || (window.GH_I18N && window.GH_I18N.getLang()) || 'es'), {
      minimumSignificantDigits: 3,
      maximumSignificantDigits: 3,
      useGrouping: true
    });
    return formatter.format(kilometres ? value / 1000 : value) + (kilometres ? ' km' : ' m');
  }

  function send(type, payload) {
    if (!worker) return Promise.reject(new Error('road worker unavailable'));
    var requestId = ++sequence;
    return new Promise(function (resolve, reject) {
      pending.set(requestId, { resolve: resolve, reject: reject, type: type });
      worker.postMessage(Object.assign({ type: type, requestId: requestId }, payload || {}));
    });
  }

  function init(networkUrl) {
    if (readyPromise) return readyPromise;
    if (typeof Worker === 'undefined') return Promise.reject(new Error('Web Worker unavailable'));
    worker = new Worker('js/road-distance-worker.js?v=1', { type: 'module' });
    worker.addEventListener('message', function (event) {
      var message = event.data || {};
      var item = pending.get(message.requestId);
      if (!item) return;
      pending.delete(message.requestId);
      if (message.type === 'error') item.reject(new Error(message.message || 'road worker error'));
      else item.resolve(message);
    });
    worker.addEventListener('error', function (event) {
      pending.forEach(function (item) { item.reject(new Error(event.message || 'road worker error')); });
      pending.clear();
    });
    readyPromise = send('init', {
      networkUrl: networkUrl || new URL('data/driving-network.json?v=1', document.baseURI).href
    });
    return readyPromise;
  }

  function routeFrom(origin) {
    var request = ++latestRouteRequest;
    return init().then(function () { return send('route', { origin: origin }); }).then(function (message) {
      if (request !== latestRouteRequest) throw Object.assign(new Error('stale road distance response'), { stale: true });
      return message;
    });
  }

  function destroy() {
    latestRouteRequest += 1;
    if (worker) worker.postMessage({ type: 'dispose' });
    worker = null;
    readyPromise = null;
    pending.forEach(function (item) { item.reject(new Error('road worker disposed')); });
    pending.clear();
  }

  window.CordalRoadDistances = { init: init, routeFrom: routeFrom, formatMeters: formatMeters, destroy: destroy };
})();
