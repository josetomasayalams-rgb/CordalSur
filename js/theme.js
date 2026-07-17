(function () {
  'use strict';

  var STORAGE_KEY = 'gh-theme-v3';
  var root = document.documentElement;
  var control = null;

  function readTheme() {
    try {
      localStorage.removeItem('gh-theme');
      localStorage.removeItem('gh-theme-v2');
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) {}
    return 'dark';
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    if (control) {
      var btns = control.querySelectorAll('button[data-theme-option]');
      for (var i = 0; i < btns.length; i++) {
        var btn = btns[i];
        btn.setAttribute('aria-pressed', btn.getAttribute('data-theme-option') === theme ? 'true' : 'false');
      }
    }
    document.dispatchEvent(new CustomEvent('cordal:theme-changed', { detail: { theme: theme } }));
  }

  function setTheme(theme) {
    var next = theme === 'dark' ? 'dark' : 'light';
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
    applyTheme(next);
  }

  function buildControl() {
    var lang = document.querySelector('.lang-selector');
    if (!lang || control) return;

    control = document.createElement('div');
    control.className = 'theme-selector';
    control.setAttribute('role', 'group');
    control.setAttribute('data-i18n-aria', 'theme.label');
    control.setAttribute('aria-label', 'Theme');
    control.innerHTML = [
      '<div class="theme-selector__buttons">',
      '  <button type="button" data-theme-option="light" data-i18n-aria="theme.light" data-i18n-title="theme.light" aria-label="Light" title="Light" aria-pressed="false">',
      '    <svg class="theme-selector__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
      '  </button>',
      '  <button type="button" data-theme-option="dark" data-i18n-aria="theme.dark" data-i18n-title="theme.dark" aria-label="Dark" title="Dark" aria-pressed="false">',
      '    <svg class="theme-selector__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.2 15.5A8.7 8.7 0 0 1 8.5 3.8a8.8 8.8 0 1 0 11.7 11.7Z"/></svg>',
      '  </button>',
      '</div>'
    ].join('');

    var top = lang.parentElement;
    if (top && top.classList.contains('top-controls')) {
      top.appendChild(control);
    } else if (top && top.classList.contains('hero-panel__top')) {
      var stack = top.querySelector('.prefs-stack');
      if (!stack) {
        stack = document.createElement('div');
        stack.className = 'prefs-stack';
        top.replaceChild(stack, lang);
        stack.appendChild(lang);
      } else {
        lang.remove();
        stack.appendChild(lang);
      }
      stack.appendChild(control);
    } else {
      var inlineStack = document.createElement('div');
      inlineStack.className = 'prefs-stack prefs-stack--inline';
      top.replaceChild(inlineStack, lang);
      inlineStack.appendChild(lang);
      inlineStack.appendChild(control);
    }

    function localizeControl() {
      if (!window.GH_I18N || typeof window.GH_I18N.t !== 'function') return;
      control.setAttribute('aria-label', window.GH_I18N.t('theme.label'));
      control.querySelectorAll('[data-theme-option]').forEach(function (button) {
        var key = button.getAttribute('data-i18n-aria');
        var label = window.GH_I18N.t(key);
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
      });
    }
    localizeControl();
    if (window.GH_I18N && typeof window.GH_I18N.subscribe === 'function') window.GH_I18N.subscribe(localizeControl);

    applyTheme(root.getAttribute('data-theme') || 'light');

    control.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('button[data-theme-option]');
      if (!btn) return;
      setTheme(btn.getAttribute('data-theme-option'));
    });
  }

  applyTheme(readTheme());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildControl);
  } else {
    buildControl();
  }
})();
