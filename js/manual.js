(function () {
  'use strict';

  var button = document.querySelector('[data-wifi-copy]');
  var password = document.querySelector('[data-wifi-password]');
  var label = document.querySelector('[data-wifi-copy-label]');
  var status = document.querySelector('[data-wifi-status]');
  var resetTimer = null;

  if (!button || !password || !label || !status) return;

  function translate(key, fallback) {
    if (window.GH_I18N && typeof window.GH_I18N.t === 'function') {
      return window.GH_I18N.t(key) || fallback;
    }
    return fallback;
  }

  function fallbackCopy(value) {
    var input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    var copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('copy failed');
  }

  async function copyPassword() {
    var value = password.textContent.trim();

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        fallbackCopy(value);
      }

      label.textContent = translate('wifi.copied', 'Copiada');
      status.textContent = translate('wifi.copy.success', 'Contraseña copiada.');
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(function () {
        label.textContent = translate('wifi.copy', 'Copiar');
        status.textContent = '';
      }, 8000);
    } catch (error) {
      status.textContent = translate('wifi.copy.error', 'No se pudo copiar. Mantén presionada la contraseña.');
    }
  }

  button.addEventListener('click', copyPassword);
})();
