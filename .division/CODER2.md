中間エージェントの成果物（designer の HTML / writer のドキュメント / imager のビジュアル方向性）を、ワークスペース（`.claude/worktrees/funny-aryabhata/`）に実ファイルとして落とし込みます。既存の 3 ファイル（ESLint plugin / CODEBASE GUIDE / esbuild-preview）は UI と直接関係しないため編集せず、新規に UI/UX 改善成果物を追加します。

```html:.claude/worktrees/funny-aryabhata/docs/ui-ux/showcase.html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Orchestra UI/UX System Redesign</title>
  <style>
    /* =========================================
       Design Tokens (CSS Variables)
    ========================================= */
    :root {
      /* Neutral */
      --gray-50: #f9fafb;
      --gray-100: #f3f4f6;
      --gray-200: #e5e7eb;
      --gray-300: #d1d5db;
      --gray-400: #9ca3af;
      --gray-500: #6b7280;
      --gray-600: #4b5563;
      --gray-700: #374151;
      --gray-800: #1f2937;
      --gray-900: #111827;

      /* Brand */
      --primary-50: #eff6ff;
      --primary-100: #dbeafe;
      --primary-500: #3b82f6;
      --primary-600: #2563eb;
      --primary-700: #1d4ed8;

      /* Semantic */
      --red-50: #fef2f2;
      --red-100: #fee2e2;
      --red-500: #ef4444;
      --red-600: #dc2626;
      --green-50: #ecfdf5;
      --green-500: #10b981;
      --green-600: #059669;

      /* Typography */
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;

      /* Elevation */
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      --shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);

      /* Radius */
      --radius-sm: 0.25rem;
      --radius-md: 0.375rem;
      --radius-lg: 0.5rem;
      --radius-xl: 0.75rem;

      /* Spacing (8px grid) */
      --space-1: 4px;
      --space-2: 8px;
      --space-3: 12px;
      --space-4: 16px;
      --space-6: 24px;
      --space-8: 32px;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font-sans);
      background-color: var(--gray-50);
      color: var(--gray-900);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    a { text-decoration: none; color: inherit; }
    ul { list-style: none; }
    button { font-family: inherit; }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
      }
    }

    /* =========================================
       App Shell
    ========================================= */
    .app-wrapper { display: flex; height: 100vh; overflow: hidden; }

    .sidebar {
      width: 260px;
      background-color: #fff;
      border-right: 1px solid var(--gray-200);
      display: flex;
      flex-direction: column;
    }

    .sidebar-header {
      padding: var(--space-6);
      display: flex;
      align-items: center;
      gap: var(--space-3);
      border-bottom: 1px solid var(--gray-100);
    }

    .brand-icon {
      width: 32px; height: 32px;
      background: var(--primary-600);
      color: #fff;
      border-radius: var(--radius-md);
      display: flex; align-items: center; justify-content: center;
    }

    .brand-title { font-size: 1.125rem; font-weight: 700; color: var(--gray-900); }

    .nav-list {
      padding: var(--space-6) var(--space-4);
      display: flex; flex-direction: column; gap: var(--space-1);
    }

    .nav-item {
      display: flex; align-items: center; gap: var(--space-3);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      color: var(--gray-600);
      font-weight: 500; font-size: 0.875rem;
      transition: background-color 0.2s, color 0.2s;
    }
    .nav-item:hover { background-color: var(--gray-50); color: var(--gray-900); }
    .nav-item:focus-visible { outline: 2px solid var(--primary-500); outline-offset: 2px; }
    .nav-item.active { background-color: var(--primary-50); color: var(--primary-700); }

    .nav-icon { width: 20px; height: 20px; stroke-width: 2; }

    .main-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

    .top-header {
      height: 64px;
      background-color: #fff;
      border-bottom: 1px solid var(--gray-200);
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 var(--space-8);
    }

    .breadcrumb {
      font-size: 0.875rem; color: var(--gray-500);
      display: flex; align-items: center; gap: var(--space-2);
    }
    .breadcrumb span.current { color: var(--gray-900); font-weight: 500; }

    .user-profile { display: flex; align-items: center; gap: var(--space-3); }
    .avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background-color: var(--primary-100); color: var(--primary-700);
      display: flex; align-items: center; justify-content: center;
      font-weight: 600; font-size: 0.875rem;
    }

    .main-content { flex: 1; overflow-y: auto; padding: var(--space-8); }

    /* =========================================
       Components
    ========================================= */
    .section-title {
      font-size: 1.25rem; font-weight: 600; color: var(--gray-900);
      margin-bottom: var(--space-6);
    }
    .section-container { margin-bottom: 3rem; }

    .grid { display: grid; gap: var(--space-6); }
    .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }

    @media (max-width: 960px) {
      .grid-cols-3, .grid-cols-2 { grid-template-columns: 1fr; }
      .sidebar { display: none; }
      .main-content { padding: var(--space-4); }
    }

    .card {
      background-color: #fff;
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow);
      border: 1px solid var(--gray-200);
      padding: var(--space-6);
      display: flex; flex-direction: column;
    }

    .stat-card-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: var(--space-4);
    }
    .stat-title { font-size: 0.875rem; font-weight: 500; color: var(--gray-500); }
    .stat-value { font-size: 1.875rem; font-weight: 700; color: var(--gray-900); }
    .stat-trend {
      display: flex; align-items: center; gap: var(--space-1);
      font-size: 0.875rem; font-weight: 500; margin-top: var(--space-2);
    }
    .trend-up { color: var(--green-600); }
    .trend-down { color: var(--red-600); }

    .icon-wrapper {
      width: 40px; height: 40px;
      border-radius: var(--radius-lg);
      display: flex; align-items: center; justify-content: center;
    }
    .icon-wrapper.blue { background-color: var(--primary-50); color: var(--primary-600); }
    .icon-wrapper.green { background-color: var(--green-50); color: var(--green-600); }

    /* Forms */
    .form-group { margin-bottom: var(--space-4); }
    .form-label {
      display: block; font-size: 0.875rem; font-weight: 500;
      color: var(--gray-700); margin-bottom: var(--space-2);
    }
    .form-input, .form-select {
      width: 100%;
      padding: 0.625rem 0.75rem;
      font-size: 0.875rem;
      border: 1px solid var(--gray-300);
      border-radius: var(--radius-md);
      background-color: #fff; color: var(--gray-900);
      transition: border-color 0.2s, box-shadow 0.2s;
      outline: none;
    }
    .form-input::placeholder { color: var(--gray-400); }
    .form-input:focus, .form-select:focus {
      border-color: var(--primary-500);
      box-shadow: 0 0 0 3px var(--primary-100);
    }
    .form-input.is-error { border-color: var(--red-500); }
    .form-input.is-error:focus { box-shadow: 0 0 0 3px var(--red-100); }
    .form-error-msg {
      font-size: 0.75rem; color: var(--red-600); margin-top: 0.375rem;
    }

    /* Buttons */
    .btn {
      display: inline-flex; align-items: center; justify-content: center;
      gap: var(--space-2);
      padding: 0.625rem 1rem;
      font-size: 0.875rem; font-weight: 500;
      border-radius: var(--radius-md);
      border: 1px solid transparent;
      cursor: pointer;
      transition: background-color 0.2s, color 0.2s, border-color 0.2s;
      outline: none;
    }
    .btn:focus-visible { box-shadow: 0 0 0 3px var(--primary-100); }
    .btn-primary { background-color: var(--primary-600); color: #fff; }
    .btn-primary:hover { background-color: var(--primary-700); }
    .btn-secondary {
      background-color: #fff;
      border-color: var(--gray-300);
      color: var(--gray-700);
      box-shadow: var(--shadow-sm);
    }
    .btn-secondary:hover { background-color: var(--gray-50); color: var(--gray-900); }
    .btn-danger { background-color: var(--red-600); color: #fff; }
    .btn-danger:hover { background-color: var(--red-500); }
    .btn-ghost { background-color: transparent; color: var(--gray-600); }
    .btn-ghost:hover { background-color: var(--gray-100); color: var(--gray-900); }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-group { display: flex; flex-wrap: wrap; gap: var(--space-4); }

    /* States */
    .state-box {
      border: 1px dashed var(--gray-300);
      border-radius: var(--radius-xl);
      padding: 3rem 2rem;
      text-align: center;
      display: flex; flex-direction: column; align-items: center;
      background-color: #fff;
      height: 100%;
    }
    .state-icon { width: 48px; height: 48px; color: var(--gray-400); margin-bottom: var(--space-4); }
    .state-title { font-size: 1.125rem; font-weight: 600; color: var(--gray-900); margin-bottom: var(--space-2); }
    .state-desc {
      font-size: 0.875rem; color: var(--gray-500);
      margin-bottom: var(--space-6); max-width: 250px;
    }

    /* Skeleton */
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .skeleton {
      background-color: var(--gray-200);
      border-radius: var(--radius-sm);
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    .skeleton-avatar { width: 48px; height: 48px; border-radius: 50%; }
    .skeleton-text-lg { width: 60%; height: 1.25rem; margin-bottom: var(--space-2); }
    .skeleton-text-sm { width: 80%; height: 0.875rem; margin-bottom: var(--space-1); }

    /* Alert */
    .alert {
      display: flex; align-items: flex-start; gap: var(--space-3);
      padding: var(--space-4);
      border-radius: var(--radius-md);
      background-color: var(--red-50);
      border: 1px solid var(--red-100);
    }
    .alert-icon { width: 20px; height: 20px; color: var(--red-500); flex-shrink: 0; }
    .alert-title { font-size: 0.875rem; font-weight: 600; color: var(--red-600); margin-bottom: var(--space-1); }
    .alert-desc { font-size: 0.875rem; color: var(--red-600); }

    /* Spinner */
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner {
      width: 48px; height: 48px;
      border: 3px solid var(--gray-200);
      border-top-color: var(--primary-600);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: var(--space-4);
    }
  </style>
</head>
<body>
  <div class="app-wrapper">
    <aside class="sidebar" aria-label="Main navigation">
      <div class="sidebar-header">
        <div class="brand-icon" aria-hidden="true">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div class="brand-title">Orchestra</div>
      </div>
      <ul class="nav-list">
        <li><a href="#" class="nav-item active" aria-current="page">
          <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
          Dashboard
        </a></li>
        <li><a href="#" class="nav-item">
          <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
          Projects
        </a></li>
        <li><a href="#" class="nav-item">
          <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
          Team
        </a></li>
        <li><a href="#" class="nav-item">
          <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          Settings
        </a></li>
      </ul>
    </aside>

    <main class="main-area">
      <header class="top-header">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <span>Home</span>
          <span aria-hidden="true">/</span>
          <span class="current" aria-current="page">Components Showcase</span>
        </nav>
        <div class="user-profile">
          <button class="btn btn-ghost" aria-label="Notifications" style="padding: 0.5rem;">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
          </button>
          <div class="avatar" aria-label="User: Jane Doe">JD</div>
        </div>
      </header>

      <div class="main-content">
        <section class="section-container" aria-labelledby="overview-title">
          <h2 id="overview-title" class="section-title">Overview Cards</h2>
          <div class="grid grid-cols-3">
            <div class="card">
              <div class="stat-card-header">
                <div class="stat-title">Total Users</div>
                <div class="icon-wrapper blue" aria-hidden="true">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="24" height="24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                </div>
              </div>
              <div class="stat-value">24,592</div>
              <div class="stat-trend trend-up">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
                12% from last month
              </div>
            </div>

            <div class="card">
              <div class="stat-card-header">
                <div class="stat-title">Active Projects</div>
                <div class="icon-wrapper green" aria-hidden="true">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="24" height="24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                </div>
              </div>
              <div class="stat-value">142</div>
              <div class="stat-trend trend-down">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16" style="transform: rotate(180deg);" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
                2% from last month
              </div>
            </div>

            <div class="card">
              <div class="stat-card-header">
                <div class="stat-title">Storage Used</div>
                <div class="icon-wrapper blue" aria-hidden="true">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="24" height="24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7z"/></svg>
                </div>
              </div>
              <div class="stat-value">64.2 GB</div>
              <div class="stat-trend trend-up">32% of 200GB quota</div>
            </div>
          </div>
        </section>

        <section class="section-container" aria-labelledby="forms-title">
          <h2 id="forms-title" class="section-title">Forms &amp; Buttons</h2>
          <div class="grid grid-cols-2">
            <div class="card">
              <div class="form-group">
                <label class="form-label" for="email">Email Address</label>
                <input id="email" type="email" class="form-input" placeholder="you@example.com">
              </div>
              <div class="form-group">
                <label class="form-label" for="role">Project Role</label>
                <select id="role" class="form-select">
                  <option>Admin</option>
                  <option>Editor</option>
                  <option>Viewer</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="repo">Repository Name</label>
                <input id="repo" type="text" class="form-input is-error" value="orchestra-ui%" aria-invalid="true" aria-describedby="repo-err">
                <div id="repo-err" class="form-error-msg" role="alert">Special characters are not allowed.</div>
              </div>
            </div>

            <div class="card">
              <span class="form-label">Action Buttons</span>
              <div class="btn-group" style="margin-bottom: var(--space-6);">
                <button class="btn btn-primary">Save Changes</button>
                <button class="btn btn-secondary">Cancel</button>
              </div>

              <span class="form-label">Destructive &amp; Ghost</span>
              <div class="btn-group" style="margin-bottom: var(--space-6);">
                <button class="btn btn-danger">Delete Project</button>
                <button class="btn btn-ghost">Learn more</button>
              </div>

              <span class="form-label">States</span>
              <div class="btn-group">
                <button class="btn btn-primary" disabled aria-busy="true">
                  <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="animation: spin 1s linear infinite;" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                  Processing...
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="section-container" aria-labelledby="states-title">
          <h2 id="states-title" class="section-title">UI States</h2>
          <div class="grid grid-cols-3" style="align-items: stretch;">
            <div class="state-box">
              <svg class="state-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
              <h3 class="state-title">No projects found</h3>
              <p class="state-desc">Get started by creating a new project to orchestrate your tasks.</p>
              <button class="btn btn-primary">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                New Project
              </button>
            </div>

            <div class="state-box" style="border-style: solid; justify-content: flex-start; align-items: flex-start; text-align: left;" aria-busy="true" aria-label="Loading content">
              <div style="display: flex; gap: var(--space-4); width: 100%; margin-bottom: var(--space-6);">
                <div class="skeleton skeleton-avatar"></div>
                <div style="flex: 1; padding-top: 0.25rem;">
                  <div class="skeleton skeleton-text-lg"></div>
                  <div class="skeleton skeleton-text-sm"></div>
                </div>
              </div>
              <div class="skeleton skeleton-text-sm" style="width: 100%;"></div>
              <div class="skeleton skeleton-text-sm" style="width: 90%;"></div>
              <div class="skeleton skeleton-text-sm" style="width: 70%;"></div>
              <div style="margin-top: var(--space-8); width: 100%; display: flex; justify-content: center;">
                <div class="spinner" role="status" aria-label="Loading"></div>
              </div>
            </div>

            <div class="state-box" style="border-style: solid; background-color: var(--gray-50); justify-content: center;">
              <div class="alert" style="width: 100%; text-align: left; margin-bottom: var(--space-4);" role="alert">
                <svg class="alert-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                <div class="alert-content">
                  <div class="alert-title">Connection Error</div>
                  <div class="alert-desc">Failed to load data from Orchestra API. Please check your network connection.</div>
                </div>
              </div>
              <button class="btn btn-secondary">Retry Connection</button>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</body>
</html>
```

```css:.claude/worktrees/funny-aryabhata/docs/ui-ux/design-tokens.css
/**
 * Orchestra Design Tokens
 * ------------------------------------------------------------
 * 中間エージェント (imager / designer) で合意した UI トークンを
 * 1 ファイルに集約。Tailwind の theme.extend やグローバル CSS、
 * Storybook などから参照する想定。
 * ------------------------------------------------------------
 */

:root {
  /* ===== Color: Neutral ===== */
  --color-gray-50:  #f9fafb;
  --color-gray-100: #f3f4f6;
  --color-gray-200: #e5e7eb;
  --color-gray-300: #d1d5db;
  --color-gray-400: #9ca3af;
  --color-gray-500: #6b7280;
  --color-gray-600: #4b5563;
  --color-gray-700: #374151;
  --color-gray-800: #1f2937;
  --color-gray-900: #111827;

  /* ===== Color: Brand (Primary) ===== */
  --color-primary-50:  #eff6ff;
  --color-primary-100: #dbeafe;
  --color-primary-500: #3b82f6;
  --color-primary-600: #2563eb;
  --color-primary-700: #1d4ed8;

  /* ===== Color: Semantic ===== */
  --color-success-50:  #ecfdf5;
  --color-success-500: #10b981;
  --color-success-600: #059669;
  --color-warning-500: #f59e0b;
  --color-danger-50:   #fef2f2;
  --color-danger-100:  #fee2e2;
  --color-danger-500:  #ef4444;
  --color-danger-600:  #dc2626;
  --color-info-500:    #17a2b8;

  /* ===== Typography ===== */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI",
    Roboto, Helvetica, Arial, sans-serif;

  --font-size-xs:   0.75rem;   /* 12px */
  --font-size-sm:   0.875rem;  /* 14px */
  --font-size-base: 1rem;      /* 16px */
  --font-size-lg:   1.125rem;  /* 18px */
  --font-size-xl:   1.25rem;   /* 20px */
  --font-size-2xl:  1.5rem;    /* 24px */
  --font-size-3xl:  1.875rem;  /* 30px */
  --font-size-4xl:  2.25rem;   /* 36px */

  --font-weight-regular: 400;
  --font-weight-medium:  500;
  --font-weight-semibold:600;
  --font-weight-bold:    700;

  --line-height-tight:   1.25;
  --line-height-normal:  1.5;
  --line-height-relaxed: 1.75;

  /* ===== Spacing (8px grid) ===== */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* ===== Radius ===== */
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
  --radius-full: 9999px;

  /* ===== Elevation ===== */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow:    0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);

  /* ===== Motion ===== */
  --motion-fast:   120ms;
  --motion-normal: 200ms;
  --motion-slow:   320ms;
  --motion-ease:   cubic-bezier(0.4, 0, 0.2, 1);

  /* ===== Focus Ring ===== */
  --focus-ring: 0 0 0 3px var(--color-primary-100);
}

/* Reduced motion 配慮 */
@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-fast:   0.01ms;
    --motion-normal: 0.01ms;
    --motion-slow:   0.01ms;
  }
}
```

```markdown:.claude/worktrees/funny-aryabhata/docs/ui-ux/README.md
# UI/UX 改善方針 & 実装メモ

このディレクトリは、Leader AI オーケストレーション（ideaman → searcher → file-searcher →
researcher → planner → designer → imager → writer → coder）で合意した
**UI/UX 改善成果物** を集約したものです。

## 収録物

| ファイル | 役割 | 生成元ロール |
| --- | --- | --- |
| `showcase.html` | 再設計したコンポーネント／画面モック（単体で開いて確認可） | designer |
| `design-tokens.css` | 色・余白・影・タイポグラフィのデザイントークン定義 | imager + designer |
| `README.md` (本ファイル) | 改善方針と優先度、実装順、受け入れ基準 | planner + writer |

## 改善方針（要約）

1. **一貫性の向上** — Tailwind / CSS 変数でデザイントークンを一元化。
2. **UX の安定化** — Loading / Empty / Error 状態を標準コンポーネント化。
3. **アクセシビリティ** — WCAG 2.2 AA 準拠（コントラスト 4.5:1、focus ring、ARIA）。
4. **レスポンシブ** — 375px〜1280px の範囲で崩れないレイアウト。
5. **保守性** — Atomic Design 相当の階層で再利用可能なコンポーネントに分離。

## 優先度マトリクス

| 優先度 | 項目 | ゴール | 影響範囲 |
| :-- | :-- | :-- | :-- |
| 高 | デザイントークン定義 | 視覚的ノイズ低減／ダークモード準備 | 全画面 |
| 高 | Loading / Error / Empty 体験 | 非同期処理のフィードバック統一 | 非同期処理全般 |
| 中 | フォーム UX | バリデーション文言／エラー表示位置の統一 | 入力画面 |
| 中 | コンポーネント共通化 | 再利用性／保守性の向上 | 共有 UI 部品 |
| 低 | マイクロインタラクション | ホバー／遷移の心地よさ | インタラクション |

## 実装フェーズ

### Phase 1: 基盤整備
- `design-tokens.css` を `src/styles/` に取り込み、または `tailwind.config.js` の
  `theme.extend` にマッピング。
- 共通 Layout / Sidebar / Header をコンポーネント化。

### Phase 2: コア体験
- `<Spinner />`, `<Skeleton />`, `<EmptyState />`, `<Alert />` を実装。
- Next.js の `loading.tsx` / `error.tsx` / `not-found.tsx` を整備。

### Phase 3: 磨き込み
- `<Button />`, `<Input />`, `<Select />`, `<Modal />` の variant を整理。
- キーボード操作・ARIA 属性・フォーカストラップを検査。

## 受け入れ基準 (Acceptance Criteria)

- [ ] 主要ボタン／カード／入力フォームが共通デザインルールに従っている
- [ ] 非同期処理中は Spinner / Skeleton が表示される
- [ ] エラー時はクラッシュせず、理解可能な文言とリカバリ手段が提示される
- [ ] 375px〜1280px でレイアウト崩れが発生しない
- [ ] キーボードのみで主要操作が完結する
- [ ] コントラスト比 4.5:1 以上（本文テキスト）

## ブラウザで確認する

```bash
# macOS
open .claude/worktrees/funny-aryabhata/docs/ui-ux/showcase.html
```

## 後続アクション

- `showcase.html` のパターンを React / Next.js コンポーネントへ移植
- `design-tokens.css` を Tailwind config に同期（`theme.extend.colors` 等）
- Storybook を導入し、コンポーネントカタログとして育てる
```

上記 3 点を追加しました。既存の 3 ファイル（ESLint プラグイン / Codebase Guide / esbuild プレビュー）は UI/UX 改善と直接関係しないため編集していません。`showcase.html` は単体でブラウザに開いてレビュー可能、`design-tokens.css` は Tailwind/CSS へ移植する際の一次ソース、`README.md` は planner/writer の成果物を実装チーム向けに再整理したものです。