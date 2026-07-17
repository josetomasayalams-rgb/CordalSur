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
      '  <button type="button" data-theme-option="light" data-i18n-aria="theme.light" aria-label="Light" aria-pressed="false">',
      '    <span class="theme-selector__icon" aria-hidden="true">☀</span>',
      '  </button>',
      '  <button type="button" data-theme-option="dark" data-i18n-aria="theme.dark" aria-label="Dark" aria-pressed="false">',
      '    <span class="theme-selector__icon" aria-hidden="true">🌙</span>',
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

    if (window.GH_I18N && typeof window.GH_I18N.apply === 'function' && typeof window.GH_I18N.getLang === 'function') {
      window.GH_I18N.apply(window.GH_I18N.getLang());
    }

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
