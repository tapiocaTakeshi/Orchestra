/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { useAccessor, useSettingsState, useIsDark } from '../util/services.js';
import { X, ExternalLink, CheckCircle2, Mail } from 'lucide-react';

const CLERK_SIGN_IN_URL = 'https://neat-snake-39.accounts.dev/sign-in';
const CLERK_SIGN_UP_URL = 'https://neat-snake-39.accounts.dev/sign-up';

export const LoginScreen = ({ onClose }: { onClose: () => void }) => {
	const isDark = useIsDark();
	const accessor = useAccessor();
	const nativeHostService = accessor.get('INativeHostService');
	const settingsService = accessor.get('IVoidSettingsService');
	const settingsState = useSettingsState();

	const clerkUser = settingsState.globalSettings.clerkUser;

	// If already signed in, close the screen
	React.useEffect(() => {
		if (clerkUser) {
			onClose();
		}
	}, [clerkUser, onClose]);

	const [emailInput, setEmailInput] = useState('');
	const [nameInput, setNameInput] = useState('');
	const [error, setError] = useState('');
	const [step, setStep] = useState<'initial' | 'confirm'>('initial');

	const openExternalLogin = async () => {
		try {
			await nativeHostService.openExternal(CLERK_SIGN_IN_URL);
			setStep('confirm');
		} catch (e) {
			console.error('Failed to open external browser:', e);
			setError('Failed to open browser. Please copy the URL and open it manually.');
		}
	};

	const openExternalSignUp = async () => {
		try {
			await nativeHostService.openExternal(CLERK_SIGN_UP_URL);
			setStep('confirm');
		} catch (e) {
			console.error('Failed to open external browser:', e);
			setError('Failed to open browser. Please copy the URL and open it manually.');
		}
	};

	const confirmSignIn = async () => {
		if (!emailInput.trim()) {
			setError('Please enter the email address you used to sign in.');
			return;
		}

		// Basic email validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(emailInput.trim())) {
			setError('Please enter a valid email address.');
			return;
		}

		setError('');

		// Store the user info from manual entry
		await settingsService.setGlobalSetting('clerkUser', {
			id: 'user_' + Date.now(),
			fullName: nameInput.trim() || null,
			primaryEmailAddress: emailInput.trim(),
			imageUrl: null,
			username: emailInput.trim().split('@')[0],
		});
		await settingsService.setGlobalSetting('clerkSessionId', 'external_' + Date.now());
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
							{step === 'initial'
								? 'Sign in to sync your projects and access shared AI configurations.'
								: 'After signing in on the browser, confirm your account below.'
							}
						</p>
					</div>

					{step === 'initial' ? (
						<div className="w-full flex flex-col gap-3">
							<button
								onClick={openExternalLogin}
								className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white text-sm font-semibold transition-all shadow-md"
							>
								<ExternalLink size={16} />
								Sign In with Browser
							</button>
							<button
								onClick={openExternalSignUp}
								className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-void-bg-2 border border-void-border-2 text-void-fg-1 text-sm hover:bg-void-bg-3 transition-all"
							>
								Create an Account
							</button>
							<div className="text-[10px] text-void-fg-3 text-center mt-1">
								Opens in your default browser for secure authentication
							</div>
						</div>
					) : (
						<div className="w-full flex flex-col gap-3">
							<div className="text-xs text-void-fg-3 bg-void-bg-2 rounded-lg p-3 border border-void-border-2">
								✅ A sign-in page has been opened in your browser. After completing sign-in, enter your details below to connect.
							</div>
							<div className="flex flex-col gap-1.5">
								<label className="text-xs font-medium text-void-fg-2 flex items-center gap-1.5">
									<Mail size={12} />
									Email Address
								</label>
								<input
									type="email"
									value={emailInput}
									onChange={(e) => { setEmailInput(e.target.value); setError(''); }}
									onKeyDown={(e) => { if (e.key === 'Enter') confirmSignIn(); }}
									placeholder="Enter the email you signed in with..."
									className="w-full px-3 py-2 rounded-lg bg-void-bg-2 border border-void-border-2 text-void-fg-1 text-sm placeholder:text-void-fg-3 focus:outline-none focus:border-[#dc2626] transition-colors"
									autoFocus
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<label className="text-xs font-medium text-void-fg-2">
									Name (optional)
								</label>
								<input
									type="text"
									value={nameInput}
									onChange={(e) => setNameInput(e.target.value)}
									onKeyDown={(e) => { if (e.key === 'Enter') confirmSignIn(); }}
									placeholder="Your display name..."
									className="w-full px-3 py-2 rounded-lg bg-void-bg-2 border border-void-border-2 text-void-fg-1 text-sm placeholder:text-void-fg-3 focus:outline-none focus:border-[#dc2626] transition-colors"
								/>
							</div>
							{error && (
								<div className="text-[11px] text-red-400">{error}</div>
							)}
							<button
								onClick={confirmSignIn}
								className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white text-sm font-semibold transition-all shadow-md"
							>
								<CheckCircle2 size={16} /> Connect Account
							</button>
							<button
								onClick={() => setStep('initial')}
								className="text-xs text-void-fg-3 hover:text-void-fg-1 transition-colors"
							>
								← Back
							</button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
