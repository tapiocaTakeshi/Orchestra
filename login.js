// =========================================================
// Orchestra — login page interactions
// =========================================================
(() => {
  const Auth = globalThis.OrchestraAuth;

  // 既にログイン済みならトップへ
  if (Auth.currentUser()) {
    location.replace('./index.html');
    return;
  }

  const tabLogin = document.getElementById('tabLogin');
  const tabSignup = document.getElementById('tabSignup');
  const title = document.getElementById('authTitle');
  const sub = document.getElementById('authSub');
  const alertBox = document.getElementById('authAlert');
  const form = document.getElementById('authForm');
  const submit = document.getElementById('authSubmit');
  const nameField = document.getElementById('nameField');
  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const errors = {
    name: document.getElementById('nameError'),
    email: document.getElementById('emailError'),
    password: document.getElementById('passwordError'),
  };

  let mode = 'login';

  const setMode = (next) => {
    mode = next;
    const isLogin = mode === 'login';
    tabLogin.classList.toggle('is-active', isLogin);
    tabSignup.classList.toggle('is-active', !isLogin);
    tabLogin.setAttribute('aria-selected', String(isLogin));
    tabSignup.setAttribute('aria-selected', String(!isLogin));
    title.textContent = isLogin ? 'おかえりなさい。' : 'はじめまして。';
    sub.textContent = isLogin
      ? 'Orchestra アカウントにログインしてください。'
      : '数秒で完了します。AI の楽団と開発を始めましょう。';
    submit.textContent = isLogin ? 'ログイン' : 'アカウントを作成';
    nameField.hidden = isLogin;
    passwordInput.setAttribute('autocomplete', isLogin ? 'current-password' : 'new-password');
    hideAlert();
    Object.values(errors).forEach(el => { el.hidden = true; });
  };

  tabLogin.addEventListener('click', () => setMode('login'));
  tabSignup.addEventListener('click', () => setMode('signup'));

  // ---- パスワード表示切り替え ----
  const toggle = document.getElementById('passwordToggle');
  toggle.addEventListener('click', () => {
    const show = passwordInput.type === 'password';
    passwordInput.type = show ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(show));
    toggle.setAttribute('aria-label', show ? 'パスワードを隠す' : 'パスワードを表示');
  });

  const showAlert = (message) => {
    alertBox.textContent = message;
    alertBox.hidden = false;
  };
  const hideAlert = () => { alertBox.hidden = true; };

  const validate = () => {
    let ok = true;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value.trim());
    errors.email.hidden = emailOk;
    if (!emailOk) ok = false;

    const passwordOk = passwordInput.value.length >= 8;
    errors.password.hidden = passwordOk;
    if (!passwordOk) ok = false;

    if (mode === 'signup') {
      const nameOk = nameInput.value.trim().length > 0;
      errors.name.hidden = nameOk;
      if (!nameOk) ok = false;
    }
    return ok;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();
    if (!validate()) return;

    submit.disabled = true;
    try {
      const payload = {
        name: nameInput.value,
        email: emailInput.value,
        password: passwordInput.value,
      };
      const result = mode === 'login' ? await Auth.login(payload) : await Auth.signup(payload);
      if (result.ok) {
        location.href = './index.html';
      } else {
        showAlert(result.error);
      }
    } finally {
      submit.disabled = false;
    }
  });
})();
