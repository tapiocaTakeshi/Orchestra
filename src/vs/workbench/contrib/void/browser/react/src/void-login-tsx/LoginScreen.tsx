/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { useAccessor, useIsDark, useSettingsState } from '../util/services.js';
import { X, LogIn, UserPlus, KeyRound, Loader2 } from 'lucide-react';
import { signInWithDivision } from './divisionAuth.js';

const SIGN_UP_URL = 'https://division.he-ro.jp/signup';

export const LoginScreen = ({ onClose }: { onClose: () => void }) => {
	const isDark = useIsDark();
	const accessor = useAccessor();
	const nativeHostService = accessor.get('INativeHostService');
	const voidSettingsService = accessor.get('IVoidSettingsService');
	const settingsState = useSettingsState();

	const isLoggedIn = settingsState.globalSettings.isLoggedIn;

	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');

	React.useEffect(() => {
		if (isLoggedIn) {
			onClose();
		}
	}, [isLoggedIn, onClose]);

	const openExternalSignUp = async () => {
		try {
			await nativeHostService.openExternal(SIGN_UP_URL);
		} catch (e) {
			console.error('Failed to open external browser:', e);
			setError('ブラウザを開けませんでした。');
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (submitting) return;

		setError('');

		if (!email.trim() || !password) {
			setError('メールアドレスとパスワードを入力してください。');
			return;
		}

		setSubmitting(true);
		try {
			const result = await signInWithDivision(email.trim(), password);
			voidSettingsService.setGlobalSetting('divisionUserId', result.userId);
			voidSettingsService.setGlobalSetting('divisionUserEmail', result.email);
			voidSettingsService.setGlobalSetting('divisionAccessToken', result.accessToken);
			voidSettingsService.setGlobalSetting('divisionRefreshToken', result.refreshToken);
			voidSettingsService.setGlobalSetting('divisionApiKey', result.apiKey);
			voidSettingsService.setGlobalSetting('isLoggedIn', true);
			onClose();
		} catch (err: any) {
			console.error('Division sign-in failed:', err);
			setError(err?.message || 'ログインに失敗しました。');
		} finally {
			setSubmitting(false);
		}
	};

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
							src={new URL('../assets/orchestra_logo.png', import.meta.url).href}
							alt="Orchestra Logo"
							style={{ maxWidth: '80px', opacity: 0.85 }}
						/>
						<h1 className="text-2xl font-bold bg-gradient-to-r from-[#dc2626] to-red-400 bg-clip-text text-transparent">
							Welcome to Orchestra
						</h1>
						<p className="text-sm text-void-fg-3">
							Division アカウントでログインすると、API キーが自動で同期されます。
						</p>
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
								autoComplete="current-password"
								className="w-full px-3 py-2 rounded-md bg-void-bg-2 border border-void-border-2 text-void-fg-1 text-sm focus:outline-none focus:border-[#dc2626] transition-colors"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								disabled={submitting}
								placeholder="••••••••"
							/>
						</label>

						{error && (
							<div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1.5">
								{error}
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
									ログイン中…
								</>
							) : (
								<>
									<LogIn size={16} />
									ログイン
								</>
							)}
						</button>

						<button
							type="button"
							onClick={openExternalSignUp}
							disabled={submitting}
							className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-void-bg-2 border border-void-border-2 text-void-fg-1 text-sm hover:bg-void-bg-3 transition-all"
						>
							<UserPlus size={16} />
							アカウントを作成
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
