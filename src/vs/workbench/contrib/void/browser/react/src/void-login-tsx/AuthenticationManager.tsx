/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import { useAccessor, useSettingsState } from '../util/services.js';
import { LoginScreen } from './LoginScreen.js';
import { OnboardingFlow } from './OnboardingFlow.js';
import { useInstallationDetection } from './useInstallationDetection.js';

type AuthFlowState = 'onboarding' | 'login' | 'authenticated' | 'loading';

/**
 * AuthenticationManager: 認証フロー全体を管理
 *
 * フロー:
 * 1. インストール状態を検出
 * 2. 新規インストール: オンボーディング画面を表示 → ログイン画面
 * 3. 既存ユーザー: ログイン画面を表示
 * 4. 認証済み: アプリケーション本体を表示
 */
export const AuthenticationManager = ({ onAuthenticationComplete }: { onAuthenticationComplete: () => void }) => {
	const settingsState = useSettingsState();
	const [authFlowState, setAuthFlowState] = useState<AuthFlowState>('loading');
	const { shouldShowOnboarding, installationInfo, markInstallationComplete } = useInstallationDetection();

	const isLoggedIn = settingsState.globalSettings.isLoggedIn;

	useEffect(() => {
		// 認証状態に基づいて状態を更新
		if (isLoggedIn) {
			setAuthFlowState('authenticated');
			onAuthenticationComplete();
		} else if (shouldShowOnboarding) {
			setAuthFlowState('onboarding');
		} else {
			setAuthFlowState('login');
		}
	}, [isLoggedIn, shouldShowOnboarding, onAuthenticationComplete]);

	const handleOnboardingComplete = () => {
		markInstallationComplete();
		setAuthFlowState('login');
	};

	if (authFlowState === 'loading') {
		return null; // ローディング中は何も表示しない
	}

	if (authFlowState === 'onboarding') {
		return (
			<OnboardingFlow onComplete={handleOnboardingComplete} />
		);
	}

	if (authFlowState === 'login') {
		return (
			<LoginScreen onClose={() => {
				// ログイン完了後はコールバックがtrueに変わるまで待つ
			}} />
		);
	}

	// authFlowState === 'authenticated' の場合は何も表示しない
	return null;
};
