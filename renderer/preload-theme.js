/* =========================================================
 * Minimal Design — Theme controller
 * data-theme を auto / light / dark で切替
 * 設定は localStorage に保存
 * ========================================================= */
(function () {
  "use strict";

  const STORAGE_KEY = "app.theme";
  const root = document.documentElement;

  function resolve(pref) {
    if (pref === "light" || pref === "dark") return pref;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    return mq.matches ? "dark" : "light";
  }

  function apply(pref) {
    const theme = resolve(pref);
    root.setAttribute("data-theme", theme);
    root.dataset.themePref = pref;
  }

  function load() {
    try {
      return localStorage.getItem(STORAGE_KEY) || "auto";
    } catch (_e) {
      return "auto";
    }
  }

  function save(pref) {
    try {
      localStorage.setItem(STORAGE_KEY, pref);
    } catch (_e) {
      /* noop */
    }
  }

  // Initial
  let pref = load();
  apply(pref);

  // OS テーマ追従（auto のときのみ）
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  if (mq.addEventListener) {
    mq.addEventListener("change", () => {
      if (load() === "auto") apply("auto");
    });
  }

  // Toggle button: auto → light → dark → auto …
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const current = load();
      const next =
        current === "auto" ? "light" : current === "light" ? "dark" : "auto";
      save(next);
      apply(next);
      const status = document.getElementById("status");
      if (status) status.textContent = `Theme: ${next}`;
    });
  });
})();
