(function() {
  var body = document.body;
  if (!body || body.getAttribute('data-bg-rotator') !== 'winter-home') return;

  var images = [
    'css/bg/winter/home-01-nevados-panorama',
    'css/bg/winter/home-02-bosque-nevado-resort',
    'css/bg/winter/home-03-panorama-sol',
    'css/bg/winter/home-04-atardecer-nieve',
    'css/bg/winter/home-05-volcanes-nevados',
    'css/bg/winter/home-06-valle-nevado',
    'css/bg/winter/home-07-volcan-cerrado',
    'css/bg/winter/home-08-bosque-otono'
  ];
  var intervalMs = 10000;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var ext = supportsWebP() ? '.webp' : '.jpg';
  var currentIndex = 0;
  var activeLayer;
  var inactiveLayer;
  var timer = null;

  function supportsWebP() {
    var canvas;
    try {
      canvas = document.createElement('canvas');
      return !!(canvas.getContext && canvas.getContext('2d')) &&
        canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (e) {
      return false;
    }
  }

  function imageUrl(index) {
    return images[index] + ext;
  }

  function backgroundValue(index) {
    return 'url("' + imageUrl(index) + '")';
  }

  function preload(index) {
    var img = new Image();
    img.src = imageUrl(index);
  }

  function makeLayer(isActive) {
    var layer = document.createElement('div');
    layer.className = isActive ? 'bg-rotator__layer is-active' : 'bg-rotator__layer';
    layer.setAttribute('aria-hidden', 'true');
    return layer;
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function advance() {
    var nextIndex = (currentIndex + 1) % images.length;
    inactiveLayer.style.backgroundImage = backgroundValue(nextIndex);
    inactiveLayer.className = 'bg-rotator__layer is-active';
    activeLayer.className = 'bg-rotator__layer';

    var previousActive = activeLayer;
    activeLayer = inactiveLayer;
    inactiveLayer = previousActive;
    currentIndex = nextIndex;
    preload((currentIndex + 1) % images.length);
  }

  function start() {
    if (timer || (reduceMotion && reduceMotion.matches)) return;
    preload((currentIndex + 1) % images.length);
    timer = setInterval(advance, intervalMs);
  }

  activeLayer = makeLayer(true);
  inactiveLayer = makeLayer(false);
  activeLayer.style.backgroundImage = backgroundValue(0);
  inactiveLayer.style.backgroundImage = backgroundValue(1);

  body.insertBefore(inactiveLayer, body.firstChild);
  body.insertBefore(activeLayer, body.firstChild);
  if (body.classList) {
    body.classList.add('has-bg-rotator');
  } else {
    body.className += ' has-bg-rotator';
  }

  start();
  if (reduceMotion) {
    if (reduceMotion.addEventListener) {
      reduceMotion.addEventListener('change', function(event) {
        if (event.matches) stop();
        else start();
      });
    } else if (reduceMotion.addListener) {
      reduceMotion.addListener(function(event) {
        if (event.matches) stop();
        else start();
      });
    }
  }
})();
