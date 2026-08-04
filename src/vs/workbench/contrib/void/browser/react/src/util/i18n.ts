/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Lightweight i18n for Orchestra's own React UI (Settings panel, sidebar chat, onboarding).
// This does NOT translate VS Code's built-in UI (menus, command palette, etc.) - that
// requires installing a VS Code display language pack. This only covers strings rendered
// by Orchestra's custom React components, switched via the `uiLanguage` global setting.

import { useCallback } from 'react'
import { UILanguage } from '../../../../common/voidSettingsTypes.js'
import { useAccessor, useSettingsState } from './services.js'

export const translations = {
	// Settings - nav tabs
	'tab.models': { en: 'Models', ja: 'モデル' },
	'tab.localProviders': { en: 'Local Providers', ja: 'ローカルプロバイダー' },
	'tab.providers': { en: 'Main Providers', ja: 'メインプロバイダー' },
	'tab.featureOptions': { en: 'Feature Options', ja: '機能オプション' },
	'tab.division': { en: 'Division', ja: 'Division' },
	'tab.general': { en: 'General', ja: '一般' },
	'tab.mcp': { en: 'MCP', ja: 'MCP' },
	'tab.updates': { en: 'Updates', ja: 'アップデート' },
	'tab.all': { en: 'All Settings', ja: 'すべての設定' },

	// Settings - General - Account
	'general.account.title': { en: 'Account', ja: 'アカウント' },
	'general.account.subtitle': { en: 'Manage your Orchestra account.', ja: 'Orchestra アカウントを管理します。' },
	'general.account.signOut': { en: 'Sign Out', ja: 'サインアウト' },
	'general.account.manageBilling': { en: 'Manage plan & billing', ja: 'プラン・支払い方法を管理' },
	'general.account.logIn': { en: 'Log In', ja: 'ログイン' },

	// Settings - General - Language
	'general.language.title': { en: 'Language', ja: '言語' },
	'general.language.subtitle': { en: `Switch the display language of Orchestra's UI (Settings, sidebar chat, onboarding).`, ja: 'Orchestra の UI（設定パネル・サイドバーチャット・オンボーディング）の表示言語を切り替えます。' },

	// Settings - General - One-Click Switch
	'general.oneClickSwitch.title': { en: 'One-Click Switch', ja: 'ワンクリック移行' },
	'general.oneClickSwitch.subtitle': { en: 'Transfer your editor settings into Orchestra.', ja: '他のエディタの設定を Orchestra に移行します。' },

	// Settings - General - Import/Export
	'general.importExport.title': { en: 'Import/Export', ja: 'インポート／エクスポート' },
	'general.importExport.subtitle': { en: `Transfer Orchestra's settings and chats in and out of Orchestra.`, ja: 'Orchestra の設定とチャットをインポート・エクスポートします。' },
	'general.importExport.importSettings': { en: 'Import Settings', ja: '設定をインポート' },
	'general.importExport.exportSettings': { en: 'Export Settings', ja: '設定をエクスポート' },
	'general.importExport.resetSettings': { en: 'Reset Settings', ja: '設定をリセット' },
	'general.importExport.importChats': { en: 'Import Chats', ja: 'チャットをインポート' },
	'general.importExport.exportChats': { en: 'Export Chats', ja: 'チャットをエクスポート' },
	'general.importExport.resetChats': { en: 'Reset Chats', ja: 'チャットをリセット' },

	// Settings - General - Theme
	'general.theme.title': { en: 'Theme', ja: 'テーマ' },
	'general.theme.subtitle': { en: 'Switch the color scheme of the whole editor. Sun Red is a warm sunset-inspired palette.', ja: 'エディタ全体の配色を切り替えます。Sun Red は暖色寄りのサンセット系カラーです。' },

	// Settings - General - Built-in Settings
	'general.builtIn.title': { en: 'Built-in Settings', ja: '組み込み設定' },
	'general.builtIn.subtitle': { en: 'IDE settings, keyboard settings, extensions, and theme customization.', ja: 'IDE 設定、キーボード設定、拡張機能、テーマのカスタマイズです。' },
	'general.builtIn.generalSettings': { en: 'General Settings', ja: '一般設定' },
	'general.builtIn.keyboardSettings': { en: 'Keyboard Settings', ja: 'キーボード設定' },
	'general.builtIn.themeSettings': { en: 'Theme Settings', ja: 'テーマ設定' },
	'general.builtIn.extensions': { en: 'Extensions', ja: '拡張機能' },
	'general.builtIn.openLogs': { en: 'Open Logs', ja: 'ログを開く' },

	// Settings - General - Metrics
	'general.metrics.title': { en: 'Metrics', ja: '計測' },
	'general.metrics.subtitle': { en: 'Very basic anonymous usage tracking helps us keep Orchestra running smoothly. You may opt out below. Regardless of this setting, Orchestra never sees your code, messages, or API keys.', ja: '簡易的な匿名の利用状況計測により、Orchestra の安定運用に役立てています。以下からオプトアウトできます。この設定に関わらず、Orchestra があなたのコード・メッセージ・API キーを取得することはありません。' },
	'general.metrics.optOut': { en: 'Opt-out (requires restart)', ja: 'オプトアウト（再起動が必要）' },

	// Settings - General - AI Instructions
	'general.aiInstructions.title': { en: 'AI Instructions', ja: 'AI への指示' },
	'general.aiInstructions.subtitle': { en: `System instructions to include with all AI requests. Alternatively, place a \`.voidrules\` file in the root of your workspace.`, ja: 'すべての AI リクエストに含めるシステム指示です。代わりにワークスペースのルートに `.voidrules` ファイルを置くこともできます。' },
	'general.aiInstructions.disableSystemMessage': { en: 'Disable system message', ja: 'システムメッセージを無効化' },
	'general.aiInstructions.disableSystemMessageDetail': { en: 'When disabled, Orchestra will not include anything in the system message except for content you specified above.', ja: '無効化すると、上記で指定した内容以外はシステムメッセージに含まれなくなります。' },

	// Settings - Division / MCP / Updates section headers
	'division.title': { en: 'Division', ja: 'Division' },
	'division.subtitle': { en: 'Manage your Division projects and role assignments.', ja: 'Division プロジェクトとロール割り当てを管理します。' },
	'mcp.title': { en: 'MCP', ja: 'MCP' },
	'mcp.addServer': { en: 'Add MCP Server', ja: 'MCP サーバーを追加' },

	// Sidebar chat
	'chat.generating': { en: 'Generating…', ja: '生成中' },
	'chat.inputPlaceholder.mention': { en: '@ to mention, ', ja: '@ でメンション、' },
	'chat.inputPlaceholder.addSelection': { en: '{kb} to add a selection. ', ja: '{kb} で選択を追加、' },
	'chat.inputPlaceholder.enterInstructions': { en: 'Enter instructions...', ja: '指示を入力...' },
	'chat.inputPlaceholder.streamingPrefix': { en: 'Generating: Enter to queue, ', ja: '生成中: Enter でキューに追加、' },
	'chat.inputPlaceholder.streamingAddSelection': { en: '{kb} to add a selection, ', ja: '{kb} で選択を追加、' },
	'chat.inputPlaceholder.streamingStop': { en: 'Esc to stop', ja: 'Esc で停止' },
	'chat.suggested.summarize': { en: 'Summarize my codebase', ja: 'コードベースを要約して' },
	'chat.suggested.summarize.hint': { en: 'Understand the whole project', ja: 'プロジェクト全体を把握' },
	'chat.suggested.types': { en: 'How do types work in Rust?', ja: 'Rust の型システムについて教えて' },
	'chat.suggested.types.hint': { en: 'Answer a technical question', ja: '技術的な疑問を解決' },
	'chat.suggested.voidrules': { en: 'Create a .voidrules file for me', ja: '.voidrules ファイルを作成して' },
	'chat.suggested.voidrules.hint': { en: 'Generate a file', ja: 'ファイルを生成' },

	// Onboarding
	'onboarding.welcome': { en: 'Welcome to Orchestra', ja: 'Orchestra へようこそ' },
	'onboarding.getStarted': { en: 'Get Started', ja: 'はじめる' },
	'onboarding.next': { en: 'Next', ja: '次へ' },
	'onboarding.back': { en: 'Back', ja: '戻る' },
	'onboarding.loggedIn': { en: 'Logged in', ja: 'ログイン済み' },
} as const

export type TranslationKey = keyof typeof translations

export const t = (key: TranslationKey, language: UILanguage): string => {
	const entry = translations[key]
	if (!entry) return key
	return entry[language] ?? entry.en
}

export const useUILanguage = (): UILanguage => {
	const settingsState = useSettingsState()
	return settingsState.globalSettings.uiLanguage ?? 'en'
}

export const useSetUILanguage = () => {
	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	return useCallback((newLanguage: UILanguage) => {
		voidSettingsService.setGlobalSetting('uiLanguage', newLanguage)
	}, [voidSettingsService])
}

// Convenience hook: returns a `t(key)` function bound to the current UI language.
export const useTranslation = () => {
	const language = useUILanguage()
	const setLanguage = useSetUILanguage()
	const translate = useCallback((key: TranslationKey) => t(key, language), [language])
	return { t: translate, language, setLanguage }
}
