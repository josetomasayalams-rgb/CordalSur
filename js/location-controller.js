(function (root, factory) {
  'use strict';

  var api = factory(root);
  root.CordalLocationController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var STATES = Object.freeze({
    IDLE: 'idle',
    REQUESTING: 'requesting',
    REFINING: 'refining',
    READY: 'ready',
    DEGRADED: 'degraded',
    DENIED: 'denied',
    TIMEOUT: 'timeout',
    UNAVAILABLE: 'unavailable',
    OUTSIDE_NETWORK: 'outside-network',
    ROUTING_ERROR: 'routing-error'
  });
  var ONCE_DEADLINE_MS = 20000;
  var REROUTE_INTERVAL_MS = 5000;
  var REROUTE_DISTANCE_METERS = 25;
  var REROUTE_ACCURACY_METERS = 20;

  function qualityForAccuracy(accuracy) {
    accuracy = Number(accuracy);
    if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 5000) return null;
    if (accuracy <= 100) return 'precise';
    if (accuracy <= 1000) return 'approximate';
    return 'coarse';
  }

  function radians(value) {
    return value * Math.PI / 180;
  }

  function distanceMeters(left, right) {
    if (!left || !right) return Number.POSITIVE_INFINITY;
    var leftLat = Number(left.lat);
    var leftLon = Number(left.lon);
    var rightLat = Number(right.lat);
    var rightLon = Number(right.lon);
    if (![leftLat, leftLon, rightLat, rightLon].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
    var dLat = radians(rightLat - leftLat);
    var dLon = radians(rightLon - leftLon);
    var lat1 = radians(leftLat);
    var lat2 = radians(rightLat);
    var h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function cloneSnapshot(snapshot) {
    return snapshot ? {
      source: snapshot.source,
      lat: snapshot.lat,
      lon: snapshot.lon,
      accuracy: snapshot.accuracy,
      timestamp: snapshot.timestamp,
      quality: snapshot.quality
    } : null;
  }

  function normalizePoint(point, source, now) {
    var coordinates = point && point.coords ? point.coords : point || {};
    var lat = Number(coordinates.latitude == null ? coordinates.lat : coordinates.latitude);
    var lon = Number(coordinates.longitude == null ? coordinates.lon : coordinates.longitude);
    var fallbackAccuracy = source === 'manual' ? 0 : NaN;
    var accuracy = Number(coordinates.accuracy == null ? fallbackAccuracy : coordinates.accuracy);
    var timestamp = Number(point && point.timestamp);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) return null;
    if (!Number.isFinite(accuracy) || accuracy < 0) return null;
    return {
      source: source,
      lat: lat,
      lon: lon,
      accuracy: accuracy,
      timestamp: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : now(),
      quality: qualityForAccuracy(accuracy)
    };
  }

  function normalizeError(error, fallbackReason) {
    var code = Number(error && error.code);
    return {
      code: Number.isFinite(code) ? code : 0,
      reason: fallbackReason || (code === 1 ? 'permission-denied' : (code === 3 ? 'position-timeout' : 'position-unavailable'))
    };
  }

  function create(options) {
    options = options || {};
    var environment = options.navigator || root.navigator || {};
    var geolocation = environment.geolocation;
    var permissions = environment.permissions;
    var now = typeof options.now === 'function' ? options.now : Date.now;
    var schedule = typeof options.setTimeout === 'function' ? options.setTimeout : root.setTimeout.bind(root);
    var cancel = typeof options.clearTimeout === 'function' ? options.clearTimeout : root.clearTimeout.bind(root);
    var secureContext = options.secureContext == null ? root.isSecureContext !== false : Boolean(options.secureContext);
    var listeners = [];
    var state = STATES.IDLE;
    var mode = null;
    var lastRequestedMode = 'once';
    var permission = permissions && typeof permissions.query === 'function' ? 'unknown' : 'unsupported';
    var snapshot = null;
    var bestCandidate = null;
    var watchId = null;
    var onceTimer = null;
    var rerouteTimer = null;
    var permissionStatus = null;
    var permissionChangeHandler = null;
    var generation = 0;
    var active = false;
    var destroyed = false;
    var lastError = null;
    var hasFixThisRun = false;
    var lastRerouteSnapshot = null;
    var lastRerouteAt = 0;

    function emit(event) {
      listeners.slice().forEach(function (listener) {
        try { listener(event); } catch (_) { /* A UI listener cannot interrupt GPS cleanup. */ }
      });
    }

    if (typeof options.onEvent === 'function') listeners.push(options.onEvent);

    function stateEvent(previousState) {
      emit({
        type: 'state',
        state: state,
        previousState: previousState,
        mode: mode,
        permission: permission,
        snapshot: cloneSnapshot(snapshot),
        error: lastError ? { code: lastError.code, reason: lastError.reason } : null
      });
    }

    function setState(nextState, error) {
      var previousState = state;
      var previousReason = lastError && lastError.reason;
      state = nextState;
      lastError = error || null;
      if (state !== previousState || previousReason !== (lastError && lastError.reason)) stateEvent(previousState);
    }

    function emitPermission() {
      emit({ type: 'permission', permission: permission });
    }

    function emitSnapshot(nextSnapshot, details) {
      details = details || {};
      emit({
        type: 'snapshot',
        snapshot: cloneSnapshot(nextSnapshot),
        mode: mode,
        initial: Boolean(details.initial),
        final: Boolean(details.final),
        replayed: Boolean(details.replayed),
        shouldReroute: Boolean(details.shouldReroute)
      });
    }

    function clearPermissionObserver() {
      if (permissionStatus && permissionChangeHandler) {
        if (typeof permissionStatus.removeEventListener === 'function') permissionStatus.removeEventListener('change', permissionChangeHandler);
        else if (permissionStatus.onchange === permissionChangeHandler) permissionStatus.onchange = null;
      }
      permissionStatus = null;
      permissionChangeHandler = null;
    }

    function clearTracking() {
      active = false;
      if (watchId !== null && geolocation && typeof geolocation.clearWatch === 'function') geolocation.clearWatch(watchId);
      watchId = null;
      if (onceTimer !== null) cancel(onceTimer);
      onceTimer = null;
      if (rerouteTimer !== null) cancel(rerouteTimer);
      rerouteTimer = null;
      clearPermissionObserver();
    }

    function clearPrivateSnapshot() {
      snapshot = null;
      bestCandidate = null;
      hasFixThisRun = false;
      lastRerouteSnapshot = null;
      lastRerouteAt = 0;
    }

    function terminate(nextState, error, clearCoordinates) {
      generation += 1;
      clearTracking();
      if (clearCoordinates) clearPrivateSnapshot();
      setState(nextState, error);
    }

    function needsReroute(point) {
      if (!lastRerouteSnapshot) return true;
      return distanceMeters(lastRerouteSnapshot, point) >= REROUTE_DISTANCE_METERS ||
        lastRerouteSnapshot.accuracy - point.accuracy >= REROUTE_ACCURACY_METERS;
    }

    function markReroute(point) {
      lastRerouteSnapshot = cloneSnapshot(point);
      lastRerouteAt = now();
    }

    // Session reroutes use a trailing timer so a useful fix received during the
    // five-second cooldown is not lost when the device becomes stationary.
    function scheduleTrailingReroute(token) {
      if (mode !== 'session' || rerouteTimer !== null || !snapshot || !needsReroute(snapshot)) return;
      var wait = Math.max(0, REROUTE_INTERVAL_MS - (now() - lastRerouteAt));
      rerouteTimer = schedule(function () {
        rerouteTimer = null;
        if (!active || token !== generation || mode !== 'session' || !snapshot || !needsReroute(snapshot)) return;
        markReroute(snapshot);
        emitSnapshot(snapshot, { shouldReroute: true, replayed: true });
      }, wait);
    }

    function sessionReroute(point, token) {
      if (!lastRerouteSnapshot) {
        markReroute(point);
        return true;
      }
      if (!needsReroute(point)) return false;
      if (now() - lastRerouteAt >= REROUTE_INTERVAL_MS) {
        if (rerouteTimer !== null) cancel(rerouteTimer);
        rerouteTimer = null;
        markReroute(point);
        return true;
      }
      scheduleTrailingReroute(token);
      return false;
    }

    function finishOnce(nextState, error) {
      clearTracking();
      setState(nextState, error);
    }

    function acceptOnce(point) {
      if (!point.quality) {
        setState(STATES.REFINING, normalizeError(null, 'low-accuracy'));
        return;
      }
      if (bestCandidate && point.accuracy >= bestCandidate.accuracy) return;
      bestCandidate = point;
      snapshot = point;
      var initial = !hasFixThisRun;
      hasFixThisRun = true;
      var shouldReroute = initial || now() - lastRerouteAt >= REROUTE_INTERVAL_MS;
      if (shouldReroute) markReroute(point);
      emitSnapshot(point, { initial: initial, shouldReroute: shouldReroute });
      if (point.quality === 'precise') {
        finishOnce(STATES.READY, null);
      } else {
        setState(STATES.REFINING, null);
      }
    }

    function acceptSession(point, token) {
      if (!point.quality) {
        setState(STATES.REFINING, normalizeError(null, 'low-accuracy'));
        return;
      }
      if (snapshot && point.timestamp <= snapshot.timestamp) return;
      var initial = !hasFixThisRun;
      hasFixThisRun = true;
      snapshot = point;
      var shouldReroute = sessionReroute(point, token);
      emitSnapshot(point, { initial: initial, shouldReroute: shouldReroute });
      setState(point.quality === 'precise' ? STATES.READY : STATES.DEGRADED, null);
    }

    function onceDeadline(token) {
      if (!active || token !== generation || mode !== 'once') return;
      if (bestCandidate) {
        emitSnapshot(bestCandidate, { final: true, shouldReroute: false });
        finishOnce(bestCandidate.quality === 'precise' ? STATES.READY : STATES.DEGRADED, null);
        return;
      }
      if (snapshot) {
        finishOnce(STATES.DEGRADED, normalizeError(null, 'position-timeout'));
        return;
      }
      finishOnce(STATES.TIMEOUT, normalizeError({ code: 3 }, 'position-timeout'));
    }

    function permissionDenied() {
      terminate(STATES.DENIED, normalizeError({ code: 1 }, 'permission-denied'), true);
    }

    function observePermission(token) {
      if (!permissions || typeof permissions.query !== 'function') return;
      Promise.resolve().then(function () {
        return permissions.query({ name: 'geolocation' });
      }).then(function (status) {
        if (!active || token !== generation || !status) return;
        permissionStatus = status;
        permission = status.state || 'unknown';
        emitPermission();
        if (permission === 'denied') {
          permissionDenied();
          return;
        }
        permissionChangeHandler = function () {
          if (!active || token !== generation) return;
          permission = status.state || 'unknown';
          emitPermission();
          if (permission === 'denied') permissionDenied();
        };
        if (typeof status.addEventListener === 'function') status.addEventListener('change', permissionChangeHandler);
        else status.onchange = permissionChangeHandler;
      }).catch(function () {
        if (!active || token !== generation) return;
        permission = 'unsupported';
        emitPermission();
      });
    }

    function positionError(error, token) {
      if (!active || token !== generation) return;
      var normalized = normalizeError(error);
      if (normalized.code === 1) {
        permission = 'denied';
        emitPermission();
        permissionDenied();
        return;
      }
      if (mode === 'session') {
        setState(snapshot ? STATES.DEGRADED : (normalized.code === 3 ? STATES.TIMEOUT : STATES.UNAVAILABLE), normalized);
        return;
      }
      // Browsers may report a temporary timeout or unavailable reading while a
      // high-accuracy watch is still refining. Keep watching until our own
      // 20-second deadline so a later, better fix can still win.
      setState(bestCandidate || snapshot ? STATES.DEGRADED : STATES.REFINING, normalized);
    }

    function start(nextMode) {
      if (destroyed) return false;
      if (nextMode !== 'once' && nextMode !== 'session') throw new TypeError('Location mode must be "once" or "session".');
      generation += 1;
      clearTracking();
      mode = nextMode;
      lastRequestedMode = nextMode;
      bestCandidate = null;
      hasFixThisRun = false;
      lastRerouteSnapshot = null;
      lastRerouteAt = 0;
      lastError = null;
      if (!secureContext) {
        setState(STATES.UNAVAILABLE, normalizeError(null, 'insecure-context'));
        return false;
      }
      if (!geolocation || typeof geolocation.watchPosition !== 'function') {
        setState(STATES.UNAVAILABLE, normalizeError(null, 'geolocation-unsupported'));
        return false;
      }

      active = true;
      var token = generation;
      setState(STATES.REQUESTING, null);
      observePermission(token);
      if (nextMode === 'once') onceTimer = schedule(function () { onceDeadline(token); }, ONCE_DEADLINE_MS);

      var returnedWatchId;
      try {
        returnedWatchId = geolocation.watchPosition(function (position) {
          if (!active || token !== generation) return;
          var point = normalizePoint(position, 'gps', now);
          if (!point) {
            setState(snapshot ? STATES.DEGRADED : STATES.UNAVAILABLE, normalizeError(null, 'invalid-position'));
            return;
          }
          if (nextMode === 'once') acceptOnce(point);
          else acceptSession(point, token);
        }, function (error) {
          positionError(error, token);
        }, {
          enableHighAccuracy: true,
          maximumAge: nextMode === 'session' ? 5000 : 0,
          timeout: ONCE_DEADLINE_MS
        });
      } catch (error) {
        active = false;
        if (onceTimer !== null) cancel(onceTimer);
        onceTimer = null;
        setState(STATES.UNAVAILABLE, normalizeError(error, 'geolocation-start-failed'));
        return false;
      }
      if (active && token === generation) watchId = returnedWatchId;
      else if (returnedWatchId != null && typeof geolocation.clearWatch === 'function') geolocation.clearWatch(returnedWatchId);
      return true;
    }

    function setManual(point) {
      if (destroyed) return false;
      var manual = normalizePoint(point, 'manual', now);
      if (!manual || !manual.quality) return false;
      generation += 1;
      clearTracking();
      clearPrivateSnapshot();
      mode = 'manual';
      snapshot = manual;
      hasFixThisRun = true;
      markReroute(manual);
      emitSnapshot(manual, { initial: true, final: true, shouldReroute: true });
      setState(STATES.READY, null);
      return true;
    }

    function stop() {
      if (destroyed) return;
      generation += 1;
      clearTracking();
      clearPrivateSnapshot();
      mode = null;
      setState(STATES.IDLE, null);
    }

    function retry() {
      return start(lastRequestedMode);
    }

    function subscribe(listener) {
      if (typeof listener !== 'function' || destroyed) return function () {};
      listeners.push(listener);
      return function () {
        var index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    }

    function destroy() {
      if (destroyed) return;
      stop();
      destroyed = true;
      if (root && typeof root.removeEventListener === 'function') root.removeEventListener('pagehide', stop);
      listeners.length = 0;
    }

    if (root && typeof root.addEventListener === 'function') root.addEventListener('pagehide', stop);

    return {
      start: start,
      setManual: setManual,
      stop: stop,
      retry: retry,
      destroy: destroy,
      subscribe: subscribe,
      getState: function () { return state; },
      getSnapshot: function () { return cloneSnapshot(snapshot); },
      getPermission: function () { return permission; },
      getMode: function () { return mode; }
    };
  }

  return {
    STATES: STATES,
    create: create,
    distanceMeters: distanceMeters,
    qualityForAccuracy: qualityForAccuracy
  };
}));
