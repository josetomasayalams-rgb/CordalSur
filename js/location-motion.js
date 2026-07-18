(function (root) {
  'use strict';

  function radians(value) { return value * Math.PI / 180; }

  function distanceMeters(left, right) {
    var dLat = radians(right.lat - left.lat);
    var dLon = radians(right.lon - left.lon);
    var lat1 = radians(left.lat);
    var lat2 = radians(right.lat);
    var h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function bearing(left, right) {
    var lat1 = radians(left.lat);
    var lat2 = radians(right.lat);
    var dLon = radians(right.lon - left.lon);
    var y = Math.sin(dLon) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function angleDifference(left, right) {
    return Math.abs(((left - right + 540) % 360) - 180);
  }

  function smoothAngle(previous, next, weight) {
    if (!Number.isFinite(previous)) return next;
    var from = radians(previous);
    var to = radians(next);
    var x = (1 - weight) * Math.cos(from) + weight * Math.cos(to);
    var y = (1 - weight) * Math.sin(from) + weight * Math.sin(to);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function createTracker(options) {
    options = options || {};
    var maximumAccuracy = Number(options.maximumAccuracy) || 150;
    var last = null;
    var heading = NaN;
    var headingSource = null;

    function reset() {
      last = null;
      heading = NaN;
      headingSource = null;
    }

    function accept(position) {
      var coordinates = position && position.coords || {};
      var point = {
        lat: Number(coordinates.latitude),
        lon: Number(coordinates.longitude),
        accuracy: Number(coordinates.accuracy),
        speed: coordinates.speed == null ? NaN : Number(coordinates.speed),
        timestamp: Number(position && position.timestamp) || Date.now()
      };
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return { accepted: false, reason: 'invalid', point: last };
      if (!Number.isFinite(point.accuracy) || point.accuracy > maximumAccuracy) return { accepted: false, reason: 'low_accuracy', point: last };
      if (last && point.timestamp <= last.timestamp) return { accepted: false, reason: 'stale', point: last };

      var moved = last ? distanceMeters(last, point) : Infinity;
      var elapsed = last ? (point.timestamp - last.timestamp) / 1000 : Infinity;
      var improvesAccuracy = last && point.accuracy + 10 < last.accuracy;
      var noiseRadius = last ? Math.max(8, Math.min(35, (last.accuracy + point.accuracy) * 0.35)) : 0;
      if (last && moved < noiseRadius && elapsed < 15 && !improvesAccuracy) {
        return { accepted: false, reason: 'noise', point: last, movedMeters: moved, heading: heading, headingReliable: Number.isFinite(heading) };
      }

      var deviceHeading = coordinates.heading == null ? NaN : Number(coordinates.heading);
      var movingSpeed = Number.isFinite(point.speed) ? point.speed : (last && Number.isFinite(elapsed) && elapsed > 0 ? moved / elapsed : 0);
      var nextHeading = NaN;
      if (Number.isFinite(deviceHeading) && deviceHeading >= 0 && movingSpeed >= 1.2) {
        nextHeading = deviceHeading % 360;
        headingSource = 'device';
      } else if (last && elapsed <= 45 && moved >= Math.max(10, Math.min(35, point.accuracy * 0.5))) {
        nextHeading = bearing(last, point);
        headingSource = 'derived';
      }
      if (Number.isFinite(nextHeading)) heading = smoothAngle(heading, nextHeading, headingSource === 'device' ? 0.55 : 0.4);

      last = point;
      return {
        accepted: true,
        point: point,
        movedMeters: moved,
        heading: heading,
        headingReliable: Number.isFinite(heading),
        headingSource: headingSource
      };
    }

    return { accept: accept, reset: reset, current: function () { return last; } };
  }

  var api = { createTracker: createTracker, distanceMeters: distanceMeters, bearing: bearing, angleDifference: angleDifference };
  root.CordalLocationMotion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
