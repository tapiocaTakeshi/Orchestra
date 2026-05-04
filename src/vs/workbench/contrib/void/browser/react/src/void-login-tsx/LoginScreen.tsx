/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { useAccessor, useIsDark, useSettingsState } from '../util/services.js';
import { X, LogIn, UserPlus, KeyRound, Loader2, Mail } from 'lucide-react';
import { signInWithDivision, signUpWithDivision } from './divisionAuth.js';

type AuthMode = 'login' | 'signup';

export const LoginScreen = ({ onClose }: { onClose: () => void }) => {
	const isDark = useIsDark();
	const accessor = useAccessor();
	const voidSettingsService = accessor.get('IVoidSettingsService');
	const settingsState = useSettingsState();

	const isLoggedIn = settingsState.globalSettings.isLoggedIn;

	const [mode, setMode] = useState<AuthMode>('login');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [passwordConfirm, setPasswordConfirm] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');
	const [info, setInfo] = useState('');

	React.useEffect(() => {
		if (isLoggedIn) {
			onClose();
		}
	}, [isLoggedIn, onClose]);

	const switchMode = (next: AuthMode) => {
		if (submitting || mode === next) return;
		setMode(next);
		setError('');
		setInfo('');
		setPasswordConfirm('');
	};

	const persistAuthResult = (result: {
		userId: string;
		email: string;
		accessToken: string;
		refreshToken: string;
		apiKey: string;
	}) => {
		voidSettingsService.setGlobalSetting('divisionUserId', result.userId);
		voidSettingsService.setGlobalSetting('divisionUserEmail', result.email);
		voidSettingsService.setGlobalSetting('divisionAccessToken', result.accessToken);
		voidSettingsService.setGlobalSetting('divisionRefreshToken', result.refreshToken);
		voidSettingsService.setGlobalSetting('divisionApiKey', result.apiKey);
		voidSettingsService.setGlobalSetting('isLoggedIn', true);
	};

	const handleLogin = async () => {
		const result = await signInWithDivision(email.trim(), password);
		persistAuthResult(result);
		onClose();
	};

	const handleSignUp = async () => {
		if (password !== passwordConfirm) {
			throw new Error('パスワードが一致しません。');
		}
		if (password.length < 6) {
			throw new Error('パスワードは 6 文字以上で設定してください。');
		}
		const res = await signUpWithDivision(email.trim(), password);
		if (res.kind === 'signedIn') {
			persistAuthResult(res.auth);
			onClose();
			return;
		}
		// needsEmailConfirmation: 画面はそのまま、案内を表示してログインタブに戻す
		setInfo(`${res.email} に確認メールを送信しました。メール内のリンクで認証を完了してから「ログイン」タブから再度サインインしてください。`);
		setMode('login');
		setPassword('');
		setPasswordConfirm('');
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (submitting) return;

		setError('');
		setInfo('');

		if (!email.trim() || !password) {
			setError('メールアドレスとパスワードを入力してください。');
			return;
		}

		setSubmitting(true);
		try {
			if (mode === 'login') {
				await handleLogin();
			} else {
				await handleSignUp();
			}
		} catch (err: any) {
			console.error(`Division ${mode} failed:`, err);
			const fallback = mode === 'login' ? 'ログインに失敗しました。' : 'アカウント作成に失敗しました。';
			setError(err?.message || fallback);
		} finally {
			setSubmitting(false);
		}
	};

	const isLogin = mode === 'login';

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`}>
			<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100000] p-4">
				<div className="bg-void-bg-1 border border-void-border-1 rounded-xl shadow-2xl max-w-md w-full relative overflow-hidden flex flex-col items-center p-8 gap-6 animate-in fade-in zoom-in duration-300">

					<button
						onClick={onClose}
						className="absolute top-4 right-4 text-void-fg-3 hover:text-void-fg-1 p-1 rounded-md transition-colors"
						type="button"
					>
						<X size={20} />
					</button>

					<div className="text-center flex flex-col items-center gap-2">
						<img
							src={new URL('../assets/orchestra_icon_nonbackground.png', import.meta.url).href}
							alt="Orchestra Logo"
							style={{ maxWidth: '80px', opacity: 0.85 }}
						/>
						<h1 className="text-2xl font-bold bg-gradient-to-r from-[#dc2626] to-red-400 bg-clip-text text-transparent">
							Welcome to Orchestra
						</h1>
						<p className="text-sm text-void-fg-3">
							{isLogin
								? 'Division アカウントでログインすると、API キーが自動で同期されます。'
								: '新しい Division アカウントを作成して、API キーを自動発行します。'}
						</p>
					</div>

					{/* Login / Sign Up タブ切替 */}
					<div className="w-full inline-flex rounded-lg border border-void-border-2 bg-void-bg-2 p-1">
						<button
							type="button"
							onClick={() => switchMode('login')}
							disabled={submitting}
							className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
								isLogin
									? 'bg-[#dc2626] text-white shadow-sm'
									: 'text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-3'
							}`}
						>
							<LogIn size={13} />
							ログイン
						</button>
						<button
							type="button"
							onClick={() => switchMode('signup')}
							disabled={submitting}
							className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
								!isLogin
									? 'bg-[#dc2626] text-white shadow-sm'
									: 'text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-3'
							}`}
						>
							<UserPlus size={13} />
							新規登録
						</button>
					</div>

					<form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
						<label className="flex flex-col gap-1 text-xs text-void-fg-2">
							メールアドレス
							<input
								type="email"
								autoComplete="email"
								className="w-full px-3 py-2 rounded-md bg-void-bg-2 border border-void-border-2 text-void-fg-1 text-sm focus:outline-none focus:border-[#dc2626] transition-colors"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								disabled={submitting}
								placeholder="you@example.com"
							/>
						</label>

						<label className="flex flex-col gap-1 text-xs text-void-fg-2">
							パスワード
							<input
								type="password"
								autoComplete={isLogin ? 'current-password' : 'new-password'}
								className="w-full px-3 py-2 rounded-md bg-void-bg-2 border border-void-border-2 text-void-fg-1 text-sm focus:outline-none focus:border-[#dc2626] transition-colors"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								disabled={submitting}
								placeholder={isLogin ? '••••••••' : '6 文字以上'}
							/>
						</label>

						{!isLogin && (
							<label className="flex flex-col gap-1 text-xs text-void-fg-2">
								パスワード（確認）
								<input
									type="password"
									autoComplete="new-password"
									className="w-full px-3 py-2 rounded-md bg-void-bg-2 border border-void-border-2 text-void-fg-1 text-sm focus:outline-none focus:border-[#dc2626] transition-colors"
									value={passwordConfirm}
									onChange={(e) => setPasswordConfirm(e.target.value)}
									disabled={submitting}
									placeholder="同じパスワードを再入力"
								/>
							</label>
						)}

						{error && (
							<div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1.5">
								{error}
							</div>
						)}

						{info && (
							<div className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-2 py-1.5 flex items-start gap-1.5">
								<Mail size={12} className="flex-shrink-0 mt-0.5" />
								<span>{info}</span>
							</div>
						)}

						<button
							type="submit"
							disabled={submitting}
							className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-md"
						>
							{submitting ? (
								<>
									<Loader2 size={16} className="animate-spin" />
									{isLogin ? 'ログイン中…' : 'アカウント作成中…'}
								</>
							) : (
								<>
									{isLogin ? <LogIn size={16} /> : <UserPlus size={16} />}
									{isLogin ? 'ログイン' : 'アカウントを作成'}
								</>
							)}
						</button>

						<div className="text-[10px] text-void-fg-3 text-center mt-1 inline-flex items-center justify-center gap-1">
							<KeyRound size={10} />
							API キーは Division Supabase から自動取得されます
						</div>
					</form>
				</div>
			</div>
		</div>
	);
};
