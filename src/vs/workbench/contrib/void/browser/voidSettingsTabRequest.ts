/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Orchestra の設定画面 (voidSettingsPane.ts / React の Settings.tsx) を「どのタブで開くか」の受け渡し。
//
// コマンド (「Division プロジェクト」「コスト管理」など) が requestVoidSettingsTab() でタブを頼み、
//  - 設定画面がもう表示されていれば (React がマウント済み)、購読している Settings.tsx がその場で切り替える
//  - まだなら、次にマウントされた Settings.tsx が consumeRequestedVoidSettingsTab() で受け取る
//
// React のバンドル (react/out/void-settings-tsx) からも import されるので、実行時の依存を持たせないこと
// (このファイルはワークベンチ側の 1 つのモジュールとして共有される)。

/** Settings.tsx のタブ。'all' は「すべての設定」 */
export type VoidSettingsTab =
	| 'models'
	| 'localProviders'
	| 'providers'
	| 'featureOptions'
	| 'division'
	| 'cost'
	| 'general'
	| 'mcp'
	| 'skills'
	| 'kanban'
	| 'obsidian'
	| 'updates'
	| 'all';

export const VOID_SETTINGS_TABS: readonly VoidSettingsTab[] = [
	'models', 'localProviders', 'providers', 'featureOptions', 'division', 'cost',
	'general', 'mcp', 'skills', 'kanban', 'obsidian', 'updates', 'all',
];

export const isVoidSettingsTab = (v: unknown): v is VoidSettingsTab =>
	typeof v === 'string' && (VOID_SETTINGS_TABS as readonly string[]).includes(v);

let pendingTab: VoidSettingsTab | null = null;
const listeners = new Set<(tab: VoidSettingsTab) => void>();

/** 次に表示する設定画面のタブを頼む。表示中の設定画面があれば、すぐに切り替わる */
export const requestVoidSettingsTab = (tab: VoidSettingsTab): void => {
	if (listeners.size > 0) {
		pendingTab = null;
		listeners.forEach(l => l(tab));
		return;
	}
	pendingTab = tab;
};

/** マウント時に、頼まれていたタブを受け取る (受け取ったら消える) */
export const consumeRequestedVoidSettingsTab = (): VoidSettingsTab | null => {
	const tab = pendingTab;
	pendingTab = null;
	return tab;
};

/** 表示中の設定画面が、あとから頼まれたタブに切り替えるための購読。戻り値で解除する */
export const onDidRequestVoidSettingsTab = (listener: (tab: VoidSettingsTab) => void): (() => void) => {
	listeners.add(listener);
	return () => { listeners.delete(listener); };
};
