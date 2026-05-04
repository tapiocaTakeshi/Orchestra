/**
 * Minimal renderer entry.
 * - テーマ切替（light/dark）の最小ロジックのみ提供する。
 */

export {}; // ES モジュール化して宣言をファイルスコープに閉じ込める

type Theme = "light" | "dark";

const STORAGE_KEY = "app.theme";

function getPreferredTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (saved === "light" || saved === "dark") {
    return saved;
  }
  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(STORAGE_KEY, theme);
}

function toggleTheme(): void {
  const current =
    (document.documentElement.getAttribute("data-theme") as Theme | null) ??
    "light";
  applyTheme(current === "light" ? "dark" : "light");
}

function init(): void {
  applyTheme(getPreferredTheme());

  const toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", toggleTheme);
  }

  // OS のテーマ変更に追従（ユーザーが明示的に保存していない場合のみ）
  if (window.matchMedia) {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener?.("change", (e) => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        applyTheme(e.matches ? "dark" : "light");
      }
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
