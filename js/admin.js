(function () {
  'use strict';

  var script = document.currentScript;
  var TOKEN_KEY = 'cordal-sur-admin-token-v1';
  var LANG_KEY = 'gh-lang';
  var SUPPORTED = ['es', 'pt', 'en'];
  var app = document.getElementById('admin-app');
  var mode = 'checking';
  var stays = [];
  var editingId = null;
  var busy = false;
  var notice = null;
  var expiresAt = '';
  var expiryTimer = null;
  var focusAfterRender = '';
  var formDraft = null;

  function getLang() {
    if (window.GH_I18N && typeof window.GH_I18N.getLang === 'function') return window.GH_I18N.getLang();
    var saved = '';
    try { saved = localStorage.getItem(LANG_KEY) || ''; } catch (error) {}
    return SUPPORTED.indexOf(saved) >= 0 ? saved : 'es';
  }

  function t(key) {
    var lang = getLang();
    if (window.GH_I18N && typeof window.GH_I18N.t === 'function') {
      var translated = window.GH_I18N.t(key, lang);
      if (translated && translated !== key) return translated;
    }
    return key;
  }

  function setLang(lang) {
    if (SUPPORTED.indexOf(lang) < 0) return;
    if (window.GH_I18N && typeof window.GH_I18N.setLang === 'function') window.GH_I18N.setLang(lang);
    else {
      try { localStorage.setItem(LANG_KEY, lang); } catch (error) {}
      document.documentElement.lang = lang;
    }
    renderLanguageControls();
    render();
  }

  function renderLanguageControls() {
    var buttons = document.querySelectorAll('[data-admin-lang]');
    for (var index = 0; index < buttons.length; index += 1) {
      buttons[index].setAttribute('aria-pressed', buttons[index].getAttribute('data-admin-lang') === getLang() ? 'true' : 'false');
    }
    var group = document.querySelector('.cs-language');
    if (group) group.setAttribute('aria-label', t('admin.language'));
    var back = document.querySelector('[data-i18n="admin.back"]');
    if (back) back.textContent = t('admin.back');
    document.title = t('admin.page.title');
  }

  function apiBase() {
    var meta = document.querySelector('meta[name="cordal-api-base"]');
    var configured = window.CORDAL_SUR_ACCESS_API ||
      (script && script.getAttribute('data-api-base')) ||
      (meta && meta.getAttribute('content')) || '';
    configured = String(configured).trim().replace(/\/+$/, '');
    if (!configured && /^(127\.0\.0\.1|localhost)$/.test(location.hostname)) configured = 'http://127.0.0.1:8787';
    return /^https?:\/\//.test(configured) ? configured : '';
  }

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (error) { return ''; }
  }

  function saveToken(value) {
    try { sessionStorage.setItem(TOKEN_KEY, value); } catch (error) {}
  }

  function clearToken() {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (error) {}
  }

  async function api(path, options) {
    var base = apiBase();
    if (!base) {
      var configError = new Error('config');
      configError.code = 'server_not_configured';
      throw configError;
    }
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 10000);
    var requestOptions = Object.assign({}, options || {}, { signal: controller.signal });
    requestOptions.headers = Object.assign({ Accept: 'application/json' }, requestOptions.headers || {});
    if (token()) requestOptions.headers.Authorization = 'Bearer ' + token();
    try {
      var response = await fetch(base + path, requestOptions);
      var data = {};
      if (response.status !== 204) {
        try { data = await response.json(); } catch (error) {}
      }
      if (!response.ok) {
        var apiError = new Error((data.error && data.error.message) || 'request_failed');
        apiError.code = data.error && data.error.code;
        apiError.status = response.status;
        throw apiError;
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function alertHtml() {
    if (!notice) return '';
    return '<p class="cs-alert' + (notice.type === 'success' ? ' cs-alert--success' : '') + '" role="alert">' +
      escapeHtml(t(notice.key)) + '</p>';
  }

  function formatPin(input) {
    var digits = input.value.replace(/\D/g, '').slice(0, 4);
    input.value = digits.length > 2 ? digits.slice(0, 2) + '-' + digits.slice(2) : digits;
  }

  function displayDate(utc) {
    try {
      return new Intl.DateTimeFormat(getLang() === 'pt' ? 'pt-BR' : getLang() === 'en' ? 'en-US' : 'es-CL', {
        timeZone: 'America/Santiago', dateStyle: 'medium', timeStyle: 'short'
      }).format(new Date(utc));
    } catch (error) { return utc; }
  }

  function errorKey(error) {
    if (error && error.code === 'invalid_credentials') return 'admin.invalid';
    if (error && error.code === 'rate_limited') return 'admin.rateLimited';
    if (error && (error.code === 'session_expired' || error.code === 'session_revoked' || error.code === 'missing_token')) return 'admin.sessionExpired';
    if (error && error.code === 'stay_overlap') return 'admin.error.overlap';
    if (error && error.code === 'ambiguous_local_time') return 'admin.error.ambiguousTime';
    if (error && error.code === 'nonexistent_local_time') return 'admin.error.nonexistentTime';
    if (error && ['invalid_local_time', 'invalid_pin_format', 'validation_error', 'stay_not_active'].indexOf(error.code) >= 0) return 'admin.error.validation';
    if (error && error.code === 'server_not_configured') return 'admin.error.config';
    if (error && (error.name === 'AbortError' || !error.status)) return 'admin.networkError';
    return 'admin.error.generic';
  }

  function loginView() {
    return '<section class="cs-panel cs-login-panel" aria-labelledby="admin-title"><h1 id="admin-title">' + t('admin.login.title') + '</h1>' +
      '<p class="cs-lead">' + t('admin.login.subtitle') + '</p>' + alertHtml() +
      '<form id="admin-login-form" novalidate><div class="cs-field"><label for="admin-pin">' + t('admin.pin.label') + '</label>' +
      '<div class="cs-pin-wrap"><input id="admin-pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="5" pattern="[0-9]{2}-[0-9]{2}" placeholder="' + t('admin.pin.placeholder') + '" required>' +
      '<button class="cs-reveal" type="button" data-reveal="admin-pin" aria-label="' + t('admin.revealPin') + '" title="' + t('admin.revealPin') + '"><span aria-hidden="true">◉</span></button></div></div>' +
      '<button class="cs-button cs-button--full" type="submit"' + (busy ? ' disabled' : '') + '>' + (busy ? t('admin.loading') : t('admin.login.submit')) + '</button></form></section>';
  }

  function statusLabel(status) {
    return t('admin.status.' + status);
  }

  function stayCard(stay) {
    var title = stay.label || (displayDate(stay.startUtc) + ' — ' + displayDate(stay.endUtc));
    var toggle = stay.enabled ? 'disable' : 'enable';
    var disabled = busy ? ' disabled' : '';
    var actions = '<button class="cs-button cs-button--secondary cs-button--small" type="button" data-action="edit" data-id="' + stay.id + '" aria-label="' + escapeHtml(t('admin.edit') + ': ' + title) + '"' + disabled + '>' + t('admin.edit') + '</button>';
    if (stay.status !== 'ended') {
      actions += '<button class="cs-button cs-button--secondary cs-button--small" type="button" data-action="toggle" data-id="' + stay.id + '" data-enabled="' + (!stay.enabled) + '" aria-label="' + escapeHtml(t('admin.' + toggle) + ': ' + title) + '"' + disabled + '>' + t('admin.' + toggle) + '</button>';
    }
    if (stay.status === 'active') actions += '<button class="cs-button cs-button--danger cs-button--small" type="button" data-action="finish" data-id="' + stay.id + '" aria-label="' + escapeHtml(t('admin.finish') + ': ' + title) + '"' + disabled + '>' + t('admin.finish') + '</button>';
    actions += '<button class="cs-button cs-button--danger cs-button--small" type="button" data-action="delete" data-id="' + stay.id + '" aria-label="' + escapeHtml(t('admin.delete') + ': ' + title) + '"' + disabled + '>' + t('admin.delete') + '</button>';
    return '<article class="cs-stay-card"><div><span class="cs-status cs-status--' + stay.status + '">' + statusLabel(stay.status) + '</span>' +
      '<h3>' + escapeHtml(title) + '</h3><div class="cs-stay-meta"><span><strong>' + t('admin.start') + ':</strong> ' + escapeHtml(displayDate(stay.startUtc)) + '</span><span><strong>' + t('admin.end') + ':</strong> ' + escapeHtml(displayDate(stay.endUtc)) + '</span></div></div>' +
      '<div class="cs-card-actions">' + actions + '</div></article>';
  }

  function editStay() {
    return stays.find(function (stay) { return stay.id === editingId; }) || null;
  }

  function formView() {
    if (editingId === null) return '';
    var stay = editStay();
    var isEditing = Boolean(stay);
    var values = formDraft || stay || {};
    return '<section class="cs-form-panel" aria-labelledby="stay-form-title"><h2 id="stay-form-title">' + t(isEditing ? 'admin.edit' : 'admin.newStay') + '</h2>' +
      '<p class="cs-hint">' + t('admin.timezone') + '</p><form id="stay-form" novalidate><div class="cs-form-grid">' +
      '<div class="cs-field cs-field--wide"><label for="stay-label">' + t('admin.label') + '</label><input id="stay-label" maxlength="80" placeholder="' + t('admin.label.placeholder') + '" value="' + escapeHtml(values.label || '') + '"></div>' +
      '<div class="cs-field"><label for="stay-start">' + t('admin.start') + '</label><input id="stay-start" type="datetime-local" value="' + escapeHtml(values.startLocal || '') + '" required></div>' +
      '<div class="cs-field"><label for="stay-end">' + t('admin.end') + '</label><input id="stay-end" type="datetime-local" value="' + escapeHtml(values.endLocal || '') + '" required></div>' +
      '<div class="cs-field cs-field--wide"><label for="stay-pin">' + t('admin.guestPin') + '</label><div class="cs-pin-wrap"><input id="stay-pin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="5" pattern="[0-9]{2}-[0-9]{2}" placeholder="' + t('admin.guestPin.placeholder') + '" value="' + escapeHtml(values.guestPin || '') + '">' +
      '<button class="cs-reveal" type="button" data-reveal="stay-pin" aria-label="' + t('admin.revealPin') + '" title="' + t('admin.revealPin') + '"><span aria-hidden="true">◉</span></button></div>' +
      '<span class="cs-hint">' + t('admin.guestPin.hint') + '</span></div></div>' +
      '<label class="cs-checkbox"><input id="stay-enabled" type="checkbox"' + (values.enabled !== false ? ' checked' : '') + '><span>' + t('admin.enabled') + '</span></label>' +
      '<div class="cs-form-actions"><button class="cs-button" type="submit"' + (busy ? ' disabled' : '') + '>' + (busy ? t('admin.loading') : t('admin.save')) + '</button>' +
      '<button class="cs-button cs-button--secondary" type="button" data-action="cancel"' + (busy ? ' disabled' : '') + '>' + t('admin.cancel') + '</button></div></form></section>';
  }

  function dashboardView() {
    var list = stays.length ? '<div class="cs-stay-list">' + stays.map(stayCard).join('') + '</div>' : '<p class="cs-empty">' + t('admin.empty') + '</p>';
    var expiration = expiresAt ? '<p class="cs-hint">' + t('admin.expires') + ': ' + escapeHtml(displayDate(expiresAt)) + '</p>' : '';
    return '<section class="cs-panel"><div class="cs-dashboard-head"><div><h1>' + t('admin.dashboard.title') + '</h1><p class="cs-lead">' + t('admin.dashboard.subtitle') + '</p>' + expiration + '</div>' +
      '<div class="cs-admin-actions"><a class="cs-button" href="index.html">' + t('admin.enterSite') + '</a><button class="cs-button cs-button--secondary" type="button" data-action="new"' + (busy ? ' disabled' : '') + '>' + t('admin.newStay') + '</button><button class="cs-text-button" type="button" data-action="logout"' + (busy ? ' disabled' : '') + '>' + t('admin.logout') + '</button></div></div>' +
      alertHtml() + list + formView() + '</section>';
  }

  function render() {
    if (!app) return;
    if (mode === 'checking') {
      app.innerHTML = '<section class="cs-panel cs-login-panel"><div class="cs-spinner" aria-hidden="true"></div><h1>' + t('admin.loading') + '</h1></section>';
    } else if (mode === 'login') app.innerHTML = loginView();
    else app.innerHTML = dashboardView();
    bind();
    var focusSelector = focusAfterRender || (mode === 'login' && !busy ? '#admin-pin' : notice ? '[role="alert"]' : '');
    focusAfterRender = '';
    if (focusSelector) setTimeout(function () {
      var target = app.querySelector(focusSelector);
      if (target) { if (!/^(INPUT|BUTTON|A)$/.test(target.tagName)) target.setAttribute('tabindex', '-1'); target.focus(); }
    }, 0);
  }

  function bindReveal(button) {
    var input = document.getElementById(button.getAttribute('data-reveal'));
    if (!input) return;
    input.addEventListener('input', function () { formatPin(input); });
    button.addEventListener('click', function () {
      var showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      button.setAttribute('aria-label', t(showing ? 'admin.revealPin' : 'admin.hidePin'));
      button.setAttribute('title', t(showing ? 'admin.revealPin' : 'admin.hidePin'));
      input.focus();
    });
  }

  function bind() {
    var loginForm = document.getElementById('admin-login-form');
    if (loginForm) loginForm.addEventListener('submit', login);
    var stayForm = document.getElementById('stay-form');
    if (stayForm) stayForm.addEventListener('submit', saveStay);
    var revealButtons = document.querySelectorAll('[data-reveal]');
    for (var index = 0; index < revealButtons.length; index += 1) bindReveal(revealButtons[index]);
    var actionButtons = app.querySelectorAll('[data-action]');
    for (var actionIndex = 0; actionIndex < actionButtons.length; actionIndex += 1) {
      actionButtons[actionIndex].addEventListener('click', handleAction);
    }
  }

  async function login(event) {
    event.preventDefault();
    if (busy) return;
    var input = document.getElementById('admin-pin');
    var value = input.value;
    if (!/^\d{2}-\d{2}$/.test(value)) {
      notice = { type: 'error', key: 'admin.error.validation' };
      focusAfterRender = '#admin-pin';
      render();
      return;
    }
    busy = true;
    notice = null;
    render();
    try {
      var result = await api('/v1/auth/admin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: value })
      });
      saveToken(result.token);
      expiresAt = result.expiresAt;
      scheduleExpiry(expiresAt);
      mode = 'dashboard';
      await loadStays();
    } catch (error) {
      clearToken();
      mode = 'login';
      notice = { type: 'error', key: errorKey(error) };
    } finally {
      busy = false;
      render();
    }
  }

  async function loadStays() {
    var result = await api('/v1/admin/stays');
    stays = result.stays || [];
  }

  async function saveStay(event) {
    event.preventDefault();
    if (busy) return;
    var stay = editStay();
    var payload = {
      label: document.getElementById('stay-label').value,
      startLocal: document.getElementById('stay-start').value,
      endLocal: document.getElementById('stay-end').value,
      enabled: document.getElementById('stay-enabled').checked
    };
    var guestPin = document.getElementById('stay-pin').value;
    formDraft = Object.assign({}, payload, { guestPin: guestPin });
    if (!payload.startLocal || !payload.endLocal || (guestPin && !/^\d{2}-\d{2}$/.test(guestPin))) {
      notice = { type: 'error', key: 'admin.error.validation' };
      focusAfterRender = '#stay-form';
      render();
      return;
    }
    if (guestPin) payload.guestPin = guestPin;
    busy = true;
    notice = null;
    render();
    try {
      await api('/v1/admin/stays' + (stay ? '/' + stay.id : ''), {
        method: stay ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      notice = { type: 'success', key: stay ? 'admin.success.updated' : 'admin.success.created' };
      editingId = null;
      formDraft = null;
      await loadStays();
    } catch (error) {
      handleSessionError(error);
      notice = { type: 'error', key: errorKey(error) };
    } finally {
      busy = false;
      render();
    }
  }

  function handleSessionError(error) {
    if (error && error.status === 401) {
      clearToken();
      mode = 'login';
      editingId = null;
    }
  }

  async function mutate(id, method, payload, successKey) {
    if (busy) return;
    busy = true;
    notice = null;
    render();
    try {
      await api('/v1/admin/stays/' + id, {
        method: method,
        headers: payload ? { 'Content-Type': 'application/json' } : {},
        body: payload ? JSON.stringify(payload) : undefined
      });
      notice = { type: 'success', key: successKey };
      editingId = null;
      await loadStays();
    } catch (error) {
      handleSessionError(error);
      notice = { type: 'error', key: errorKey(error) };
    } finally {
      busy = false;
      render();
    }
  }

  function handleAction(event) {
    if (busy) return;
    var button = event.currentTarget;
    var action = button.getAttribute('data-action');
    var id = button.getAttribute('data-id');
    if (action === 'new') { editingId = ''; formDraft = null; notice = null; render(); focusForm(); }
    else if (action === 'edit') { editingId = id; formDraft = null; notice = null; render(); focusForm(); }
    else if (action === 'cancel') { editingId = null; formDraft = null; focusAfterRender = '[data-action="new"]'; render(); }
    else if (action === 'logout') { logout(); }
    else if (action === 'toggle') mutate(id, 'PATCH', { enabled: button.getAttribute('data-enabled') === 'true' }, 'admin.success.updated');
    else if (action === 'finish' && window.confirm(t('admin.confirm.finish'))) mutate(id, 'PATCH', { finish: true }, 'admin.success.finished');
    else if (action === 'delete' && window.confirm(t('admin.confirm.delete'))) mutate(id, 'DELETE', null, 'admin.success.deleted');
  }

  function focusForm() {
    setTimeout(function () {
      var input = document.getElementById('stay-label');
      if (input) { input.focus(); input.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }, 0);
  }

  function logout() {
    if (expiryTimer) clearTimeout(expiryTimer);
    clearToken();
    stays = [];
    expiresAt = '';
    editingId = null;
    formDraft = null;
    notice = null;
    mode = 'login';
    render();
  }

  function scheduleExpiry(value) {
    if (expiryTimer) clearTimeout(expiryTimer);
    var delay = Date.parse(value || '') - Date.now();
    if (!Number.isFinite(delay)) return;
    expiryTimer = setTimeout(function () {
      clearToken();
      stays = [];
      expiresAt = '';
      editingId = null;
      formDraft = null;
      mode = 'login';
      notice = { type: 'error', key: 'admin.sessionExpired' };
      render();
    }, Math.max(0, delay + 100));
  }

  async function boot() {
    var languageButtons = document.querySelectorAll('[data-admin-lang]');
    for (var index = 0; index < languageButtons.length; index += 1) {
      languageButtons[index].addEventListener('click', function () { setLang(this.getAttribute('data-admin-lang')); });
    }
    renderLanguageControls();
    render();
    if (!apiBase()) {
      mode = 'login';
      notice = { type: 'error', key: 'admin.error.config' };
      render();
      return;
    }
    if (!token()) {
      mode = 'login';
      render();
      return;
    }
    try {
      var session = await api('/v1/auth/session');
      if (session.role !== 'admin') throw new Error('wrong_role');
      expiresAt = session.expiresAt;
      scheduleExpiry(expiresAt);
      await loadStays();
      mode = 'dashboard';
    } catch (error) {
      clearToken();
      mode = 'login';
      notice = { type: 'error', key: errorKey(error) };
    }
    render();
  }

  boot();
})();
