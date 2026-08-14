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
	'tab.kanban': { en: 'Kanban', ja: 'カンバン' },
	'tab.trello': { en: 'Trello', ja: 'Trello' },
	'tab.remoteControl': { en: 'Remote Control', ja: 'リモートコントロール' },
	'tab.obsidian': { en: 'Obsidian', ja: 'Obsidian' },
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

	// Settings - Obsidian
	'obsidian.title': { en: 'Obsidian', ja: 'Obsidian' },
	'obsidian.subtitle': {
		en: 'Connect your Obsidian vault. Syncing imports its folder names, and each one becomes a function Agent mode can call by name to read the Markdown notes inside it.',
		ja: 'Obsidian の Vault と連携します。同期すると Vault のフォルダ名を取り込み、それぞれが MCP のファンクションのようにエージェントから呼べるようになり、フォルダ名を渡すとその中の Markdown を読み取ります。',
	},

	'obsidian.vault.title': { en: 'Vault', ja: 'Vault' },
	'obsidian.vault.subtitle': {
		en: 'The folder Obsidian opens as a vault. It just needs to be a folder of Markdown files - Obsidian itself does not need to be running.',
		ja: 'Obsidian が Vault として開いているフォルダです。Markdown ファイルが入ったフォルダであればよく、Obsidian が起動している必要はありません。',
	},
	'obsidian.vault.pathLabel': { en: 'Vault folder', ja: 'Vault フォルダ' },
	'obsidian.vault.pathPlaceholder': { en: '/Users/you/Documents/MyVault', ja: '/Users/you/Documents/MyVault' },
	'obsidian.vault.browse': { en: 'Browse…', ja: 'フォルダを選択…' },
	'obsidian.vault.sync': { en: 'Sync', ja: '同期' },
	'obsidian.vault.syncing': { en: 'Syncing…', ja: '同期中…' },
	'obsidian.vault.disconnect': { en: 'Disconnect', ja: '連携を解除' },
	'obsidian.vault.notConnected': { en: 'No vault connected yet.', ja: 'Vault が未設定です。' },
	'obsidian.vault.syncedSummary': {
		en: 'Synced {folders} folders, {files} Markdown files.',
		ja: 'フォルダ {folders} 件・Markdown {files} 件を取り込みました。',
	},
	'obsidian.vault.lastSynced': { en: 'Last synced {time}', ja: '最終同期 {time}' },

	'obsidian.options.title': { en: 'Reading options', ja: '読み取りの設定' },
	'obsidian.options.subtitle': {
		en: 'Notes are read straight off disk each time a tool runs, so edits in Obsidian show up without re-syncing. These limits keep a big vault from filling the context window.',
		ja: 'メモはツールを呼ぶたびにディスクから読み直すので、Obsidian 側の編集は再同期なしで反映されます。以下の上限は、大きな Vault がコンテキストを埋め尽くさないためのものです。',
	},
	'obsidian.options.includeSubfolders': { en: 'Include subfolders', ja: 'サブフォルダも含める' },
	'obsidian.options.includeSubfoldersDetail': {
		en: 'When reading one folder, also read the notes in the folders nested inside it.',
		ja: 'フォルダを読むとき、その下のフォルダにあるメモも読みます。',
	},
	'obsidian.options.exposeFolderTools': { en: 'One function per folder', ja: 'フォルダごとにファンクションを作る' },
	'obsidian.options.exposeFolderTools.detail': {
		en: 'Expose each imported folder as its own obsidian_<folder> function. Turn this off to keep the tool list short - obsidian_read_folder still reaches every folder by name.',
		ja: '取り込んだフォルダを obsidian_<フォルダ名> という個別のファンクションとして公開します。off にするとツール一覧が短くなりますが、obsidian_read_folder から名前で全フォルダを読めます。',
	},
	'obsidian.options.maxFiles': { en: 'Max notes per read', ja: '1 回に読む最大ファイル数' },
	'obsidian.options.maxCharsPerFile': { en: 'Max characters per note', ja: '1 ファイルあたりの最大文字数' },
	'obsidian.options.maxTotalChars': { en: 'Max characters per read', ja: '1 回の読み取りの最大文字数' },

	'obsidian.folders.title': { en: 'Imported folders', ja: '取り込んだフォルダ' },
	'obsidian.folders.subtitle': {
		en: 'Folder names the agent can pass to obsidian_read_folder. Turning one off hides it from the agent.',
		ja: 'エージェントが obsidian_read_folder に渡せるフォルダ名です。off にするとエージェントから見えなくなります。',
	},
	'obsidian.folders.noneFound': {
		en: 'No folders imported yet. Set a vault folder above and press Sync.',
		ja: 'まだフォルダを取り込んでいません。上で Vault フォルダを指定して「同期」を押してください。',
	},
	'obsidian.folders.enableAll': { en: 'Enable all', ja: 'すべて ON' },
	'obsidian.folders.disableAll': { en: 'Disable all', ja: 'すべて OFF' },
	'obsidian.folders.vaultRoot': { en: 'notes directly in the vault root', ja: 'Vault 直下のメモ' },
	'obsidian.folders.fileCount': { en: '{count} notes', ja: 'メモ {count} 件' },
	'obsidian.folders.fileCountWithNested': { en: '{count} notes ({total} with subfolders)', ja: 'メモ {count} 件（サブフォルダ込み {total} 件）' },
	'obsidian.folders.tooManyForTools': {
		en: 'This vault has more than {max} enabled folders, so per-folder functions are not exposed. The agent can still read any of them with obsidian_read_folder.',
		ja: '有効なフォルダが {max} 件を超えているため、フォルダごとの個別ファンクションは公開していません。obsidian_read_folder からはどのフォルダも読めます。',
	},

	'obsidian.allMd.title': { en: 'The all-md context', ja: 'all-md コンテキスト' },
	'obsidian.allMd.detail': {
		en: 'Always available while a vault is connected. Calling obsidian_all_md - or passing "all-md" as the folder name - reads every Markdown file in the vault.',
		ja: 'Vault が連携されている間つねに使えます。obsidian_all_md を呼ぶか、フォルダ名として "all-md" を渡すと、Vault 内のすべての Markdown を読み取ります。',
	},

	// Kanban - board UI
	'kanban.board.newTask': { en: 'New task', ja: 'タスクを追加' },
	'kanban.board.newTaskPlaceholder': { en: 'What needs to be done?', ja: '何をしますか？' },
	'kanban.board.search': { en: 'Search tasks…', ja: 'タスクを検索…' },
	'kanban.board.allLabels': { en: 'All labels', ja: 'すべてのラベル' },
	'kanban.board.autoRun': { en: 'Auto-run', ja: '自動実行' },
	'kanban.board.autoRunDetail': {
		en: 'Poll the To Do column and run each task as an agent prompt.',
		ja: '実行待ちカラムを定期的に確認し、タスクをエージェントのプロンプトとして実行します。',
	},
	'kanban.board.runNow': { en: 'Run now', ja: '今すぐ実行' },
	'kanban.board.cancelRun': { en: 'Cancel run', ja: '実行を中断' },
	'kanban.board.running': { en: 'Running {title}', ja: '「{title}」を実行中' },
	'kanban.board.awaitingApproval': {
		en: 'The agent is waiting for tool approval — nothing will progress until you approve it in chat.',
		ja: 'エージェントがツールの承認待ちです。チャットで承認するまで先に進みません。',
	},
	'kanban.board.addColumn': { en: 'Add column', ja: 'カラムを追加' },
	'kanban.board.newColumnName': { en: 'New column', ja: '新しいカラム' },
	'kanban.board.openInNewWindow': { en: 'Open the board in a separate window', ja: 'ボードを別ウィンドウで開く' },
	'kanban.board.reload': { en: 'Reload from disk', ja: 'ディスクから再読み込み' },
	'kanban.board.openSettings': { en: 'Kanban settings', ja: 'カンバンの設定' },
	'kanban.board.storedInFile': { en: 'Saved to {path}', ja: '保存先: {path}' },
	'kanban.board.storedInApp': {
		en: 'No folder is open, so this board is kept in app storage. Open a folder to save it as .orchestra/kanban.json.',
		ja: 'フォルダが開かれていないため、このボードはアプリ内に保存されます。フォルダを開くと .orchestra/kanban.json に保存されます。',
	},
	'kanban.board.loading': { en: 'Loading board…', ja: 'ボードを読み込み中…' },
	'kanban.board.emptyColumn': { en: 'Nothing here', ja: 'タスクなし' },
	'kanban.board.noMatches': { en: 'No task matches the filter', ja: '条件に一致するタスクがありません' },
	'kanban.board.wipExceeded': { en: 'Over the WIP limit', ja: 'WIP 上限を超えています' },
	'kanban.board.dryRunOn': { en: 'Dry run is on — prompts are built but never sent.', ja: 'ドライラン中です。プロンプトを組み立てるだけで送信しません。' },

	// Kanban - column
	'kanban.column.settings': { en: 'Column settings', ja: 'カラムの設定' },
	'kanban.column.role': { en: 'Role in the run pipeline', ja: '実行パイプラインでの役割' },
	'kanban.column.roleDetail': {
		en: 'Auto-run pulls from the To Do column, moves the task to In Progress, then to Done or Failed.',
		ja: '自動実行は「実行待ち」から拾い、「実行中」へ移し、結果に応じて「完了」か「失敗」へ移します。',
	},
	'kanban.column.wipLimit': { en: 'WIP limit (0 = none)', ja: 'WIP 上限（0 で無制限）' },
	'kanban.column.color': { en: 'Color', ja: '色' },
	'kanban.column.moveLeft': { en: 'Move left', ja: '左へ移動' },
	'kanban.column.moveRight': { en: 'Move right', ja: '右へ移動' },
	'kanban.column.delete': { en: 'Delete column', ja: 'カラムを削除' },
	'kanban.column.deleteWithTasks': {
		en: 'Deleting this column also deletes its {count} tasks. Continue?',
		ja: 'このカラムを削除すると、中の {count} 件のタスクも削除されます。続けますか？',
	},
	'kanban.column.addTask': { en: 'Add a task to this column', ja: 'このカラムにタスクを追加' },

	// Kanban - card
	'kanban.card.run': { en: 'Run with agent', ja: 'エージェントで実行' },
	'kanban.card.agentOff': { en: 'Excluded from auto-run', ja: '自動実行の対象外' },
	'kanban.card.overdue': { en: 'Overdue', ja: '期限超過' },

	// Kanban - task detail
	'kanban.detail.titleLabel': { en: 'Title', ja: 'タイトル' },
	'kanban.detail.description': { en: 'Description', ja: '説明' },
	'kanban.detail.descriptionPlaceholder': {
		en: 'What should the agent do? This goes straight into the prompt.',
		ja: 'エージェントに何をしてほしいか。ここがそのままプロンプトに入ります。',
	},
	'kanban.detail.priority': { en: 'Priority', ja: '優先度' },
	'kanban.detail.dueDate': { en: 'Due date', ja: '期限' },
	'kanban.detail.assignee': { en: 'Assignee', ja: '担当' },
	'kanban.detail.column': { en: 'Column', ja: 'カラム' },
	'kanban.detail.labels': { en: 'Labels', ja: 'ラベル' },
	'kanban.detail.addLabel': { en: 'Add label…', ja: 'ラベルを追加…' },
	'kanban.detail.checklist': { en: 'Checklist', ja: 'チェックリスト' },
	'kanban.detail.addChecklistItem': { en: 'Add an item…', ja: '項目を追加…' },
	'kanban.detail.comments': { en: 'Comments', ja: 'コメント' },
	'kanban.detail.addComment': { en: 'Write a comment…', ja: 'コメントを書く…' },
	'kanban.detail.post': { en: 'Post', ja: '投稿' },
	'kanban.detail.runHistory': { en: 'Run history', ja: '実行履歴' },
	'kanban.detail.noRuns': { en: 'This task has not been run yet.', ja: 'まだ実行されていません。' },
	'kanban.detail.openThread': { en: 'Open the chat thread', ja: 'チャットスレッドを開く' },
	'kanban.detail.agentEnabled': { en: 'Include in auto-run', ja: '自動実行の対象にする' },
	'kanban.detail.agentEnabledDetail': {
		en: 'Turn this off to keep a task on the board without the agent picking it up. You can still run it by hand.',
		ja: 'off にすると自動実行では拾われなくなります。手動での実行は引き続きできます。',
	},
	'kanban.detail.delete': { en: 'Delete task', ja: 'タスクを削除' },
	'kanban.detail.deleteConfirm': { en: 'Delete "{title}"?', ja: '「{title}」を削除しますか？' },
	'kanban.detail.close': { en: 'Close', ja: '閉じる' },
	'kanban.detail.createdAt': { en: 'Created {time}', ja: '作成 {time}' },
	'kanban.detail.authorUser': { en: 'You', ja: 'あなた' },
	'kanban.detail.authorAgent': { en: 'Agent', ja: 'エージェント' },

	// Settings - Kanban
	'kanban.title': { en: 'Kanban', ja: 'カンバン' },
	'kanban.subtitle': {
		en: 'Orchestra has its own Kanban board. Tasks live in .orchestra/kanban.json inside the workspace, so they travel with the repository, and the agent can run them straight off the board.',
		ja: 'Orchestra 内蔵のカンバンです。タスクはワークスペースの .orchestra/kanban.json に保存されるためリポジトリと一緒に持ち運べ、ボードから直接エージェントに実行させられます。',
	},
	'kanban.settings.openBoard': { en: 'Open Board', ja: 'ボードを開く' },
	'kanban.settings.openInNewWindow': { en: 'Always open in a separate window', ja: '常に別ウィンドウで開く' },
	'kanban.settings.openInNewWindowDetail': {
		en: 'Opening the board puts it in its own window instead of an editor tab — useful for parking it on a second display while you write code in the main window.',
		ja: 'ボードをエディタのタブではなく専用のウィンドウで開きます。サブディスプレイにボードを出しっぱなしにして、メインウィンドウではコードを書く使い方向けです。',
	},
	'kanban.settings.execution': { en: 'Execution', ja: '実行設定' },
	'kanban.settings.executionSubtitle': {
		en: 'How tasks in the To Do column get handed to the agent.',
		ja: '実行待ちカラムのタスクをエージェントに渡すときの動作です。',
	},
	'kanban.settings.autoRun': { en: 'Run tasks automatically', ja: 'タスクを自動で実行する' },
	'kanban.settings.autoRunDetail': {
		en: 'Polls the To Do column on an interval and runs each task as an agent prompt.',
		ja: '一定間隔で実行待ちカラムを確認し、タスクをエージェントのプロンプトとして実行します。',
	},
	'kanban.settings.pollInterval': { en: 'Poll interval (seconds)', ja: 'ポーリング間隔（秒）' },
	'kanban.settings.maxTasks': { en: 'Max tasks per poll', ja: '1 回に処理する最大タスク数' },
	'kanban.settings.timeout': { en: 'Timeout per task (minutes)', ja: '1 タスクのタイムアウト（分）' },
	'kanban.settings.newThread': { en: 'New chat thread per task', ja: 'タスクごとに新しいスレッドを開く' },
	'kanban.settings.newThreadDetail': {
		en: 'Keeps each task in its own conversation instead of piling them into one thread.',
		ja: 'タスクごとに会話を分け、1 つのスレッドに積み上がらないようにします。',
	},
	'kanban.settings.postComment': { en: 'Write the result back as a comment', ja: '実行結果をコメントとして書き戻す' },
	'kanban.settings.requiredLabel': { en: 'Only run tasks with this label', ja: 'このラベルが付いたタスクだけ実行' },
	'kanban.settings.requiredLabelPlaceholder': { en: 'Any label', ja: 'すべてのタスク' },
	'kanban.settings.dryRun': { en: 'Dry run', ja: 'ドライラン' },
	'kanban.settings.dryRunDetail': {
		en: 'Builds the prompt and records it on the task, but never sends it to the agent.',
		ja: 'プロンプトを組み立ててタスクに記録するだけで、エージェントには送りません。',
	},
	'kanban.settings.prompt': { en: 'Prompt template', ja: 'プロンプトのテンプレート' },
	'kanban.settings.promptSubtitle': {
		en: 'Placeholders: {{title}} {{description}} {{checklist}} {{labels}} {{priority}} {{due}} {{assignee}} {{comments}} {{columnName}} {{boardTitle}} {{taskId}}',
		ja: '使えるプレースホルダ: {{title}} {{description}} {{checklist}} {{labels}} {{priority}} {{due}} {{assignee}} {{comments}} {{columnName}} {{boardTitle}} {{taskId}}',
	},
	'kanban.settings.promptReset': { en: 'Reset to default', ja: '既定に戻す' },
	'kanban.settings.approvalWarning': {
		en: 'Auto-approve is off for some tool categories. An unattended run will stall the first time the agent asks for approval.',
		ja: '一部のツールで自動承認が off です。無人実行だと、エージェントが承認を求めた時点で止まります。',
	},

	// Settings - Remote Control
	'remoteControl.title': { en: 'Remote Control', ja: 'リモートコントロール' },
	'remoteControl.subtitle': {
		en: 'Sign in to Orchestra-Mobile with your Division account and control this IDE from your phone.',
		ja: 'Division アカウントで Orchestra-Mobile にログインし、スマホからこの IDE を操作できるようにします。',
	},
	'remoteControl.status.title': { en: 'Status', ja: '状態' },
	'remoteControl.status.subtitle': {
		en: 'Starts a local server on your LAN. Devices signed in to the same Division account can find it automatically.',
		ja: 'この PC の LAN 上にローカルサーバーを立てます。同じ Division アカウントでログインした端末は自動的に見つけて接続できます。',
	},
	'remoteControl.status.enable': { en: 'Enable Remote Control', ja: 'リモートコントロールを有効にする' },
	'remoteControl.status.enableDetail': {
		en: 'Anyone with the token (or your Division account) can control this IDE while enabled.',
		ja: '有効な間、トークン (または同じ Division アカウント) を持つ人はこの IDE を操作できます。',
	},
	'remoteControl.status.starting': { en: 'Starting…', ja: '起動中…' },
	'remoteControl.status.running': { en: 'Running', ja: '起動中' },
	'remoteControl.status.stopped': { en: 'Stopped', ja: '停止中' },
	'remoteControl.status.loginWarning': {
		en: 'Sign in to Division above to make this IDE discoverable automatically from Orchestra-Mobile. You can still pair manually with the connection info below.',
		ja: '上で Division にログインすると、Orchestra-Mobile から自動的に見つけられるようになります。ログインしなくても、下の接続情報で手動ペアリングできます。',
	},
	'remoteControl.connection.title': { en: 'Connection Info', ja: '接続情報' },
	'remoteControl.connection.subtitle': {
		en: 'Scan or paste this into Orchestra-Mobile if automatic sign-in discovery does not work.',
		ja: '自動検出がうまくいかない場合、この情報を Orchestra-Mobile に読み込ませてください。',
	},
	'remoteControl.connection.address': { en: 'Address', ja: 'アドレス' },
	'remoteControl.connection.token': { en: 'Token', ja: 'トークン' },
	'remoteControl.connection.show': { en: 'show', ja: '表示' },
	'remoteControl.connection.hide': { en: 'hide', ja: '隠す' },
	'remoteControl.connection.copyPairingLink': { en: 'Copy Pairing Link', ja: 'ペアリングリンクをコピー' },
	'remoteControl.connection.regenerateToken': { en: 'Regenerate Token', ja: 'トークンを再発行' },
	'remoteControl.connection.phase1Note': {
		en: 'Phase 1: only status/ping are implemented. Kanban, chat, Division and file actions from the phone are not available yet.',
		ja: 'Phase 1: 現時点では状態取得 (ping/state) のみ実装されています。カンバン・チャット・Division・ファイル操作はスマホからはまだ利用できません。',
	},

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
