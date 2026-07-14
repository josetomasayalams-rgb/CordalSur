(function () {
  'use strict';

  var script = document.currentScript;
  var GUEST_TOKEN_KEY = 'cordal-sur-guest-token-v1';
  var ADMIN_TOKEN_KEY = 'cordal-sur-admin-token-v1';
  var LANG_KEY = 'gh-lang';
  var SUPPORTED = ['es', 'pt', 'en'];
  var root = null;
  var view = 'checking';
  var messageKey = '';
  var busy = false;
  var sessionTimer = null;
  var rechecking = false;
  var sessionExpiresAt = 0;
  var sessionRole = '';

  document.documentElement.classList.add('access-pending');

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
    render();
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

  function storedToken(role) {
    try {
      return role === 'admin'
        ? sessionStorage.getItem(ADMIN_TOKEN_KEY) || ''
        : localStorage.getItem(GUEST_TOKEN_KEY) || '';
    } catch (error) { return ''; }
  }

  function token() {
    return sessionRole ? storedToken(sessionRole) : '';
  }

  function saveToken(value) {
    sessionRole = 'guest';
    try { localStorage.setItem(GUEST_TOKEN_KEY, value); } catch (error) {}
  }

  function removeToken(role) {
    var targetRole = role || sessionRole;
    try {
      if (targetRole === 'admin') sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      else if (targetRole === 'guest') localStorage.removeItem(GUEST_TOKEN_KEY);
    } catch (error) {}
    if (sessionRole === targetRole) sessionRole = '';
  }

  function sessionCandidates() {
    var candidates = [];
    var admin = storedToken('admin');
    var guest = storedToken('guest');
    if (admin) candidates.push({ role: 'admin', token: admin });
    if (guest) candidates.push({ role: 'guest', token: guest });
    return candidates;
  }

  function wrongRoleError() {
    var error = new Error('wrong_role');
    error.code = 'session_revoked';
    error.status = 401;
    return error;
  }

  function isSessionFailure(error) {
    return Boolean(error && (error.status === 401 || error.code === 'session_expired' || error.code === 'session_revoked'));
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
    try {
      var response = await fetch(base + path, requestOptions);
      var data = {};
      try { data = await response.json(); } catch (error) {}
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

  function languageButtons() {
    return '<div class="cs-language" role="group" aria-label="' + t('access.language') + '">' +
      SUPPORTED.map(function (lang) {
        return '<button type="button" data-access-lang="' + lang + '" aria-pressed="' + (getLang() === lang ? 'true' : 'false') + '">' + lang.toUpperCase() + '</button>';
      }).join('') + '</div>';
  }

  function footer() {
    return '<div class="cs-gate-footer">' + languageButtons() +
      '<a class="cs-text-button" href="admin.html">' + t('access.admin') + '</a></div>';
  }

  function render() {
    if (!root) return;
    if (view === 'checking') {
      root.innerHTML = '<section class="cs-gate" aria-labelledby="cs-access-title"><p class="cs-brand-word">Cordal Sur</p>' +
        '<div class="cs-spinner" aria-hidden="true"></div><h1 id="cs-access-title">' + t('access.checking') + '</h1>' + footer() + '</section>';
    } else if (view === 'locked' || view === 'config') {
      var title = view === 'locked' ? t('access.locked.title') : t('access.config.error');
      var body = view === 'locked' ? t('access.locked.body') : '';
      root.innerHTML = '<section class="cs-gate" aria-labelledby="cs-access-title"><p class="cs-brand-word">Cordal Sur</p>' +
        '<h1 id="cs-access-title">' + title + '</h1>' + (body ? '<p class="cs-lead">' + body + '</p>' : '') + footer() + '</section>';
    } else {
      root.innerHTML = '<section class="cs-gate" aria-labelledby="cs-access-title"><p class="cs-brand-word">Cordal Sur</p>' +
        '<h1 id="cs-access-title">' + t('access.title') + '</h1><p class="cs-lead">' + t('access.subtitle') + '</p>' +
        (messageKey ? '<p class="cs-alert" role="alert">' + t(messageKey) + '</p>' : '') +
        '<form id="cs-access-form" novalidate><div class="cs-field"><label for="cs-access-pin">' + t('access.pin.label') + '</label>' +
        '<div class="cs-pin-wrap"><input id="cs-access-pin" name="pin" type="password" inputmode="numeric" autocomplete="one-time-code" maxlength="5" pattern="[0-9]{2}-[0-9]{2}" placeholder="' + t('access.pin.placeholder') + '" required>' +
        '<button class="cs-reveal" type="button" data-reveal aria-label="' + t('access.showPin') + '" title="' + t('access.showPin') + '"><span aria-hidden="true">◉</span></button></div></div>' +
        '<button class="cs-button cs-button--full" type="submit"' + (busy ? ' disabled' : '') + '>' + (busy ? t('access.checking') : t('access.submit')) + '</button></form>' + footer() + '</section>';
      bindForm();
    }
    bindLanguages();
    if (view !== 'login') setTimeout(function () { if (root && root.isConnected) root.focus(); }, 0);
  }

  function trapFocus(event) {
    if (event.key !== 'Tab' || !root) return;
    var focusable = root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) { event.preventDefault(); root.focus(); return; }
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (document.activeElement === root) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function ensureRoot() {
    if (root && root.isConnected) return;
    root = document.createElement('div');
    root.className = 'cs-access-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'cs-access-title');
    root.setAttribute('tabindex', '-1');
    root.addEventListener('keydown', trapFocus);
    document.body.appendChild(root);
  }

  function bindLanguages() {
    var buttons = root.querySelectorAll('[data-access-lang]');
    for (var index = 0; index < buttons.length; index += 1) {
      buttons[index].addEventListener('click', function () { setLang(this.getAttribute('data-access-lang')); });
    }
  }

  function formatPin(input) {
    var digits = input.value.replace(/\D/g, '').slice(0, 4);
    input.value = digits.length > 2 ? digits.slice(0, 2) + '-' + digits.slice(2) : digits;
  }

  function bindForm() {
    var form = root.querySelector('#cs-access-form');
    var input = root.querySelector('#cs-access-pin');
    var reveal = root.querySelector('[data-reveal]');
    if (!form || !input) return;
    input.addEventListener('input', function () { formatPin(input); });
    reveal.addEventListener('click', function () {
      var showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      reveal.setAttribute('aria-label', t(showing ? 'access.showPin' : 'access.hidePin'));
      reveal.setAttribute('title', t(showing ? 'access.showPin' : 'access.hidePin'));
      input.focus();
    });
    form.addEventListener('submit', login);
    setTimeout(function () { input.focus(); }, 0);
  }

  function errorKey(error) {
    if (error && error.code === 'invalid_credentials') return 'access.invalid';
    if (error && error.code === 'invalid_pin_format') return 'access.invalid';
    if (error && error.code === 'rate_limited') return 'access.rateLimited';
    if (error && error.code === 'session_expired') return 'access.sessionExpired';
    if (error && error.code === 'session_revoked') return 'access.sessionExpired';
    if (error && error.code === 'server_not_configured') return 'access.config.error';
    return 'access.network.error';
  }

  async function login(event) {
    event.preventDefault();
    if (busy) return;
    var input = root.querySelector('#cs-access-pin');
    if (!/^\d{2}-\d{2}$/.test(input.value)) {
      messageKey = 'access.invalid';
      render();
      return;
    }
    busy = true;
    messageKey = '';
    render();
    try {
      var result = await api('/v1/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: input.value })
      });
      saveToken(result.token);
      unlock(result.expiresAt);
    } catch (error) {
      if (error.code === 'no_active_stay') view = 'locked';
      else messageKey = errorKey(error);
      busy = false;
      render();
    }
  }

  function scheduleCheck(expiresAt) {
    if (sessionTimer) clearTimeout(sessionTimer);
    var parsed = Date.parse(expiresAt || '');
    if (Number.isFinite(parsed)) sessionExpiresAt = parsed;
    var remaining = sessionExpiresAt - Date.now();
    var delay = Number.isFinite(remaining) && remaining > 0 ? Math.min(60000, remaining + 100) : 0;
    sessionTimer = setTimeout(revalidateSession, Math.max(0, delay));
  }

  function scheduleLockedCheck() {
    if (sessionTimer) clearTimeout(sessionTimer);
    sessionTimer = setTimeout(refreshAvailability, 60000);
  }

  async function refreshAvailability() {
    if (view !== 'locked' || document.hidden) { if (view === 'locked') scheduleLockedCheck(); return; }
    try {
      var status = await api('/v1/access/status');
      if (status.active) { view = 'login'; render(); }
    } catch (error) {}
    if (view === 'locked') scheduleLockedCheck();
  }

  function lockAccess(key) {
    if (sessionTimer) clearTimeout(sessionTimer);
    removeToken();
    sessionExpiresAt = 0;
    document.documentElement.classList.remove('access-granted');
    document.documentElement.removeAttribute('data-access-role');
    document.documentElement.classList.add('access-pending');
    ensureRoot();
    view = 'login';
    busy = false;
    messageKey = key || 'access.sessionExpired';
    render();
  }

  async function restoreGuestSession() {
    var guestToken = storedToken('guest');
    if (!guestToken) return false;
    try {
      var result = await api('/v1/auth/session', { headers: { Authorization: 'Bearer ' + guestToken } });
      if (result.role !== 'guest') throw wrongRoleError();
      sessionRole = 'guest';
      unlock(result.expiresAt);
      return true;
    } catch (error) {
      if (isSessionFailure(error)) removeToken('guest');
      return false;
    }
  }

  async function expireActiveSession(error) {
    var failedRole = sessionRole;
    removeToken(failedRole);
    if (failedRole === 'admin' && await restoreGuestSession()) return true;
    lockAccess(errorKey(error));
    return false;
  }

  async function revalidateSession() {
    if (rechecking) return;
    if (!token()) {
      if (document.documentElement.classList.contains('access-granted')) {
        await expireActiveSession({ status: 401, code: 'session_expired' });
      }
      return;
    }
    if (document.hidden) {
      if (sessionExpiresAt && Date.now() >= sessionExpiresAt) {
        await expireActiveSession({ status: 401, code: 'session_expired' });
      }
      else sessionTimer = setTimeout(revalidateSession, Math.min(60000, Math.max(1000, sessionExpiresAt - Date.now() + 100)));
      return;
    }
    rechecking = true;
    try {
      var result = await api('/v1/auth/session', { headers: { Authorization: 'Bearer ' + token() } });
      if (result.role !== sessionRole) throw wrongRoleError();
      if (document.documentElement.classList.contains('access-granted')) scheduleCheck(result.expiresAt);
      else unlock(result.expiresAt);
    } catch (error) {
      if (isSessionFailure(error) || (sessionExpiresAt && Date.now() >= sessionExpiresAt)) {
        await expireActiveSession(error);
      } else {
        scheduleCheck(new Date(sessionExpiresAt || Date.now() + 60000).toISOString());
      }
    } finally {
      rechecking = false;
    }
  }

  function unlock(expiresAt) {
    document.documentElement.classList.remove('access-pending');
    document.documentElement.classList.add('access-granted');
    document.documentElement.setAttribute('data-access-role', sessionRole);
    if (root) root.remove();
    scheduleCheck(expiresAt);
    window.dispatchEvent(new CustomEvent('cordal:access-granted', { detail: { role: sessionRole } }));
  }

  async function boot() {
    ensureRoot();
    render();
    if (!apiBase()) {
      view = 'config';
      render();
      return;
    }
    var candidates = sessionCandidates();
    var bootError = null;
    for (var index = 0; index < candidates.length; index += 1) {
      var candidate = candidates[index];
      sessionRole = candidate.role;
      try {
        var session = await api('/v1/auth/session', { headers: { Authorization: 'Bearer ' + candidate.token } });
        if (session.role !== candidate.role) throw wrongRoleError();
        unlock(session.expiresAt);
        return;
      } catch (error) {
        if (isSessionFailure(error)) {
          removeToken(candidate.role);
          messageKey = 'access.sessionExpired';
        } else {
          bootError = error;
          break;
        }
      }
    }
    sessionRole = '';
    if (bootError) {
      view = bootError.code === 'server_not_configured' ? 'config' : 'login';
      messageKey = errorKey(bootError);
      render();
      return;
    }
    try {
      var status = await api('/v1/access/status');
      view = status.active ? 'login' : 'locked';
    } catch (error) {
      view = error.code === 'server_not_configured' ? 'config' : 'login';
      messageKey = errorKey(error);
    }
    render();
    if (view === 'locked') scheduleLockedCheck();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    if (document.documentElement.classList.contains('access-granted')) revalidateSession();
    else if (view === 'locked') refreshAvailability();
  });
  window.addEventListener('online', function () {
    if (document.documentElement.classList.contains('access-granted')) revalidateSession();
    else if (view === 'locked') refreshAvailability();
  });
  window.addEventListener('pageshow', function (event) {
    if (event.persisted && document.documentElement.classList.contains('access-granted')) revalidateSession();
  });
  window.addEventListener('storage', function (event) {
    if (event.key !== GUEST_TOKEN_KEY || sessionRole === 'admin') return;
    if (!event.newValue) {
      if (document.documentElement.classList.contains('access-granted')) lockAccess('access.sessionExpired');
    } else {
      sessionRole = 'guest';
      revalidateSession();
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
