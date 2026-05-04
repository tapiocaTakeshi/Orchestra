// Minimal renderer — UI 連動のみ
(function () {
  "use strict";

  const STORAGE_KEY = "app.theme";
  const root = document.documentElement;
  const toggle = document.getElementById("themeToggle");
  const status = document.getElementById("status");

  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") {
      root.setAttribute("data-theme", theme);
    } else {
      root.removeAttribute("data-theme");
    }
  }

  function currentTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function setStatus(msg) {
    if (status) status.textContent = msg;
  }

  // Init
  applyTheme(localStorage.getItem(STORAGE_KEY) || null);

  if (toggle) {
    toggle.addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, next);
      applyTheme(next);
      setStatus(`Theme: ${next}`);
    });
  }

  // Action buttons (placeholder hooks)
  document.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", () => {
      const action = el.getAttribute("data-action");
      setStatus(`${action}…`);
    });
  });

  // Platform hint for styling (e.g., macOS traffic light spacing)
  if (navigator.platform) {
    const app = document.querySelector(".app");
    if (app) {
      const p = navigator.platform.toLowerCase();
      app.dataset.platform = p.includes("mac")
        ? "mac"
        : p.includes("win")
        ? "win"
        : "linux";
    }
  }
})();
