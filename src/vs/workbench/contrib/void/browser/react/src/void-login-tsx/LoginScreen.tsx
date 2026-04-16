/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { useAccessor, useIsDark, useSettingsState } from '../util/services.js';
import { X, LogIn, UserPlus, CheckCircle2 } from 'lucide-react';

const SIGN_IN_URL = 'https://division.he-ro.jp/login';
const SIGN_UP_URL = 'https://division.he-ro.jp/signup';

export const LoginScreen = ({ onClose }: { onClose: () => void }) => {
	const isDark = useIsDark();
	const accessor = useAccessor();
	const nativeHostService = accessor.get('INativeHostService');
	const voidSettingsService = accessor.get('IVoidSettingsService');
	const settingsState = useSettingsState();

	const isLoggedIn = settingsState.globalSettings.isLoggedIn;

	const [browserOpened, setBrowserOpened] = useState(false);
	const [error, setError] = useState('');

	React.useEffect(() => {
		if (isLoggedIn) {
			onClose();
		}
	}, [isLoggedIn, onClose]);

	const openExternalLogin = async () => {
		try {
			await nativeHostService.openExternal(SIGN_IN_URL);
			setBrowserOpened(true);
			setError('');
		} catch (e) {
			console.error('Failed to open external browser:', e);
			setError('ブラウザを開けませんでした。');
		}
	};

	const openExternalSignUp = async () => {
		try {
			await nativeHostService.openExternal(SIGN_UP_URL);
			setBrowserOpened(true);
			setError('');
		} catch (e) {
			console.error('Failed to open external browser:', e);
			setError('ブラウザを開けませんでした。');
		}
	};

	const confirmLogin = () => {
		voidSettingsService.setGlobalSetting('isLoggedIn', true);
		onClose();
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

							{error && (
								<div className="text-[11px] text-red-400">{error}</div>
							)}

							<div className="text-[10px] text-void-fg-3 text-center mt-1">
								division.he-ro.jp がブラウザで開きます
							</div>
						</div>
					) : (
						<div className="w-full flex flex-col gap-3">
							<div className="text-xs text-void-fg-3 bg-void-bg-2 rounded-lg p-3 border border-void-border-2">
								ブラウザでサインインページを開きました。ログインが完了したら、下のボタンを押してください。
							</div>

							<button
								onClick={confirmLogin}
								className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white text-sm font-semibold transition-all shadow-md"
							>
								<CheckCircle2 size={16} /> ログイン完了
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
