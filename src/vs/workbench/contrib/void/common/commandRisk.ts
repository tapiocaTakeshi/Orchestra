/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/*
 *  Terminal commands that always need the user's approval, even with "auto-approve terminal" on
 *  and even when the Division API sent them: commands that delete or overwrite a lot at once,
 *  run as another user, rewrite shared git history, run a script fetched from the network, or
 *  send data out of the machine. Everything else follows the auto-approve setting.
 *
 *  This is a safety net for mistakes, not a sandbox: a determined command can hide from any list.
 */

type Rule = { reason: string; test: RegExp };

/** Start of a command: the beginning, or after ; && || | ( ` $( or a newline. */
const CMD = String.raw`(?:^|[;&|(\n\x60]|\$\()\s*`;

const RULES: Rule[] = [
	// Deleting / wiping
	{ reason: '再帰的な削除 (rm -r)', test: new RegExp(CMD + String.raw`(?:sudo\s+)?rm\s+(?:-[^\s]*\s+)*-[a-zA-Z]*[rR]`) },
	{ reason: '再帰的な削除 (rm --recursive)', test: new RegExp(CMD + String.raw`(?:sudo\s+)?rm\s+.*--recursive`) },
	{ reason: '再帰的な削除 (Remove-Item -Recurse)', test: /\b(?:Remove-Item|rm|del|ri)\b[^\n;|]*-Recurse\b/i },
	{ reason: '再帰的な削除 (rd /s, del /s)', test: /\b(?:rd|rmdir|del|erase)\b[^\n;|]*\/s\b/i },
	{ reason: 'find -delete', test: /\bfind\b[^\n;|]*\s-delete\b/ },
	{ reason: 'ディスクの初期化・上書き', test: /\b(?:mkfs(?:\.\w+)?|diskpart|shred|wipefs|format\s+[a-z]:)\b|\bdd\b[^\n;|]*\bof=|>\s*\/dev\/(?:sd|nvme|disk|hd)/i },
	{ reason: 'git の作業内容を捨てる操作 (reset --hard / clean -f / checkout -- .)', test: /\bgit\s+(?:reset\s+[^\n;|]*--hard|clean\s+[^\n;|]*-[a-zA-Z]*f|checkout\s+(?:[^\n;|]*\s)?--\s+\.|restore\s+(?:[^\n;|]*\s)?\.(?:\s|$))/ },
	// Shared history / publishing
	{ reason: 'git の強制プッシュ', test: /\bgit\s+push\b[^\n;|]*(?:\s--force(?:-with-lease)?\b|\s-[a-zA-Z]*f\b|\s\+\S)/ },
	{ reason: 'パッケージの公開', test: /\b(?:npm|pnpm|yarn)\s+publish\b|\bcargo\s+publish\b|\btwine\s+upload\b|\bgem\s+push\b/ },
	// Privileges / system
	{ reason: '管理者権限での実行 (sudo / su / doas)', test: new RegExp(CMD + String.raw`(?:sudo|doas|su)\b`) },
	{ reason: 'システムの停止・再起動', test: new RegExp(CMD + String.raw`(?:shutdown|reboot|halt|poweroff|Stop-Computer|Restart-Computer)\b`, 'i') },
	{ reason: '権限の一括変更 (chmod / chown -R)', test: /\b(?:chmod|chown)\s+(?:[^\n;|]*\s)?-[a-zA-Z]*R\b|\bchmod\s+(?:[^\n;|]*\s)?(?:0?777|a\+rwx)\s+\// },
	{ reason: 'プロセスの一括終了', test: /\bkill\s+(?:-\S+\s+)*-1\b|\bkillall\b|\bpkill\b|\bStop-Process\b/i },
	{ reason: 'fork bomb', test: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/ },
	// Code from the network
	{ reason: 'ダウンロードしたスクリプトをそのまま実行', test: /\b(?:curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n;]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b|\b(?:curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n;]*\|\s*(?:python3?|node|perl|ruby|iex|Invoke-Expression)\b|\b(?:iex|Invoke-Expression)\b[^\n;]*\b(?:iwr|irm|Invoke-WebRequest|Invoke-RestMethod|DownloadString)\b|(?:ba|z)?sh\s+<\(\s*(?:curl|wget)\b/i },
	// Sending data out
	{ reason: '外部へのデータ送信 (curl / wget の送信)', test: /\bcurl\b[^\n;|]*\s(?:-d|--data(?:-\w+)?|-F|--form|-T|--upload-file|-X\s*(?:POST|PUT|PATCH)|--request\s+(?:POST|PUT|PATCH))(?:\s|=|$)|\bwget\b[^\n;|]*--post-(?:data|file)\b/i },
	{ reason: '外部へのファイル転送 (scp / rsync / sftp / nc)', test: new RegExp(CMD + String.raw`(?:scp|sftp|nc|ncat|netcat|socat)\b|\brsync\b[^\n;|]*\s\S+@?\S*:`) },
	{ reason: '外部へのデータ送信 (PowerShell)', test: /\b(?:Invoke-WebRequest|Invoke-RestMethod|iwr|irm)\b[^\n;|]*-Method\s+(?:Post|Put|Patch)\b/i },
];

/**
 * Why `command` must be approved by the user, or undefined when it may follow the auto-approve setting.
 */
export const highRiskCommandReason = (command: string): string | undefined => {
	const cmd = command.trim();
	if (!cmd) { return undefined; }
	return RULES.find(r => r.test.test(cmd))?.reason;
};
