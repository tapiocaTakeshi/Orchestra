/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// リリースタグを product.json の voidVersion に焼き込む。
//
// 自動アップデートの「今のバージョン」は product.json の voidVersion から読む
// (VoidMainUpdateService#_getCurrentVersion)。ここを更新せずにリリースすると、
// 配布されたビルドは全部が同じ古いバージョンを名乗ることになり、
//   最新リリース (タグ) > 名乗っているバージョン
// が永久に成り立つ。つまり「アップデートがあります」が出続け、更新しても
// また同じ更新を勧められる = ユーザーから見れば「アップデートできない」。
//
// 使い方:  node build/stamp-release-version.js v1.7.0

'use strict';

const fs = require('fs');
const path = require('path');

const productJsonPath = path.join(path.dirname(__dirname), 'product.json');

/**
 * "v1.7.0" -> "1.7.0"。数字とドットで始まる形でなければ null を返す。
 * @param {string | undefined} tag
 */
function versionFromTag(tag) {
	const trimmed = (tag || '').trim().replace(/^v/i, '');

	return /^\d+(\.\d+)*([-+].*)?$/.test(trimmed) ? trimmed : null;
}

function main() {
	const tag = process.argv[2];
	const version = versionFromTag(tag);

	if (!version) {
		console.error(`stamp-release-version: '${tag}' はバージョンタグとして解釈できません (例: v1.7.0)`);
		process.exit(1);
	}

	const product = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
	const previous = product.voidVersion;
	product.voidVersion = version;

	fs.writeFileSync(productJsonPath, JSON.stringify(product, undefined, '\t') + '\n');
	console.log(`stamp-release-version: product.json voidVersion ${previous} -> ${version}`);
}

main();
