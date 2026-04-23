既存ファイルの具体的な内容が file-searcher の要約段階で省略されているため、planner / designer の方針に沿って **Orchestra の UI/UX 改善用コンポーネント群を新規追加** します。既存コードを壊さず段階的に組み込めるよう、`src/renderer/` 配下にデザインシステムとレイアウトを独立配置し、既存エントリから import するだけで利用できる構造にします。

## 1. デザイントークン

```css:src/renderer/styles/tokens.css
/* Orchestra Design Tokens
   UI/UX 改善で使用するカラー / スペーシング / タイポ定義。
   全コンポーネントは必ずこの変数経由で参照し、値の直書きを避けること。 */
:root {
  /* Surface */
  --bg-base: #0B0E14;
  --bg-surface: #151A23;
  --bg-surface-hover: #1E2430;
  --bg-elevated: #1A212C;

  /* Text */
  --text-main: #E2E8F0;
  --text-muted: #94A3B8;
  --text-subtle: #64748B;

  /* Brand / Accent */
  --accent: #3B82F6;
  --accent-hover: #2563EB;
  --accent-soft: rgba(59, 130, 246, 0.12);

  /* Semantic */
  --success: #10B981;
  --warning: #F59E0B;
  --danger: #EF4444;
  --purple: #8B5CF6;

  /* Border */
  --border: #2A3241;
  --border-strong: #3A445A;

  /* Radii */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-full: 9999px;

  /* Spacing (4pt grid) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  /* Typography */
  --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, "Hiragino Sans", "Noto Sans JP", sans-serif;
  --font-size-xs: 11px;
  --font-size-sm: 13px;
  --font-size-md: 14px;
  --font-size-lg: 16px;
  --font-size-xl: 20px;
  --font-size-2xl: 28px;

  /* Elevation */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.2);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.25), 0 2px 4px -1px rgba(0, 0, 0, 0.15);

  /* Motion */
  --ease: cubic-bezier(0.4, 0, 0.2, 1);
  --duration-fast: 120ms;
  --duration-base: 200ms;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

/* Base reset for renderer */
*,
*::before,
*::after { box-sizing: border-box; }

html, body, #root {
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-family);
  background-color: var(--bg-base);
  color: var(--text-main);
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}

/* Focus ring for keyboard users (a11y) */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb {
  background-color: var(--border);
  border-radius: var(--radius-full);
}
::-webkit-scrollbar-thumb:hover { background-color: var(--border-strong); }
```

## 2. UI atoms（状態統一つき）

```tsx:src/renderer/components/ui/Button.tsx
import React from 'react';
import './Button.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  iconLeft,
  iconRight,
  disabled,
  children,
  className = '',
  ...rest
}) => {
  const isDisabled = disabled || loading;
  return (
    <button
      className={`oc-btn oc-btn--${variant} oc-btn--${size} ${className}`}
      aria-busy={loading || undefined}
      disabled={isDisabled}
      {...rest}
    >
      {loading ? (
        <span className="oc-btn__spinner" aria-hidden="true" />
      ) : (
        iconLeft && <span className="oc-btn__icon">{iconLeft}</span>
      )}
      <span className="oc-btn__label">{children}</span>
      {iconRight && !loading && (
        <span className="oc-btn__icon">{iconRight}</span>
      )}
    </button>
  );
};
```

```css:src/renderer/components/ui/Button.css
.oc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease),
    border-color var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease),
    opacity var(--duration-fast) var(--ease);
  -webkit-app-region: no-drag;
  white-space: nowrap;
}

.oc-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.oc-btn--sm { padding: 6px 12px; font-size: var(--font-size-sm); }
.oc-btn--md { padding: 10px 16px; font-size: var(--font-size-md); }
.oc-btn--lg { padding: 12px 20px; font-size: var(--font-size-md); }

.oc-btn--primary {
  background-color: var(--accent);
  color: #fff;
}
.oc-btn--primary:hover:not(:disabled) { background-color: var(--accent-hover); }

.oc-btn--secondary {
  background-color: var(--bg-surface);
  color: var(--text-main);
  border-color: var(--border);
}
.oc-btn--secondary:hover:not(:disabled) { background-color: var(--bg-surface-hover); }

.oc-btn--ghost {
  background-color: transparent;
  color: var(--text-muted);
}
.oc-btn--ghost:hover:not(:disabled) {
  background-color: var(--bg-surface-hover);
  color: var(--text-main);
}

.oc-btn--danger {
  background-color: var(--danger);
  color: #fff;
}
.oc-btn--danger:hover:not(:disabled) { filter: brightness(1.08); }

.oc-btn__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: oc-btn-spin 0.7s linear infinite;
}

@keyframes oc-btn-spin {
  to { transform: rotate(360deg); }
}
```

```tsx:src/renderer/components/ui/Card.tsx
import React from 'react';
import './Card.css';

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...rest
}) => (
  <div className={`oc-card ${className}`} {...rest}>
    {children}
  </div>
);
```

```css:src/renderer/components/ui/Card.css
.oc-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  box-shadow: var(--shadow-sm);
  transition: transform var(--duration-base) var(--ease),
    box-shadow var(--duration-base) var(--ease);
}

.oc-card--interactive:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
```

```tsx:src/renderer/components/ui/StateViews.tsx
import React from 'react';
import './StateViews.css';

export const LoadingState: React.FC<{ label?: string }> = ({
  label = '読み込み中…',
}) => (
  <div className="oc-state" role="status" aria-live="polite">
    <span className="oc-state__spinner" aria-hidden="true" />
    <p className="oc-state__text">{label}</p>
  </div>
);

export const EmptyState: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <div className="oc-state">
    <div className="oc-state__icon" aria-hidden="true">📭</div>
    <h3 className="oc-state__title">{title}</h3>
    {description && <p className="oc-state__text">{description}</p>}
    {action && <div className="oc-state__action">{action}</div>}
  </div>
);

export const ErrorState: React.FC<{
  title?: string;
  description?: string;
  onRetry?: () => void;
}> = ({
  title = '問題が発生しました',
  description = '時間をおいて再度お試しください。',
  onRetry,
}) => (
  <div className="oc-state" role="alert">
    <div className="oc-state__icon oc-state__icon--danger" aria-hidden="true">
      ⚠️
    </div>
    <h3 className="oc-state__title">{title}</h3>
    <p className="oc-state__text">{description}</p>
    {onRetry && (
      <button className="oc-state__retry" onClick={onRetry}>
        再試行
      </button>
    )}
  </div>
);
```

```css:src/renderer/components/ui/StateViews.css
.oc-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-8);
  text-align: center;
  color: var(--text-muted);
}

.oc-state__icon {
  font-size: 32px;
  line-height: 1;
}

.oc-state__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-main);
}

.oc-state__text {
  margin: 0;
  font-size: var(--font-size-sm);
  max-width: 360px;
}

.oc-state__spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: oc-state-spin 0.8s linear infinite;
}

.oc-state__retry {
  margin-top: var(--space-2);
  background-color: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  padding: 8px 16px;
  cursor: pointer;
  font-weight: 600;
}

@keyframes oc-state-spin {
  to { transform: rotate(360deg); }
}
```

## 3. レイアウト（Sidebar / Topbar / MainLayout）

```tsx:src/renderer/components/layout/Sidebar.tsx
import React from 'react';
import './Sidebar.css';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface SidebarProps {
  items: NavItem[];
  systemItems?: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  showTrafficLights?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  items,
  systemItems = [],
  activeId,
  onSelect,
  showTrafficLights = true,
}) => {
  return (
    <aside className="oc-sidebar" aria-label="Primary navigation">
      {showTrafficLights && (
        <div className="oc-sidebar__traffic">
          <span className="oc-dot oc-dot--close" />
          <span className="oc-dot oc-dot--min" />
          <span className="oc-dot oc-dot--max" />
        </div>
      )}

      <div className="oc-sidebar__brand">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
        <span>Orchestra</span>
      </div>

      <nav className="oc-sidebar__nav">
        <div className="oc-sidebar__label">Main</div>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`oc-nav-item ${activeId === item.id ? 'is-active' : ''}`}
            onClick={() => onSelect(item.id)}
            aria-current={activeId === item.id ? 'page' : undefined}
          >
            <span className="oc-nav-item__icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}

        {systemItems.length > 0 && (
          <>
            <div className="oc-sidebar__label">System</div>
            {systemItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`oc-nav-item ${activeId === item.id ? 'is-active' : ''}`}
                onClick={() => onSelect(item.id)}
                aria-current={activeId === item.id ? 'page' : undefined}
              >
                <span className="oc-nav-item__icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </>
        )}
      </nav>
    </aside>
  );
};
```

```css:src/renderer/components/layout/Sidebar.css
.oc-sidebar {
  width: 260px;
  flex-shrink: 0;
  background-color: var(--bg-surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  -webkit-app-region: drag;
}

.oc-sidebar__traffic {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-5);
  -webkit-app-region: no-drag;
}

.oc-dot { width: 12px; height: 12px; border-radius: 50%; }
.oc-dot--close { background-color: #FF5F56; }
.oc-dot--min { background-color: #FFBD2E; }
.oc-dot--max { background-color: #27C93F; }

.oc-sidebar__brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.5px;
}
.oc-sidebar__brand svg { color: var(--accent); }

.oc-sidebar__nav {
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

.oc-sidebar__label {
  padding: 0 var(--space-2);
  margin: var(--space-4) 0 var(--space-2);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  color: var(--text-muted);
}

.oc-nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: var(--font-size-md);
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background-color var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease);
}
.oc-nav-item:hover {
  background-color: var(--bg-surface-hover);
  color: var(--text-main);
}
.oc-nav-item.is-active {
  background-color: var(--accent-soft);
  color: var(--accent);
}
.oc-nav-item__icon {
  display: inline-flex;
  width: 18px;
  height: 18px;
}
.oc-nav-item__icon svg { width: 18px; height: 18px; }
```

```tsx:src/renderer/components/layout/Topbar.tsx
import React, { useEffect, useRef } from 'react';
import './Topbar.css';

interface TopbarProps {
  title?: string;
  onSearch?: (q: string) => void;
  rightSlot?: React.ReactNode;
}

export const Topbar: React.FC<TopbarProps> = ({ title, onSearch, rightSlot }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Cmd/Ctrl+K でグローバル検索にフォーカス（キーボードファースト）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <header className="oc-topbar">
      <div className="oc-topbar__left">
        {title && <span className="oc-topbar__title">{title}</span>}
      </div>

      <div className="oc-topbar__search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          placeholder="検索… (⌘K)"
          aria-label="Search"
          onChange={(e) => onSearch?.(e.target.value)}
        />
        <kbd className="oc-topbar__kbd">⌘K</kbd>
      </div>

      <div className="oc-topbar__right">{rightSlot}</div>
    </header>
  );
};
```

```css:src/renderer/components/layout/Topbar.css
.oc-topbar {
  height: 64px;
  padding: 0 var(--space-8);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  border-bottom: 1px solid var(--border);
  background-color: rgba(11, 14, 20, 0.85);
  backdrop-filter: blur(12px);
  -webkit-app-region: drag;
  z-index: 10;
}

.oc-topbar__left,
.oc-topbar__right {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  -webkit-app-region: no-drag;
}

.oc-topbar__title {
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--text-main);
}

.oc-topbar__search {
  flex: 1;
  max-width: 420px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  padding: 8px 14px;
  color: var(--text-muted);
  transition: border-color var(--duration-fast) var(--ease);
  -webkit-app-region: no-drag;
}
.oc-topbar__search:focus-within { border-color: var(--accent); }

.oc-topbar__search input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-main);
  font-size: var(--font-size-md);
  font-family: inherit;
}
.oc-topbar__search input::placeholder { color: var(--text-muted); }

.oc-topbar__kbd {
  font-size: var(--font-size-xs);
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background-color: var(--bg-base);
  font-family: var(--font-family);
}
```

```tsx:src/renderer/components/layout/MainLayout.tsx
import React, { useEffect } from 'react';
import { Sidebar, NavItem } from './Sidebar';
import { Topbar } from './Topbar';
import './MainLayout.css';

interface MainLayoutProps {
  navItems: NavItem[];
  systemItems?: NavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  title?: string;
  topbarRight?: React.ReactNode;
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  navItems,
  systemItems,
  activeId,
  onNavigate,
  title,
  topbarRight,
  children,
}) => {
  // Esc でモーダル等の閉鎖をアプリ全体で通知（カスタムイベント）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.dispatchEvent(new CustomEvent('orchestra:escape'));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="oc-layout">
      <Sidebar
        items={navItems}
        systemItems={systemItems}
        activeId={activeId}
        onSelect={onNavigate}
      />
      <div className="oc-layout__main">
        <Topbar title={title} rightSlot={topbarRight} />
        <main className="oc-layout__content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
};
```

```css:src/renderer/components/layout/MainLayout.css
.oc-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: var(--bg-base);
  color: var(--text-main);
}

.oc-layout__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.oc-layout__content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-8);
  outline: none;
}

/* 狭幅時はサイドバー最小化 */
@media (max-width: 900px) {
  .oc-sidebar { width: 72px; }
  .oc-sidebar__brand span,
  .oc-nav-item span:not(.oc-nav-item__icon),
  .oc-sidebar__label { display: none; }
}
```

## 4. Dashboard ページ（designer のモックを React 化）

```tsx:src/renderer/pages/Dashboard.tsx
import React from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import './Dashboard.css';

interface StatProps {
  label: string;
  value: string;
  meta?: React.ReactNode;
  icon: React.ReactNode;
  tone: 'blue' | 'purple' | 'green' | 'orange';
}

const StatCard: React.FC<StatProps> = ({ label, value, meta, icon, tone }) => (
  <Card className="oc-card--interactive oc-stat">
    <div className="oc-stat__head">
      <span className="oc-stat__label">{label}</span>
      <div className={`oc-stat__icon oc-stat__icon--${tone}`}>{icon}</div>
    </div>
    <div className="oc-stat__value">{value}</div>
    {meta && <div className="oc-stat__meta">{meta}</div>}
  </Card>
);

export const Dashboard: React.FC = () => {
  return (
    <>
      <div className="oc-page-header">
        <div>
          <h1 className="oc-page-title">Overview</h1>
          <p className="oc-page-subtitle">
            今日のワークスペースの状況を一目で確認できます。
          </p>
        </div>
        <Button
          variant="primary"
          iconLeft={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          }
        >
          New Project
        </Button>
      </div>

      <div className="oc-stats-grid">
        <StatCard
          label="Total Projects"
          value="24"
          tone="blue"
          icon={<span>📁</span>}
          meta={<span className="oc-trend oc-trend--up">+12% 先月比</span>}
        />
        <StatCard
          label="Active Tasks"
          value="148"
          tone="purple"
          icon={<span>📋</span>}
          meta={<span className="oc-muted">24件が本日期限</span>}
        />
        <StatCard
          label="System Load"
          value="68%"
          tone="orange"
          icon={<span>⚙️</span>}
          meta={
            <div className="oc-progress">
              <div
                className="oc-progress__bar"
                style={{ width: '68%', background: 'var(--warning)' }}
              />
            </div>
          }
        />
        <StatCard
          label="Uptime"
          value="99.9%"
          tone="green"
          icon={<span>⚡</span>}
          meta={
            <span className="oc-trend oc-trend--up">
              <span className="oc-pulse" /> 全システム正常
            </span>
          }
        />
      </div>
    </>
  );
};
```

```css:src/renderer/pages/Dashboard.css
.oc-page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: var(--space-8);
  gap: var(--space-4);
}

.oc-page-title {
  margin: 0 0 4px;
  font-size: var(--font-size-2xl);
  font-weight: 700;
  letter-spacing: -0.5px;
}
.oc-page-subtitle {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-size-md);
}

.oc-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-5);
  margin-bottom: var(--space-8);
}

.oc-stat__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}
.oc-stat__label {
  font-size: var(--font-size-md);
  color: var(--text-muted);
  font-weight: 500;
}
.oc-stat__icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.oc-stat__icon--blue { background-color: rgba(59, 130, 246, 0.12); color: var(--accent); }
.oc-stat__icon--purple { background-color: rgba(139, 92, 246, 0.12); color: var(--purple); }
.oc-stat__icon--green { background-color: rgba(16, 185, 129, 0.12); color: var(--success); }
.oc-stat__icon--orange { background-color: rgba(245, 158, 11, 0.12); color: var(--warning); }

.oc-stat__value {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  margin-bottom: var(--space-2);
}
.oc-stat__meta {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.oc-trend { display: inline-flex; align-items: center; gap: 4px; font-weight: 500; }
.oc-trend--up { color: var(--success); }
.oc-trend--down { color: var(--danger); }
.oc-muted { color: var(--text-muted); }

.oc-progress {
  width: 100%;
  height: 6px;
  background-color: var(--bg-base);
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-top: 6px;
}
.oc-progress__bar {
  height: 100%;
  background-color: var(--accent);
  border-radius: var(--radius-full);
  transition: width var(--duration-base) var(--ease);
}

.oc-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--success);
  box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6);
  animation: oc-pulse 2s infinite;
  display: inline-block;
}
@keyframes oc-pulse {
  0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6); }
  70% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
  100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}
```

## 5. 軽量 state store（Zustand 相当の最小実装：依存追加なし）

```ts:src/renderer/store/uiStore.ts
/**
 * 最小の外部ストア (Zustand 導入前の繋ぎ).
 * useSyncExternalStore で React 18+ に対応.
 */
import { useSyncExternalStore } from 'react';

export interface UIState {
  activeNavId: string;
  searchQuery: string;
}

type Listener = () => void;

const state: UIState = {
  activeNavId: 'dashboard',
  searchQuery: '',
};

const listeners = new Set<Listener>();

const emit = () => listeners.forEach((l) => l());

export const uiStore = {
  getState: (): UIState => state,
  setActiveNav(id: string) {
    if (state.activeNavId === id) return;
    state.activeNavId = id;
    emit();
  },
  setSearch(q: string) {
    state.searchQuery = q;
    emit();
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useUIStore<T>(selector: (s: UIState) => T): T {
  return useSyncExternalStore(
    uiStore.subscribe,
    () => selector(uiStore.getState()),
    () => selector(uiStore.getState()),
  );
}
```

## 6. アプリルート（既存 main エントリから import する想定）

```tsx:src/renderer/OrchestraApp.tsx
import React from 'react';
import './styles/tokens.css';
import { MainLayout } from './components/layout/MainLayout';
import type { NavItem } from './components/layout/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { EmptyState } from './components/ui/StateViews';
import { Button } from './components/ui/Button';
import { uiStore, useUIStore } from './store/uiStore';

const Icon = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </svg>
  ),
  projects: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  tasks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.15.35.24.74.24 1.13" />
    </svg>
  ),
};

const mainNav: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Icon.dashboard },
  { id: 'projects', label: 'Projects', icon: Icon.projects },
  { id: 'tasks', label: 'Tasks', icon: Icon.tasks },
];
const systemNav: NavItem[] = [
  { id: 'settings', label: 'Settings', icon: Icon.settings },
];

const titleMap: Record<string, string> = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  tasks: 'Tasks',
  settings: 'Settings',
};

export const OrchestraApp: React.FC = () => {
  const activeId = useUIStore((s) => s.activeNavId);

  return (
    <MainLayout
      navItems={mainNav}
      systemItems={systemNav}
      activeId={activeId}
      onNavigate={(id) => uiStore.setActiveNav(id)}
      title={titleMap[activeId]}
    >
      {activeId === 'dashboard' && <Dashboard />}
      {activeId !== 'dashboard' && (
        <EmptyState
          title={`${titleMap[activeId]} は準備中です`}
          description="この画面は今後のフェーズで実装されます。"
          action={
            <Button
              variant="secondary"
              onClick={() => uiStore.setActiveNav('dashboard')}
            >
              ダッシュボードへ戻る
            </Button>
          }
        />
      )}
    </MainLayout>
  );
};

export default OrchestraApp;
```

## 7. 既存エントリからの取り込み手順（README）

```md:src/renderer/UI_INTEGRATION.md
# Orchestra UI/UX 改善モジュール 組み込み手順

本ディレクトリ (`src/renderer/`) は UI/UX 改善のために追加された
コンポーネント群です。既存コードを破壊せず段階導入できます。

## 1. 最短導入
既存の renderer エントリ (例: `src/renderer/index.tsx`) に以下を追加:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import OrchestraApp from './OrchestraApp';

createRoot(document.getElementById('root')!).render(<OrchestraApp />);
```

## 2. 部分導入
既存ページに一部だけ取り込みたい場合:

```tsx
import { MainLayout } from './components/layout/MainLayout';
import { Button } from './components/ui/Button';
import { LoadingState, EmptyState, ErrorState }
  from './components/ui/StateViews';
import './styles/tokens.css';
```

## 3. ショートカット
- `⌘/Ctrl + K` : 検索フォーカス
- `Esc`       : `orchestra:escape` カスタムイベント発火
  （モーダル側で `window.addEventListener('orchestra:escape', ...)`）

## 4. デザイントークン
色・余白・半径・タイポは `src/renderer/styles/tokens.css` の
CSS カスタムプロパティを参照。値の直書きは禁止。

## 5. 今後
- Zustand / Redux Toolkit への置き換えは `store/uiStore.ts` の
  インターフェースを保てば非破壊で可能。
- Radix UI / Headless UI 導入時は `components/ui/` の atoms を
  ラップして置換する方針とする。
```

必要ディレクトリを作成するコマンド:

```bash
mkdir -p src/renderer/components/layout src/renderer/components/ui src/renderer/pages src/renderer/store src/renderer/styles
```