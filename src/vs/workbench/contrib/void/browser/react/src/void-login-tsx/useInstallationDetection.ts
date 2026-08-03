/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useEffect, useState } from 'react';
import {
	getInstallationInfo,
	markAsInstalled,
	extractInstallationSourceFromURL,
	completeFirstLaunch,
	reportInstallationToDivision,
	type InstallationInfo,
} from './installationFlow.js';

export type InstallationState = 'uninitialized' | 'new-installation' | 'returning-user';

interface UseInstallationDetectionResult {
	installationState: InstallationState;
	installationInfo: InstallationInfo | null;
	shouldShowOnboarding: boolean;
	markInstallationComplete: () => void;
}

export const useInstallationDetection = (): UseInstallationDetectionResult => {
	const [installationState, setInstallationState] = useState<InstallationState>('uninitialized');
	const [installationInfo, setInstallationInfo] = useState<InstallationInfo | null>(null);

	useEffect(() => {
		const detectInstallation = () => {
			const existingInfo = getInstallationInfo();

			if (existingInfo) {
				// 既にインストール情報がある場合
				setInstallationInfo(existingInfo);
				setInstallationState(existingInfo.isFirstLaunch ? 'new-installation' : 'returning-user');
			} else {
				// 新規インストール
				const source = extractInstallationSourceFromURL();
				const appVersion = (window as any).__ORCHESTRA_VERSION || '1.0.0';
				const info = markAsInstalled(source, appVersion);

				setInstallationInfo(info);
				setInstallationState('new-installation');
			}
		};

		detectInstallation();
	}, []);

	const markInstallationComplete = () => {
		completeFirstLaunch();
		setInstallationState('returning-user');
	};

	return {
		installationState,
		installationInfo,
		shouldShowOnboarding: installationState === 'new-installation',
		markInstallationComplete,
	};
};
