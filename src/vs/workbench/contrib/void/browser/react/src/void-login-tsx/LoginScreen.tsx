/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { useAccessor, useSettingsState, useIsDark } from '../util/services.js';
import { X, LogIn, UserPlus, CheckCircle2, Loader2 } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';

const CLERK_SIGN_IN_URL = 'https://accounts.he-ro.jp/sign-in';
const CLERK_SIGN_UP_URL = 'https://accounts.he-ro.jp/sign-up';

export const LoginScreen = ({ onClose }: { onClose: () => void }) => {
	const isDark = useIsDark();
	const accessor = useAccessor();
	const nativeHostService = accessor.get('INativeHostService');
	const clerkService = accessor.get('IClerkService');
	const settingsState = useSettingsState();
	const { isSignedIn, user } = useUser();

	const clerkUser = settingsState.globalSettings.clerkUser;

	// If signed in via Clerk SDK or already has clerkUser, close
	React.useEffect(() => {
		if (isSignedIn && user) {
			clerkService.setAuthState({
				id: user.id,
				fullName: user.fullName,
				primaryEmailAddress: user.primaryEmailAddress?.emailAddress || null,
				imageUrl: user.imageUrl,
				username: user.username,
			}, null);
			onClose();
		} else if (clerkUser) {
			onClose();
		}
	}, [isSignedIn, user, clerkUser, onClose]);

	const [browserOpened, setBrowserOpened] = useState(false);
	const [isChecking, setIsChecking] = useState(false);
	const [error, setError] = useState('');

	const openExternalLogin = async () => {
		try {
			await nativeHostService.openExternal(CLERK_SIGN_IN_URL);
			setBrowserOpened(true);
			setError('');
		} catch (e) {
			console.error('Failed to open external browser:', e);
			setError('ブラウザを開けませんでした。');
		}
	};

	const openExternalSignUp = async () => {
		try {
			await nativeHostService.openExternal(CLERK_SIGN_UP_URL);
			setBrowserOpened(true);
			setError('');
		} catch (e) {
			console.error('Failed to open external browser:', e);
			setError('ブラウザを開けませんでした。');
		}
	};

	const confirmLogin = async () => {
		setIsChecking(true);
		setError('');

		try {
			// Use ClerkService to fetch user info via Clerk Backend API (Node.js https, no CORS)
			const result = await clerkService.fetchLatestUser();

			if (!result) {
				setError('アクティブなセッションが見つかりません。ブラウザでログインしてから再度お試しください。');
				setIsChecking(false);
				return;
			}

			console.log('[Auth] Successfully authenticated:', result.user);
			setIsChecking(false);
			onClose();

		} catch (e: any) {
			console.error('[Auth] Error:', e);
			setError(`認証に失敗しました: ${e.message}`);
			setIsChecking(false);
		}
	};

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`}>
			<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100000] p-4">
				<div className="bg-void-bg-1 border border-void-border-1 rounded-xl shadow-2xl max-w-md w-full relative overflow-hidden flex flex-col items-center p-8 gap-6 animate-in fade-in zoom-in duration-300">

					<button
						onClick={onClose}
						className="absolute top-4 right-4 text-void-fg-3 hover:text-void-fg-1 p-1 rounded-md transition-colors"
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
							{!browserOpened
								? 'ブラウザでログインして、プロジェクトを同期しましょう。'
								: 'ブラウザでログインが完了したら、下のボタンを押してください。'
							}
						</p>
					</div>

					{!browserOpened ? (
						<div className="w-full flex flex-col gap-3">
							<button
								onClick={openExternalLogin}
								className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white text-sm font-semibold transition-all shadow-md"
							>
								<LogIn size={16} />
								ブラウザでログイン
							</button>
							<button
								onClick={openExternalSignUp}
								className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-void-bg-2 border border-void-border-2 text-void-fg-1 text-sm hover:bg-void-bg-3 transition-all"
							>
								<UserPlus size={16} />
								アカウントを作成
							</button>
							<div className="text-[10px] text-void-fg-3 text-center mt-1">
								accounts.he-ro.jp がブラウザで開きます
							</div>
						</div>
					) : (
						<div className="w-full flex flex-col gap-3">
							<div className="text-xs text-void-fg-3 bg-void-bg-2 rounded-lg p-3 border border-void-border-2">
								✅ ブラウザでサインインページを開きました。ログインが完了したら、下のボタンを押してください。
							</div>

							{error && (
								<div className="text-[11px] text-red-400">{error}</div>
							)}

							<button
								onClick={confirmLogin}
								disabled={isChecking}
								className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white text-sm font-semibold transition-all shadow-md disabled:opacity-50"
							>
								{isChecking ? (
									<><Loader2 size={16} className="animate-spin" /> 認証中...</>
								) : (
									<><CheckCircle2 size={16} /> ログイン完了</>
								)}
							</button>

							<button
								onClick={() => { setBrowserOpened(false); setError(''); }}
								className="text-xs text-void-fg-3 hover:text-void-fg-1 transition-colors"
							>
								← 戻る
							</button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
