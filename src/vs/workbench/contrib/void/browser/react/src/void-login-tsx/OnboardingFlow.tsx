/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { useAccessor, useIsDark } from '../util/services.js';
import { CheckCircle2, Download, LogIn, ChevronRight } from 'lucide-react';
import { completeFirstLaunch, getInstallationInfo } from './installationFlow.js';

export const OnboardingFlow = ({ onComplete }: { onComplete: () => void }) => {
	const isDark = useIsDark();
	const accessor = useAccessor();
	const voidSettingsService = accessor.get('IVoidSettingsService');

	const [step, setStep] = useState<'welcome' | 'install' | 'login-ready'>('welcome');
	const installInfo = getInstallationInfo();

	const handleInstallComplete = () => {
		setStep('install');
	};

	const handleReadyForLogin = () => {
		setStep('login-ready');
		completeFirstLaunch();
		// ログイン画面は別のコンポーネントが表示するため、ここではコールバックを実行
		onComplete();
	};

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`}>
			<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100000] p-4">
				<div className="bg-void-bg-1 border border-void-border-1 rounded-xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col p-8 gap-6 animate-in fade-in zoom-in duration-300">

					{step === 'welcome' && (
						<>
							<div className="text-center flex flex-col items-center gap-3">
								<img
									src={new URL('../assets/orchestra_icon_nonbackground.png', import.meta.url).href}
									alt="Orchestra Logo"
									style={{ maxWidth: '80px', opacity: 0.85 }}
								/>
								<h1 className="text-2xl font-bold bg-gradient-to-r from-[#dc2626] to-red-400 bg-clip-text text-transparent">
									Orchestra をインストール
								</h1>
								<p className="text-sm text-void-fg-3 leading-relaxed">
									{installInfo?.installationSource === 'division-website'
										? 'division.he-ro.jp からのインストールが検出されました。'
										: 'Orchestraへようこそ！'
									}
								</p>
							</div>

							<div className="space-y-3">
								<div className="flex items-start gap-3 p-3 rounded-lg bg-void-bg-2 border border-void-border-2">
									<CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0 mt-0.5" />
									<div className="flex-1">
										<h3 className="text-sm font-semibold text-void-fg-1">インストール完了</h3>
										<p className="text-xs text-void-fg-3 mt-1">Orchestra が正常にインストールされました</p>
									</div>
								</div>

								<div className="flex items-start gap-3 p-3 rounded-lg bg-void-bg-2 border border-void-border-2">
									<Download size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
									<div className="flex-1">
										<h3 className="text-sm font-semibold text-void-fg-1">Division API 連携</h3>
										<p className="text-xs text-void-fg-3 mt-1">マルチエージェント オーケストレーション API に接続</p>
									</div>
								</div>

								<div className="flex items-start gap-3 p-3 rounded-lg bg-void-bg-2 border border-void-border-2">
									<LogIn size={20} className="text-purple-400 flex-shrink-0 mt-0.5" />
									<div className="flex-1">
										<h3 className="text-sm font-semibold text-void-fg-1">ログイン</h3>
										<p className="text-xs text-void-fg-3 mt-1">Division アカウントでサインイン</p>
									</div>
								</div>
							</div>

							<button
								onClick={handleInstallComplete}
								className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white text-sm font-semibold transition-all shadow-md"
							>
								次へ進む
								<ChevronRight size={16} />
							</button>
						</>
					)}

					{step === 'install' && (
						<>
							<div className="text-center flex flex-col items-center gap-3">
								<div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
									<CheckCircle2 size={32} className="text-emerald-400" />
								</div>
								<h2 className="text-xl font-bold text-void-fg-1">セットアップ完了</h2>
								<p className="text-sm text-void-fg-3">
									Orchestra の準備ができました。
									<br />
									Division アカウントでログインしてください。
								</p>
							</div>

							<div className="bg-void-bg-2 border border-void-border-2 rounded-lg p-4 space-y-2">
								<h3 className="text-sm font-semibold text-void-fg-1">次のステップ：</h3>
								<ul className="text-xs text-void-fg-3 space-y-2">
									<li className="flex items-start gap-2">
										<span className="text-[#dc2626] font-bold">1.</span>
										<span>Division アカウントをお持ちでない方は、新規登録してください</span>
									</li>
									<li className="flex items-start gap-2">
										<span className="text-[#dc2626] font-bold">2.</span>
										<span>Plus プランで自動的に API キーが設定されます</span>
									</li>
									<li className="flex items-start gap-2">
										<span className="text-[#dc2626] font-bold">3.</span>
										<span>マルチエージェント AI の力を活用開始</span>
									</li>
								</ul>
							</div>

							<button
								onClick={handleReadyForLogin}
								className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white text-sm font-semibold transition-all shadow-md"
							>
								ログイン画面へ
								<ChevronRight size={16} />
							</button>
						</>
					)}
				</div>
			</div>
		</div>
	);
};
