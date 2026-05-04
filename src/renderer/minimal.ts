/**
 * Minimal renderer bootstrap
 * - OS のカラースキームに追従しつつ、ユーザー操作で手動切替も可能にする
 * - 永続化は localStorage（Renderer 限定の軽量ストア）を使用
 * - サイドバーのナビゲーションは aria-current と active クラスのみで状態表現
 */

export {}; // ES モジュール化して宣言をファイルスコープに閉じ込める

type Theme = "light" | "dark";

const STORAGE_KEY = "minimal.theme";

function getSystemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function writeStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore (private mode 等) */
  }
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

function initTheme(): void {
  const stored = readStoredTheme();
  const initial: Theme = stored ?? getSystemTheme();
  applyTheme(initial);

  // OS 側の変更にも追従（手動指定がない時のみ）
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (readStoredTheme() === null) {
        applyTheme(e.matches ? "dark" : "light");
      }
    };
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", handler);
    } else {
      // Safari / 旧 Electron 互換
      // @ts-ignore
      mq.addListener(handler);
    }
  }

  const toggle = document.getElementById("theme-toggle");
  toggle?.addEventListener("click", () => {
    const current =
      (document.documentElement.getAttribute("data-theme") as Theme) ?? "light";
    const next: Theme = current === "dark" ? "light" : "dark";
    applyTheme(next);
    writeStoredTheme(next);
  });
}

function initNav(): void {
  const items = document.querySelectorAll<HTMLLIElement>(".nav .nav__item");
  items.forEach((item) => {
    const button = item.querySelector("button");
    if (!button) return;
    button.addEventListener("click", () => {
      items.forEach((li) => li.classList.remove("nav__item--active"));
      item.classList.add("nav__item--active");
      const view = button.getAttribute("data-view");
      if (view) {
        // 必要に応じてここでルーティング/ビュー切替を行う
        document.dispatchEvent(
          new CustomEvent("minimal:navigate", { detail: { view } })
        );
      }
    });
  });
}

function boot(): void {
  initTheme();
  initNav();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
