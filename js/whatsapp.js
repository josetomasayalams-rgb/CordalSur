// Localized WhatsApp links for CordalSur. Requires js/lang.js when present.
(function () {
  'use strict';

  var PHONE = '56990137732';
  var DEFAULT_MESSAGE = 'Hola, soy huésped de CordalSur. Necesito ayuda con mi check-in.';

  function updateLinks(lang) {
    var i18n = window.GH_I18N;
    var links = document.querySelectorAll('[data-whatsapp-link]');

    for (var i = 0; i < links.length; i++) {
      var key = links[i].getAttribute('data-whatsapp-message-key') || 'whatsapp.checkin.message';
      var message = i18n && typeof i18n.t === 'function' ? i18n.t(key, lang) : DEFAULT_MESSAGE;
      if (!message || message === key) message = DEFAULT_MESSAGE;
      links[i].href = 'https://wa.me/' + PHONE + '?text=' + encodeURIComponent(message);
    }
  }

  var i18n = window.GH_I18N;
  if (i18n && typeof i18n.subscribe === 'function') {
    i18n.subscribe(updateLinks);
    updateLinks(i18n.getLang());
  } else {
    updateLinks('es');
  }
})();
