// =========================================================
// Orchestra — client-side auth store (demo)
// ユーザー情報とセッションは localStorage にのみ保存されます。
// =========================================================
(() => {
  const USERS_KEY = 'orchestra-users';
  const SESSION_KEY = 'orchestra-session';

  const readJSON = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const hash = async (text) => {
    if (globalThis.crypto?.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // crypto.subtle が使えない環境向けの簡易フォールバック
    let h = 0;
    for (const ch of text) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return 'fallback-' + h.toString(16);
  };

  const OrchestraAuth = {
    normalizeEmail: (email) => String(email ?? '').trim().toLowerCase(),

    getUsers: () => readJSON(USERS_KEY, []),

    findUser(email) {
      const normalized = this.normalizeEmail(email);
      return this.getUsers().find(u => u.email === normalized) ?? null;
    },

    async signup({ name, email, password }) {
      const normalized = this.normalizeEmail(email);
      if (this.findUser(normalized)) {
        return { ok: false, error: 'このメールアドレスは既に登録されています。' };
      }
      const users = this.getUsers();
      users.push({ name: String(name ?? '').trim(), email: normalized, passwordHash: await hash(password) });
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      this.setSession(normalized);
      return { ok: true };
    },

    async login({ email, password }) {
      const user = this.findUser(email);
      if (!user || user.passwordHash !== await hash(password)) {
        return { ok: false, error: 'メールアドレスまたはパスワードが正しくありません。' };
      }
      this.setSession(user.email);
      return { ok: true };
    },

    setSession(email) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ email, loginAt: Date.now() }));
    },

    currentUser() {
      const session = readJSON(SESSION_KEY, null);
      return session ? this.findUser(session.email) : null;
    },

    logout() {
      localStorage.removeItem(SESSION_KEY);
    },
  };

  globalThis.OrchestraAuth = OrchestraAuth;

  // ---- ヘッダーへのログイン状態反映 (data-auth-slot を持つページのみ) ----
  const slot = document.querySelector('[data-auth-slot]');
  if (slot) {
    const user = OrchestraAuth.currentUser();
    if (user) {
      const displayName = user.name || user.email.split('@')[0];
      slot.innerHTML = `
        <span class="user-chip" title="${user.email}">
          <span class="user-avatar" aria-hidden="true">${displayName.slice(0, 1).toUpperCase()}</span>
          <span class="user-name"></span>
        </span>
        <button class="btn btn-ghost btn-sm" id="logoutBtn" type="button">ログアウト</button>`;
      slot.querySelector('.user-name').textContent = displayName;
      slot.querySelector('#logoutBtn').addEventListener('click', () => {
        OrchestraAuth.logout();
        location.reload();
      });
    } else {
      slot.innerHTML = '<a class="btn btn-ghost btn-sm" href="./login.html">ログイン</a>';
    }
  }
})();
