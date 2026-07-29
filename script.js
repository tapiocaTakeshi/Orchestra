// =========================================================
// Modern UI — interactions
// =========================================================
(() => {
  const root = document.documentElement;

  // ---- Boot splash ---------------------------------------
  const bootSplash = document.getElementById('bootSplash');
  if (bootSplash) {
    const MIN_DISPLAY_MS = 1400;
    const shownAt = performance.now();
    const dismiss = () => {
      const remaining = MIN_DISPLAY_MS - (performance.now() - shownAt);
      setTimeout(() => {
        bootSplash.classList.add('is-hidden');
        bootSplash.addEventListener('transitionend', () => bootSplash.remove(), { once: true });
      }, Math.max(0, remaining));
    };
    if (document.readyState === 'complete') dismiss();
    else window.addEventListener('load', dismiss, { once: true });
  }

  // ---- Theme toggle (persisted) -------------------------
  const THEME_KEY = 'ui-theme';
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') {
    root.setAttribute('data-theme', stored);
  }
  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const current = root.getAttribute('data-theme')
        ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem(THEME_KEY, next);
    });
  }

  // ---- Sticky header shadow on scroll -------------------
  const header = document.getElementById('siteHeader');
  if (header) {
    const onScroll = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ---- Reveal on intersect ------------------------------
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const targets = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    targets.forEach(el => el.classList.add('is-visible'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    targets.forEach(el => io.observe(el));
  }

  // ---- Footer year --------------------------------------
  const y = document.getElementById('year');
  if (y) y.textContent = String(new Date().getFullYear());
})();
