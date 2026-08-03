/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { DIVISION_API_BASE_URL } from '../../../../common/divisionAuthConfig.js';

export type InstallationSource = 'division-website' | 'manual' | 'unknown';

export interface InstallationInfo {
	isFirstLaunch: boolean;
	installationSource: InstallationSource;
	installationTimestamp: number;
	installationVersion: string;
}

const INSTALLATION_STATE_KEY = 'division:installationState';

export const getInstallationInfo = (): InstallationInfo | null => {
	try {
		const stored = localStorage.getItem(INSTALLATION_STATE_KEY);
		if (!stored) return null;
		return JSON.parse(stored) as InstallationInfo;
	} catch {
		return null;
	}
};

export const markAsInstalled = (source: InstallationSource = 'unknown', version: string = '1.0.0'): InstallationInfo => {
	const info: InstallationInfo = {
		isFirstLaunch: true,
		installationSource: source,
		installationTimestamp: Date.now(),
		installationVersion: version,
	};

	try {
		localStorage.setItem(INSTALLATION_STATE_KEY, JSON.stringify(info));
	} catch (e) {
		console.warn('Failed to save installation info:', e);
	}

	return info;
};

export const completeFirstLaunch = (): void => {
	try {
		const info = getInstallationInfo();
		if (info) {
			info.isFirstLaunch = false;
			localStorage.setItem(INSTALLATION_STATE_KEY, JSON.stringify(info));
		}
	} catch (e) {
		console.warn('Failed to complete first launch:', e);
	}
};

/**
 * インストール情報をDivision APIに通知する
 * （将来の分析・統計用）
 */
export const reportInstallationToDivision = async (userId: string, accessToken: string, info: InstallationInfo): Promise<void> => {
	try {
		const response = await fetch(`${DIVISION_API_BASE_URL}/api/installations`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${accessToken}`,
			},
			body: JSON.stringify({
				userId,
				source: info.installationSource,
				timestamp: info.installationTimestamp,
				version: info.installationVersion,
			}),
		});

		if (!response.ok) {
			console.warn(`Failed to report installation to Division API (HTTP ${response.status})`);
		}
	} catch (error) {
		console.warn('Failed to report installation to Division API:', error);
	}
};

/**
 * URLパラメータからインストール情報を抽出
 * 例: ?installSource=division-website&installVersion=1.0.0
 */
export const extractInstallationSourceFromURL = (): InstallationSource => {
	try {
		const params = new URLSearchParams(window.location.search);
		const source = params.get('installSource');
		if (source === 'division-website' || source === 'manual') {
			return source;
		}
	} catch {
		// URLから抽出できない場合はunknownを返す
	}
	return 'unknown';
};
