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
	'tab.skills': { en: 'Skills', ja: 'スキル' },
	'tab.trello': { en: 'Trello', ja: 'Trello' },
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
	'general.language.vscodeTitle': { en: 'Editor Display Language (VS Code UI)', ja: 'エディタ全体の表示言語 (VS Code UI)' },
	'general.language.vscodeSubtitle': { en: 'Switches menus, the command palette, notifications, and other built-in VS Code UI. Requires installing a language pack and a restart.', ja: 'メニュー・コマンドパレット・通知など VS Code 本体の UI を切り替えます。言語パックのインストールと再起動が必要です。' },
	'general.language.vscodeButton': { en: 'Configure Display Language…', ja: '表示言語を設定…' },

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
	'skills.title': { en: 'Skills', ja: 'スキル' },
	'skills.subtitle': { en: 'Give Agent mode reusable, on-demand instructions. Each Skill is a SKILL.md file the agent loads into context only when it decides it applies.', ja: 'エージェントモードに再利用可能な指示を与えます。各スキルは SKILL.md ファイルで、エージェントが必要と判断したときのみコンテキストに読み込まれます。' },
	'skills.openFolder': { en: 'Open Skills Folder', ja: 'スキルフォルダを開く' },
	'skills.noneFound': { en: 'No skills found', ja: 'スキルが見つかりません' },

	// Settings - Trello
	'trello.title': { en: 'Trello', ja: 'Trello' },
	'trello.subtitle': {
		en: 'Link a Trello board and let Orchestra pull cards off a "to do" list and run each one as an agent prompt.',
		ja: 'Trello ボードとリンクし、「TODO」リストに溜まったカードを 1 枚ずつエージェントのプロンプトとして自動実行します。',
	},
	'trello.credentials.title': { en: 'Credentials', ja: '認証情報' },
	'trello.credentials.subtitle': {
		en: 'Create an API key at trello.com/power-ups/admin, then generate a token for it.',
		ja: 'trello.com/power-ups/admin で API キーを発行し、そのキーに対するトークンを生成して貼り付けてください。',
	},
	'trello.credentials.apiKey': { en: 'API Key', ja: 'API キー' },
	'trello.credentials.token': { en: 'Token', ja: 'トークン' },
	'trello.credentials.connect': { en: 'Connect', ja: '接続する' },
	'trello.credentials.reconnect': { en: 'Re-check connection', ja: '接続を確認' },
	'trello.credentials.connected': { en: 'Connected as', ja: '接続中:' },
	'trello.credentials.notConfigured': { en: 'Not connected yet.', ja: '未接続です。' },
	'trello.credentials.checking': { en: 'Checking…', ja: '確認中…' },

	'trello.board.title': { en: 'Board & Lists', ja: 'ボードとリスト' },
	'trello.board.subtitle': {
		en: 'Pick the board to watch and which list holds the tasks waiting to run.',
		ja: '監視するボードと、実行待ちタスクが積まれているリストを選びます。',
	},
	'trello.board.board': { en: 'Board', ja: 'ボード' },
	'trello.board.todoList': { en: 'To do list (required)', ja: '実行待ちリスト（必須）' },
	'trello.board.inProgressList': { en: 'Move to while running', ja: '実行中の移動先' },
	'trello.board.doneList': { en: 'Move to when finished', ja: '完了時の移動先' },
	'trello.board.errorList': { en: 'Move to on failure', ja: '失敗時の移動先' },
	'trello.board.noMove': { en: "Don't move", ja: '移動しない' },
	'trello.board.selectPlaceholder': { en: 'Select…', ja: '選択してください…' },
	'trello.board.refreshLists': { en: 'Reload lists', ja: 'リストを再取得' },

	'trello.execution.title': { en: 'Execution', ja: '実行設定' },
	'trello.execution.autoRun': { en: 'Run cards automatically', ja: 'カードを自動で実行する' },
	'trello.execution.autoRunDetail': {
		en: 'Polls the to do list on an interval and runs any new card as an agent prompt.',
		ja: '一定間隔で実行待ちリストを確認し、新しいカードをエージェントのプロンプトとして実行します。',
	},
	'trello.execution.pollInterval': { en: 'Poll interval (seconds)', ja: 'ポーリング間隔（秒）' },
	'trello.execution.maxCards': { en: 'Max cards per poll', ja: '1 回あたりの最大カード数' },
	'trello.execution.cardTimeout': { en: 'Per-card timeout (minutes)', ja: 'カードごとのタイムアウト（分）' },
	'trello.execution.requiredLabel': { en: 'Only run cards with this label', ja: 'このラベルが付いたカードだけ実行' },
	'trello.execution.requiredLabelPlaceholder': { en: 'Any label', ja: '指定なし（すべて対象）' },
	'trello.execution.newThreadPerCard': { en: 'Start a new chat thread per card', ja: 'カードごとに新しいチャットスレッドを開く' },
	'trello.execution.postComment': { en: 'Post the result back as a card comment', ja: '実行結果をカードのコメントに書き戻す' },
	'trello.execution.dryRun': { en: 'Dry run — build the prompt but do not run it', ja: 'ドライラン（プロンプトを組み立てるだけで実行しない）' },
	'trello.execution.dryRunDetail': {
		en: 'The card is still marked as processed, so use "Forget processed cards" before running it for real.',
		ja: 'カードは実行済みとして記録されます。本番実行したいときは「実行済み記録を消す」を押してください。',
	},
	'trello.execution.autoApproveWarning': {
		en: 'Some tools still need manual approval, so an unattended run will stall waiting for you. Turn these on under Feature Options > Auto-approve:',
		ja: '一部のツールが手動承認のままです。無人実行だと承認待ちで止まります。機能オプション > 自動承認 で有効にしてください:',
	},

	'trello.prompt.title': { en: 'Prompt Template', ja: 'プロンプトテンプレート' },
	'trello.prompt.subtitle': {
		en: 'Placeholders: {{title}} {{description}} {{checklists}} {{labels}} {{attachments}} {{due}} {{url}} {{cardId}} {{boardName}} {{listName}}. Leave empty to use the built-in template.',
		ja: '使えるプレースホルダ: {{title}} {{description}} {{checklists}} {{labels}} {{attachments}} {{due}} {{url}} {{cardId}} {{boardName}} {{listName}}。空欄なら組み込みのテンプレートを使います。',
	},
	'trello.prompt.reset': { en: 'Reset to default', ja: '既定に戻す' },

	'trello.status.title': { en: 'Status', ja: '実行状況' },
	'trello.status.runNow': { en: 'Run pending cards now', ja: '今すぐ実行' },
	'trello.status.cancel': { en: 'Cancel running card', ja: '実行中のカードを中断' },
	'trello.status.clearProcessed': { en: 'Forget processed cards', ja: '実行済み記録を消す' },
	'trello.status.polling': { en: 'Auto-run is on', ja: '自動実行: 有効' },
	'trello.status.notPolling': { en: 'Auto-run is off', ja: '自動実行: 無効' },
	'trello.status.running': { en: 'Running', ja: '実行中' },
	'trello.status.idle': { en: 'Idle', ja: '待機中' },
	'trello.status.awaitingApproval': {
		en: 'Waiting for you to approve a tool call — the card will time out until you approve it or enable auto-approve.',
		ja: 'ツール実行の承認待ちです。承認するか自動承認を有効にするまで進みません（いずれタイムアウトします）。',
	},
	'trello.status.lastPolled': { en: 'Last checked', ja: '最終確認' },
	'trello.status.never': { en: 'never', ja: '未実施' },
	'trello.status.history': { en: 'Recent runs', ja: '実行履歴' },
	'trello.status.noHistory': { en: 'No runs yet.', ja: 'まだ実行履歴はありません。' },

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
