(function(global) {
  'use strict';

  var ASSET_ROOT = 'assets/backgrounds/v1/';
  var ROTATION_MS = 25000;
  var FADE_MS = 1400;

  function scene(id, stem, profile, desktopPosition, mobilePosition) {
    return {
      id: id,
      stem: stem,
      profile: profile,
      desktopPosition: desktopPosition || 'center center',
      mobilePosition: mobilePosition || 'center center'
    };
  }

  var SCENES = {
    'home-nevados': scene('home-nevados', 'home-nevados', 'bright', 'center 38%', 'center 42%'),
    'home-paine': scene('home-paine', 'home-paine', 'balanced', 'center 42%', 'center 46%'),
    'home-osorno': scene('home-osorno', 'home-osorno', 'balanced', 'center 44%', 'center 48%'),
    'checkin-cajon': scene('checkin-cajon', 'checkin-cajon', 'balanced', 'center 46%', 'center 48%'),
    'checkout-cochamo': scene('checkout-cochamo', 'checkout-cochamo', 'moody', 'center 44%', 'center 46%'),
    'clima-castillo': scene('clima-castillo', 'clima-castillo', 'bright', 'center 42%', 'center 44%'),
    'tickets-portillo': scene('tickets-portillo', 'tickets-portillo', 'bright', 'center 48%', 'center 50%'),
    'buggy-nevados': scene('buggy-nevados', 'buggy-nevados', 'moody', 'center 52%', 'center 54%'),
    'manual-nuble': scene('manual-nuble', 'manual-nuble', 'moody', 'center 48%', 'center 50%'),
    'restaurantes-villarrica': scene('restaurantes-villarrica', 'restaurantes-villarrica', 'balanced', 'center 52%', 'center 54%'),
    'actividades-conguillio': scene('actividades-conguillio', 'actividades-conguillio', 'moody', 'center 48%', 'center 50%'),
    'nearby-antuco': scene('nearby-antuco', 'nearby-antuco', 'balanced', 'center 46%', 'center 48%')
  };

  var SECTION_SCENES = {
    home: ['home-nevados', 'home-paine', 'home-osorno'],
    checkin: ['checkin-cajon'],
    checkout: ['checkout-cochamo'],
    clima: ['clima-castillo'],
    tickets: ['tickets-portillo'],
    buggy: ['buggy-nevados'],
    manual: ['manual-nuble'],
    botiquin: ['manual-nuble'],
    restaurantes: ['restaurantes-villarrica'],
    actividades: ['actividades-conguillio'],
    nearby: ['nearby-antuco']
  };

  function resolveScenes(section) {
    return (SECTION_SCENES[section] || []).map(function(id) { return SCENES[id]; });
  }

  function shouldAnimate(preferences) {
    return !preferences.reduceMotion && !preferences.saveData;
  }

  var api = {
    ASSET_ROOT: ASSET_ROOT,
    ROTATION_MS: ROTATION_MS,
    SCENES: SCENES,
    SECTION_SCENES: SECTION_SCENES,
    resolveScenes: resolveScenes,
    shouldAnimate: shouldAnimate
  };
  global.CordalSurBackgrounds = api;

  if (!global.document) return;

  var document = global.document;
  var controller = null;

  function asset(sceneDefinition, viewport, extension) {
    return ASSET_ROOT + sceneDefinition.stem + '-' + viewport + '.' + extension;
  }

  function appendSource(picture, sceneDefinition, viewport, extension, media) {
    var source = document.createElement('source');
    source.media = media;
    if (extension !== 'jpg') source.type = 'image/' + extension;
    source.srcset = asset(sceneDefinition, viewport, extension);
    picture.appendChild(source);
  }

  function createLayer(sceneDefinition, priority) {
    var layer = document.createElement('div');
    var picture = document.createElement('picture');
    var image = document.createElement('img');

    layer.className = 'cs-background__layer';
    layer.dataset.scene = sceneDefinition.id;
    layer.setAttribute('aria-hidden', 'true');
    layer.style.setProperty('--cs-photo-position-desktop', sceneDefinition.desktopPosition);
    layer.style.setProperty('--cs-photo-position-mobile', sceneDefinition.mobilePosition);

    appendSource(picture, sceneDefinition, 'mobile', 'avif', '(max-width: 719px)');
    appendSource(picture, sceneDefinition, 'mobile', 'webp', '(max-width: 719px)');
    appendSource(picture, sceneDefinition, 'mobile', 'jpg', '(max-width: 719px)');
    appendSource(picture, sceneDefinition, 'desktop', 'avif', '(min-width: 720px)');
    appendSource(picture, sceneDefinition, 'desktop', 'webp', '(min-width: 720px)');

    image.src = asset(sceneDefinition, 'desktop', 'jpg');
    image.alt = '';
    image.decoding = 'async';
    image.loading = 'eager';
    image.fetchPriority = priority;
    picture.appendChild(image);
    layer.appendChild(picture);

    return { element: layer, image: image, scene: sceneDefinition };
  }

  function waitForImage(image) {
    if (image.complete) {
      if (!image.naturalWidth) return Promise.resolve(false);
      return image.decode ? image.decode().then(function() { return true; }, function() { return true; }) : Promise.resolve(true);
    }
    return new Promise(function(resolve) {
      var settled = false;
      var timeout = global.setTimeout(function() { finish(false); }, 12000);
      function finish(value) {
        if (settled) return;
        settled = true;
        global.clearTimeout(timeout);
        image.removeEventListener('load', onLoad);
        image.removeEventListener('error', onError);
        resolve(value);
      }
      function onLoad() {
        if (!image.decode) return finish(true);
        image.decode().then(function() { finish(true); }, function() { finish(true); });
      }
      function onError() { finish(false); }
      image.addEventListener('load', onLoad, { once: true });
      image.addEventListener('error', onError, { once: true });
    });
  }

  function createController(body, scenes) {
    var root = document.createElement('div');
    var active = null;
    var prepared = null;
    var currentIndex = 0;
    var timer = null;
    var destroyed = false;
    var reduceQuery = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var preferences = {
      reduceMotion: !!(reduceQuery && reduceQuery.matches),
      saveData: !!(global.navigator && global.navigator.connection && global.navigator.connection.saveData)
    };

    root.className = 'cs-page-background';
    root.setAttribute('aria-hidden', 'true');
    body.insertBefore(root, body.firstChild);
    body.classList.add('cs-has-background');

    function clearTimer() {
      if (!timer) return;
      global.clearTimeout(timer);
      timer = null;
    }

    function schedule() {
      clearTimer();
      if (destroyed || scenes.length < 2 || !shouldAnimate(preferences) || document.hidden) return;
      timer = global.setTimeout(advance, ROTATION_MS);
    }

    function prepareNext() {
      if (destroyed || scenes.length < 2 || !shouldAnimate(preferences) || prepared) return;
      var nextIndex = (currentIndex + 1) % scenes.length;
      prepared = createLayer(scenes[nextIndex], 'low');
      root.appendChild(prepared.element);
      prepared.ready = waitForImage(prepared.image);
    }

    function advance() {
      clearTimer();
      if (destroyed || document.hidden) return schedule();
      if (!prepared) prepareNext();
      if (!prepared) return;
      var candidate = prepared;
      candidate.ready.then(function(valid) {
        if (destroyed || candidate !== prepared) return;
        if (!valid) {
          candidate.element.remove();
          prepared = null;
          currentIndex = (currentIndex + 1) % scenes.length;
          prepareNext();
          schedule();
          return;
        }
        var previous = active;
        active = candidate;
        prepared = null;
        currentIndex = (currentIndex + 1) % scenes.length;
        root.dataset.profile = active.scene.profile;
        global.requestAnimationFrame(function() { active.element.classList.add('is-active'); });
        global.setTimeout(function() {
          if (previous && previous.element.isConnected) previous.element.remove();
          prepareNext();
        }, FADE_MS + 80);
        schedule();
      });
    }

    function onVisibility() {
      if (document.hidden) clearTimer();
      else schedule();
    }

    function onMotionChange(event) {
      preferences.reduceMotion = event.matches;
      if (event.matches) {
        clearTimer();
        if (prepared) prepared.element.remove();
        prepared = null;
      } else {
        prepareNext();
        schedule();
      }
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimer();
      document.removeEventListener('visibilitychange', onVisibility);
      if (reduceQuery) {
        if (reduceQuery.removeEventListener) reduceQuery.removeEventListener('change', onMotionChange);
        else if (reduceQuery.removeListener) reduceQuery.removeListener(onMotionChange);
      }
      root.remove();
      body.classList.remove('cs-has-background');
    }

    document.addEventListener('visibilitychange', onVisibility);
    if (reduceQuery) {
      if (reduceQuery.addEventListener) reduceQuery.addEventListener('change', onMotionChange);
      else if (reduceQuery.addListener) reduceQuery.addListener(onMotionChange);
    }

    active = createLayer(scenes[0], 'high');
    root.dataset.profile = active.scene.profile;
    root.appendChild(active.element);
    waitForImage(active.image).then(function(valid) {
      if (destroyed || !valid) return;
      global.requestAnimationFrame(function() { active.element.classList.add('is-active'); });
      prepareNext();
      schedule();
    });

    return { destroy: destroy };
  }

  function start() {
    if (controller || !document.documentElement.classList.contains('access-granted')) return;
    var body = document.body;
    var scenes = body ? resolveScenes(body.dataset.section) : [];
    if (body && scenes.length) controller = createController(body, scenes);
  }

  function stop() {
    if (!controller) return;
    controller.destroy();
    controller = null;
  }

  function boot() {
    start();
    global.addEventListener('cordal:access-granted', start);
    document.addEventListener('cordal:access-ended', stop);
    global.addEventListener('cordal:access-ended', stop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
