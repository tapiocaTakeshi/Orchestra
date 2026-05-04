// Minimal renderer — theme toggle & button hooks
(function () {
  'use strict';

  const root = document.documentElement;
  const THEME_KEY = 'app.theme';

  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
      root.setAttribute('data-theme', theme);
    } else {
      root.removeAttribute('data-theme');
    }
  }

  function currentEffectiveTheme() {
    const explicit = root.getAttribute('data-theme');
    if (explicit) return explicit;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // Boot
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) applyTheme(saved);
  } catch (_) { /* noop */ }

  // Toggle
  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const next = currentEffectiveTheme() === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* noop */ }
    });
  }

  // Demo actions
  document.getElementById('primaryAction')?.addEventListener('click', () => {
    console.log('[app] primary action');
  });
  document.getElementById('secondaryAction')?.addEventListener('click', () => {
    console.log('[app] secondary action');
  });
})();
