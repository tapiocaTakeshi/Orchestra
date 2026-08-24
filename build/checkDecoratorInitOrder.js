/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// バンドル済み JS の中から「まだ初期化されていない service decorator を
// クラス定義時に使ってしまっている」箇所を検出する。
//
// 背景:
// バンドラ (esbuild) は循環 import を見つけると片方のモジュールを先に評価する。
// `createDecorator()` の結果を入れた変数はバンドル後 `var` に巻き上げられるため、
// 先に評価された側から見ると値は `undefined` になる。そこに
// `__decorate([__param(0, IFooService)], Klass)` が走ると
//   TypeError: decorator is not a function
// が投げられ、workbench 全体の起動が失敗する (ユーザーには
// 「Orchestra を起動できませんでした」ダイアログしか見えない)。
//
// ビルドは成功してしまうため、パッケージング時にバンドルを静的に検査して
// CI で気付けるようにする。修正方法は decorator を実装ファイルから切り離し、
// 依存の無い `*Interface.ts` に置くこと (例: chatThreadServiceInterface.ts)。

// `var IFooService = createDecorator("fooService");`
// (esbuild が名前衝突を解消して createDecorator2 などにリネームする場合も拾う)
const DEFINITION = /^(?:var|let|const)\s+([A-Za-z0-9_$]+)\s*=\s*createDecorator[A-Za-z0-9_$]*\s*\(/;

// トップレベル (インデント無し) のクラスデコレート開始行。
// 関数の中で組み立てられるクラスは評価順に依存しないので対象外にする。
const DECORATE_START = /^([A-Za-z0-9_$]+)\s*=\s*__decorate\(\[/;

const PARAM = /__param\(\s*\d+\s*,\s*([A-Za-z0-9_$]+)\s*\)/g;

/**
 * @param {string} contents バンドル済み JS の中身
 * @returns {{ target: string, decorator: string, usedAtLine: number, definedAtLine: number }[]}
 */
function findDecoratorsUsedBeforeInit(contents) {
	const lines = contents.split('\n');

	/** @type {Map<string, number>} */
	const definedAt = new Map();
	for (let i = 0; i < lines.length; i++) {
		const match = DEFINITION.exec(lines[i]);
		if (match && !definedAt.has(match[1])) {
			definedAt.set(match[1], i + 1);
		}
	}

	const violations = [];
	for (let i = 0; i < lines.length; i++) {
		const start = DECORATE_START.exec(lines[i]);
		if (!start) {
			continue;
		}

		// `X = __decorate([ ... ], X);` の閉じ括弧までを 1 ブロックとして見る
		for (let j = i; j < lines.length; j++) {
			PARAM.lastIndex = 0;
			let param;
			while ((param = PARAM.exec(lines[j]))) {
				const decorator = param[1];
				const definitionLine = definedAt.get(decorator);
				if (definitionLine !== undefined && definitionLine > j + 1) {
					violations.push({ target: start[1], decorator, usedAtLine: j + 1, definedAtLine: definitionLine });
				}
			}
			if (/^\]/.test(lines[j])) {
				i = j;
				break;
			}
		}
	}

	return violations;
}

/**
 * 検査して問題があれば投げる。
 *
 * @param {string} fileName エラーメッセージに出すファイル名
 * @param {string} contents バンドル済み JS の中身
 */
function assertDecoratorInitOrder(fileName, contents) {
	const violations = findDecoratorsUsedBeforeInit(contents);
	if (violations.length === 0) {
		return;
	}

	const lines = [
		`${fileName}: ${violations.length} class(es) are decorated with a service decorator that is not initialized yet.`,
		'This is a circular import: at runtime the decorator is `undefined` and the workbench fails to boot with',
		'"TypeError: decorator is not a function". Move the decorator into a dependency-free `*Interface.ts`',
		'(see src/vs/workbench/contrib/void/browser/chatThreadServiceInterface.ts) and import it from there.',
		...violations.map(v => `  ${v.target}: @${v.decorator} used at line ${v.usedAtLine}, but defined at line ${v.definedAtLine}`)
	];

	throw new Error(lines.join('\n'));
}

module.exports = { findDecoratorsUsedBeforeInit, assertDecoratorInitOrder };

if (require.main === module) {
	const fs = require('fs');
	for (const file of process.argv.slice(2)) {
		assertDecoratorInitOrder(file, fs.readFileSync(file, 'utf8'));
		console.log(`${file}: ok`);
	}
}
