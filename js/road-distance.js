(function () {
  'use strict';

  var INIT_TIMEOUT_MS = 10000;
  var ROUTE_TIMEOUT_MS = 5000;
  var worker = null;
  var readyPromise = null;
  var activeConfig = null;
  var activeGraph = null;
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

  function roadError(message, code) {
    var error = new Error(message);
    error.code = code;
    return error;
  }

  function staleError() {
    return Object.assign(roadError('stale road distance response', 'ROAD_STALE'), { stale: true });
  }

  function graphIdentity(value) {
    value = value && typeof value === 'object' ? value : {};
    return {
      schemaVersion: value.schemaVersion === undefined || value.schemaVersion === null ? null : Number(value.schemaVersion),
      version: value.version || value.generatedAt || null,
      hash: value.hash || value.responseSha256 || null
    };
  }

  function validateGraph(actualValue, expectedValue) {
    var actual = graphIdentity(actualValue);
    var expected = graphIdentity(expectedValue);
    ['schemaVersion', 'version', 'hash'].forEach(function (key) {
      if (expected[key] !== null && String(actual[key]) !== String(expected[key])) {
        throw roadError('driving network ' + key + ' mismatch', 'ROAD_GRAPH_MISMATCH');
      }
    });
    return actual;
  }

  function sameGraph(leftValue, rightValue) {
    var left = graphIdentity(leftValue);
    var right = graphIdentity(rightValue);
    return ['schemaVersion', 'version', 'hash'].every(function (key) {
      return String(left[key]) === String(right[key]);
    });
  }

  function resolveNetworkUrl(value) {
    var url = new URL(value || 'data/driving-network.json?v=1', document.baseURI);
    var location = document.location || window.location;
    if (location && location.origin && url.origin !== location.origin) {
      throw roadError('driving network must be same-origin', 'ROAD_NETWORK_ORIGIN');
    }
    return url.href;
  }

  function normalizeConfig(networkUrl, options) {
    var settings = options && typeof options === 'object' ? options : {};
    var value = networkUrl;
    if (networkUrl && typeof networkUrl === 'object') {
      settings = networkUrl;
      value = settings.networkUrl;
    }
    var expected = graphIdentity(settings.expectedGraph || {
      schemaVersion: settings.expectedGraphSchemaVersion,
      version: settings.expectedGraphVersion,
      hash: settings.expectedGraphHash
    });
    return {
      networkUrl: resolveNetworkUrl(value || settings.networkUrl),
      expectedGraph: expected,
      initTimeoutMs: Number.isFinite(Number(settings.initTimeoutMs)) ? Number(settings.initTimeoutMs) : INIT_TIMEOUT_MS,
      routeTimeoutMs: Number.isFinite(Number(settings.routeTimeoutMs)) ? Number(settings.routeTimeoutMs) : ROUTE_TIMEOUT_MS
    };
  }

  function configKey(config) {
    return JSON.stringify(config);
  }

  function rejectPendingFor(instance, error) {
    pending.forEach(function (item, requestId) {
      if (item.worker !== instance) return;
      pending.delete(requestId);
      clearTimeout(item.timer);
      item.reject(error);
    });
  }

  function stopWorker(instance, error, notifyDispose) {
    if (!instance) return;
    if (worker === instance) {
      worker = null;
      readyPromise = null;
      activeConfig = null;
      activeGraph = null;
    }
    if (notifyDispose) {
      try { instance.postMessage({ type: 'dispose' }); } catch (_) { /* already unavailable */ }
    }
    try { instance.terminate(); } catch (_) { /* already terminated */ }
    rejectPendingFor(instance, error || roadError('road worker disposed', 'ROAD_WORKER_DISPOSED'));
  }

  function handleMessage(instance, event) {
    if (instance !== worker) return;
    var message = event.data || {};
    var item = pending.get(message.requestId);
    if (!item || item.worker !== instance) return;
    pending.delete(message.requestId);
    clearTimeout(item.timer);
    if (message.type === 'error') {
      item.reject(roadError(message.message || 'road worker error', message.code || 'ROAD_WORKER_ERROR'));
      return;
    }
    var expectedType = item.type === 'init' ? 'ready' : 'result';
    if (message.type !== expectedType) {
      item.reject(roadError('invalid road worker response', 'ROAD_INVALID_RESPONSE'));
      return;
    }
    item.resolve(message);
  }

  function bindWorker(instance) {
    instance.addEventListener('message', function (event) { handleMessage(instance, event); });
    instance.addEventListener('error', function (event) {
      stopWorker(instance, roadError(event.message || 'road worker error', 'ROAD_WORKER_ERROR'));
    });
    instance.addEventListener('messageerror', function () {
      stopWorker(instance, roadError('road worker message error', 'ROAD_WORKER_MESSAGE'));
    });
  }

  function send(type, payload, timeoutMs) {
    var instance = worker;
    if (!instance) return Promise.reject(roadError('road worker unavailable', 'ROAD_WORKER_UNAVAILABLE'));
    var requestId = ++sequence;
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        var item = pending.get(requestId);
        if (!item) return;
        pending.delete(requestId);
        var error = roadError(type === 'init' ? 'road worker initialization timed out' : 'road route timed out', type === 'init' ? 'ROAD_INIT_TIMEOUT' : 'ROAD_ROUTE_TIMEOUT');
        item.reject(error);
        if (type === 'init') stopWorker(instance, error);
      }, timeoutMs);
      pending.set(requestId, { resolve: resolve, reject: reject, type: type, timer: timer, worker: instance });
      try {
        instance.postMessage(Object.assign({ type: type, requestId: requestId }, payload || {}));
      } catch (error) {
        pending.delete(requestId);
        clearTimeout(timer);
        reject(roadError(error && error.message ? error.message : 'road worker post failed', 'ROAD_WORKER_POST'));
      }
    });
  }

  function init(networkUrl, options) {
    var config;
    try {
      config = normalizeConfig(networkUrl, options);
    } catch (error) {
      return Promise.reject(error);
    }
    if (readyPromise && activeConfig && configKey(config) === configKey(activeConfig)) return readyPromise;
    if (typeof Worker === 'undefined') return Promise.reject(roadError('Web Worker unavailable', 'ROAD_WORKER_UNAVAILABLE'));
    if (worker) stopWorker(worker, roadError('road worker configuration changed', 'ROAD_WORKER_RESET'));

    var instance;
    try {
      instance = new Worker('js/road-distance-worker.js?v=2', { type: 'module' });
    } catch (error) {
      return Promise.reject(roadError(error && error.message ? error.message : 'road worker could not start', 'ROAD_WORKER_CONSTRUCTOR'));
    }

    worker = instance;
    activeConfig = config;
    bindWorker(instance);
    var promise = send('init', {
      networkUrl: config.networkUrl,
      expectedGraph: config.expectedGraph
    }, config.initTimeoutMs).then(function (message) {
      var identity = validateGraph(message.graph, config.expectedGraph);
      if (worker !== instance) throw roadError('road worker replaced during initialization', 'ROAD_WORKER_RESET');
      activeGraph = identity;
      return message;
    }).catch(function (error) {
      if (worker === instance) stopWorker(instance, error);
      if (readyPromise === promise) readyPromise = null;
      throw error;
    });
    readyPromise = promise;
    return promise;
  }

  function recoverable(error) {
    return !error.stale && ![
      'ROAD_GRAPH_MISMATCH',
      'ROAD_INVALID_ORIGIN',
      'ROAD_INVALID_RESPONSE',
      'ROAD_NETWORK_ORIGIN',
      'ROAD_WORKER_UNAVAILABLE'
    ].includes(error.code);
  }

  function routeAttempt(request, origin, config, retry) {
    if (request !== latestRouteRequest) return Promise.reject(staleError());
    return init(config).then(function () {
      if (request !== latestRouteRequest) throw staleError();
      return send('route', { origin: origin }, config.routeTimeoutMs);
    }).then(function (message) {
      if (request !== latestRouteRequest) throw staleError();
      if (!activeGraph || !sameGraph(message.graph, activeGraph)) {
        throw roadError('driving network changed during routing', 'ROAD_GRAPH_MISMATCH');
      }
      if (message.coverage !== 'covered' && message.coverage !== 'outside-network') {
        throw roadError('invalid road coverage response', 'ROAD_INVALID_RESPONSE');
      }
      return message;
    }).catch(function (error) {
      if (request !== latestRouteRequest) throw staleError();
      var canRetry = recoverable(error);
      if (worker && error.code !== 'ROAD_NETWORK_ORIGIN' && error.code !== 'ROAD_WORKER_UNAVAILABLE') stopWorker(worker, error);
      if (retry || !canRetry) throw error;
      return routeAttempt(request, origin, config, true);
    });
  }

  function routeFrom(origin, options) {
    if (!origin || !Number.isFinite(Number(origin.lat)) || !Number.isFinite(Number(origin.lon))) {
      return Promise.reject(roadError('invalid road origin', 'ROAD_INVALID_ORIGIN'));
    }
    var config;
    try {
      config = options ? normalizeConfig(options) : (activeConfig || normalizeConfig());
    } catch (error) {
      return Promise.reject(error);
    }
    var request = ++latestRouteRequest;
    return routeAttempt(request, { lat: Number(origin.lat), lon: Number(origin.lon) }, config, false);
  }

  function reset() {
    latestRouteRequest += 1;
    if (worker) stopWorker(worker, roadError('road worker reset', 'ROAD_WORKER_RESET'));
    else {
      readyPromise = null;
      activeConfig = null;
      activeGraph = null;
    }
  }

  function destroy() {
    latestRouteRequest += 1;
    if (worker) stopWorker(worker, roadError('road worker disposed', 'ROAD_WORKER_DISPOSED'), true);
    else {
      readyPromise = null;
      activeConfig = null;
      activeGraph = null;
    }
  }

  window.CordalRoadDistances = {
    init: init,
    routeFrom: routeFrom,
    formatMeters: formatMeters,
    reset: reset,
    destroy: destroy
  };
})();
