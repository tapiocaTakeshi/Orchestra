/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { useAccessor, useIsDark, useSettingsState } from '../util/services.js';
import { X, LogIn, KeyRound, Loader2, ExternalLink } from 'lucide-react';
import { completeDivisionBrowserLogin } from './divisionAuth.js';

// ログインは Division の Web サイトで行う。ここではブラウザを開き、サイトからの
// orchestra://division-auth リダイレクト (divisionBrowserLoginService) を待つだけ。
type LoginPhase = 'idle' | 'waiting' | 'completing';

export const LoginScreen = ({ onClose }: { onClose: () => void }) => {
	const isDark = useIsDark();
	const accessor = useAccessor();
	const voidSettingsService = accessor.get('IVoidSettingsService');
	const browserLoginService = accessor.get('IDivisionBrowserLoginService');
	const settingsState = useSettingsState();

	const isLoggedIn = settingsState.globalSettings.isLoggedIn;

	const [phase, setPhase] = useState<LoginPhase>('idle');
	const [error, setError] = useState('');

	React.useEffect(() => {
		if (isLoggedIn) {
			onClose();
		}
	}, [isLoggedIn, onClose]);

	// 画面を閉じたら、待っていたログインは取り消す (古いタブからのリダイレクトを受け付けない)
	React.useEffect(() => () => browserLoginService.cancel(), [browserLoginService]);

	React.useEffect(() => {
		const listener = browserLoginService.onDidReceiveToken(async ({ tokenHash }) => {
			setPhase('completing');
			setError('');
			try {
				const result = await completeDivisionBrowserLogin(tokenHash);
				// Publish the account and both tokens together, after encrypted persistence.
				await voidSettingsService.setGlobalSettings({
					divisionUserId: result.userId,
					divisionUserEmail: result.email,
					divisionAccessToken: result.accessToken,
					divisionRefreshToken: result.refreshToken,
					divisionPlan: result.plan,
					divisionApiKey: result.accessToken,
					divisionUserApiKey: result.apiKey || '',
					isLoggedIn: true,
				});
				onClose();
			} catch (err: any) {
				console.error('Division browser login failed:', err);
				setError(err?.message || 'ログインに失敗しました。');
				setPhase('idle');
			}
		});
		return () => listener.dispose();
	}, [browserLoginService, voidSettingsService, onClose]);

	// Esc でも閉じられるようにする (セッション交換中は途中で閉じない)。
	React.useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && phase !== 'completing') {
				e.stopPropagation();
				onClose();
			}
		};
		window.addEventListener('keydown', onKeyDown, true);
		return () => window.removeEventListener('keydown', onKeyDown, true);
	}, [onClose, phase]);

	const openBrowserLogin = async () => {
		setError('');
		try {
			await browserLoginService.start();
			setPhase('waiting');
		} catch (err: any) {
			setError(err?.message || 'ブラウザを開けませんでした。');
		}
	};

	const cancelWaiting = () => {
		browserLoginService.cancel();
		setPhase('idle');
	};

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`}>
			<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100000] p-4">
				<div className="bg-void-bg-1 border border-void-border-1 rounded-xl shadow-2xl max-w-md w-full relative overflow-hidden flex flex-col items-center p-8 gap-6 animate-in fade-in zoom-in duration-300">

					<button
						onClick={onClose}
						disabled={phase === 'completing'}
						className="absolute top-4 right-4 text-void-fg-3 hover:text-void-fg-1 p-1 rounded-md transition-colors"
						type="button"
						aria-label="閉じる"
						title="閉じる"
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
							Division アカウントでログインします。ログインはブラウザ（Division の Web サイト）で行います。
						</p>
					</div>

					<div className="w-full flex flex-col gap-3">
						{phase === 'idle' && (
							<button
								type="button"
								onClick={openBrowserLogin}
								className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white text-sm font-semibold transition-all shadow-md"
							>
								<LogIn size={16} />
								ブラウザでログイン
								<ExternalLink size={14} className="opacity-80" />
							</button>
						)}

						{phase === 'waiting' && (
							<>
								<div className="text-xs text-void-fg-2 bg-void-bg-2 border border-void-border-2 rounded-md px-3 py-2.5 flex items-start gap-2">
									<Loader2 size={14} className="animate-spin flex-shrink-0 mt-0.5" />
									<span>
										ブラウザで Division にログインし、「Orchestra にログイン」を押してください。完了すると自動で Orchestra に戻ります。
									</span>
								</div>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={openBrowserLogin}
										className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-void-border-2 text-xs text-void-fg-2 hover:bg-void-bg-3 transition-colors"
									>
										<ExternalLink size={12} />
										ブラウザをもう一度開く
									</button>
									<button
										type="button"
										onClick={cancelWaiting}
										className="flex-1 px-3 py-2 rounded-md border border-void-border-2 text-xs text-void-fg-3 hover:bg-void-bg-3 transition-colors"
									>
										キャンセル
									</button>
								</div>
							</>
						)}

						{phase === 'completing' && (
							<div className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-void-bg-2 border border-void-border-2 text-sm text-void-fg-2">
								<Loader2 size={16} className="animate-spin" />
								ログイン中…
							</div>
						)}

						{error && (
							<div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1.5">
								{error}
							</div>
						)}

						<div className="text-[10px] text-void-fg-3 text-center mt-1 inline-flex items-center justify-center gap-1">
							<KeyRound size={10} />
							アカウントの新規登録もブラウザで行えます。Plus プランのみ API キーが自動設定されます
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};
