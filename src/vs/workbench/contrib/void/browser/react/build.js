/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { spawn } from 'cross-spawn'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)

// Load .env from project root
const envPath = findDesiredPathFromLocalPath('.env', __dirname);
if (envPath) {
	const envContent = fs.readFileSync(envPath, 'utf8');
	envContent.split('\n').forEach(line => {
		const [key, ...value] = line.split('=');
		if (key && value.length > 0) {
			process.env[key.trim()] = value.join('=').trim();
		}
	});
	console.log('✅ Loaded .env file');
}

function doesPathExist(filePath) {
	try {
		const stats = fs.statSync(filePath);

		return stats.isFile();
	} catch (err) {
		if (err.code === 'ENOENT') {
			return false;
		}
		throw err;
	}
}

/*

This function finds `globalDesiredPath` given `localDesiredPath` and `currentPath`

Diagram:

...basePath/
└── void/
	├── ...currentPath/ (defined globally)
	└── ...localDesiredPath/ (defined locally)

*/
function findDesiredPathFromLocalPath(localDesiredPath, currentPath) {

	// walk upwards until currentPath + localDesiredPath exists
	while (!doesPathExist(path.join(currentPath, localDesiredPath))) {
		const parentDir = path.dirname(currentPath);

		if (parentDir === currentPath) {
			return undefined;
		}

		currentPath = parentDir;
	}

	// return the `globallyDesiredPath`
	const globalDesiredPath = path.join(currentPath, localDesiredPath)
	return globalDesiredPath;
}

// 依存ライブラリ (例: @supabase/supabase-js) が同梱する TypeScript ランタイムヘルパー
// (`__rest`, `__awaiter` など) は、tsup が生成する各バンドルのトップレベルへ inline で
// 取り込まれてしまう。vscode 本体側のバンドラ (gulp + esbuild) が複数バンドルを
// `workbench.desktop.main.js` に結合する際、これらが同一スコープに重複宣言されて
// `SyntaxError: Identifier '__rest' has already been declared` を引き起こす。
//
// 対策として、各 `out/<bundle>/index.js` 内で衝突しうる TS ヘルパー名を
// バンドル固有のユニーク名 (例: `__rest$void_onboarding$`) にリネームする。
// これらはバンドル内クローズドな実装ヘルパーなので外部参照は無く、安全に置換できる。
const TS_HELPER_NAMES = [
	'__rest',
	'__awaiter',
	'__extends',
	'__generator',
	'__values',
	'__read',
	'__spreadArray',
	'__spreadArrays',
	'__asyncValues',
	'__asyncGenerator',
	'__asyncDelegator',
	'__makeTemplateObject',
	'__importDefault',
	'__importStar',
	'__classPrivateFieldGet',
	'__classPrivateFieldSet',
	'__classPrivateFieldIn',
	'__createBinding',
	'__exportStar',
];
function renameTsHelpersInBundle(bundleFile, bundleId) {
	try {
		if (!fs.existsSync(bundleFile)) return;
		const original = fs.readFileSync(bundleFile, 'utf8');
		let content = original;
		const sanitizedId = bundleId.replace(/[^a-zA-Z0-9_]/g, '_');
		const renamed = [];
		for (const helper of TS_HELPER_NAMES) {
			// このバンドル内で実際に top-level 宣言されているヘルパーだけを対象にする。
			// (`function __rest(` または `var __rest =` など)
			const declared = new RegExp(`^(?:function|var|let|const)\\s+${helper}\\b`, 'm').test(content);
			if (!declared) continue;
			const unique = `${helper}$${sanitizedId}$`;
			content = content.replace(new RegExp(`\\b${helper}\\b`, 'g'), unique);
			renamed.push(helper);
		}
		if (renamed.length > 0 && content !== original) {
			fs.writeFileSync(bundleFile, content);
			console.log(`🛠  Renamed TS helpers in ${path.relative(__dirname, bundleFile)}: ${renamed.join(', ')}`);
		}
	} catch (err) {
		console.error(`❌ Error renaming TS helpers in ${bundleFile}:`, err);
	}
}
function dedupeTsHelpersInOut() {
	try {
		const outDir = path.join(__dirname, 'out');
		if (!fs.existsSync(outDir)) return;
		for (const entry of fs.readdirSync(outDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const bundleFile = path.join(outDir, entry.name, 'index.js');
			renameTsHelpersInBundle(bundleFile, entry.name);
		}
	} catch (err) {
		console.error('❌ Error scanning out/ for TS helper deduplication:', err);
	}
}

// tsup は new URL('../assets/foo.png', import.meta.url) で参照される静的ファイルを
// out/ にコピーしないため、明示的に同期する。
// `out/<entry>/index.js` から `../assets/...` で解決されることを前提に
// `src/assets/*` を `out/assets/` 配下へそのままコピーする。
function copyAssetsToOut() {
	try {
		const srcAssetsDir = path.join(__dirname, 'src', 'assets');
		const outAssetsDir = path.join(__dirname, 'out', 'assets');
		if (!fs.existsSync(srcAssetsDir)) return;
		fs.mkdirSync(outAssetsDir, { recursive: true });
		for (const entry of fs.readdirSync(srcAssetsDir, { withFileTypes: true })) {
			if (!entry.isFile()) continue;
			const from = path.join(srcAssetsDir, entry.name);
			const to = path.join(outAssetsDir, entry.name);
			fs.copyFileSync(from, to);
		}
		console.log(`📁 Copied assets/ → out/assets/`);
	} catch (err) {
		console.error('❌ Error copying assets to out:', err);
	}
}

// hack to refresh styles automatically
function saveStylesFile() {
	setTimeout(() => {
		try {
			const pathToCssFile = findDesiredPathFromLocalPath('./src/vs/workbench/contrib/void/browser/react/src2/styles.css', __dirname);

			if (pathToCssFile === undefined) {
				console.error('[scope-tailwind] Error finding styles.css');
				return;
			}

			// Or re-write with the same content:
			const content = fs.readFileSync(pathToCssFile, 'utf8');
			fs.writeFileSync(pathToCssFile, content, 'utf8');
			console.log('[scope-tailwind] Force-saved styles.css');
		} catch (err) {
			console.error('[scope-tailwind] Error saving styles.css:', err);
		}
	}, 6000);
}

const args = process.argv.slice(2);
const isWatch = args.includes('--watch') || args.includes('-w');

if (isWatch) {
	// this just builds it if it doesn't exist instead of waiting for the watcher to trigger
	// Check if src2/ exists; if not, do an initial scope-tailwind build
	if (!fs.existsSync('src2')) {
		try {
			console.log('🔨 Running initial scope-tailwind build to create src2 folder...');
			execSync(
				'npx --no-install scope-tailwind ./src -o src2/ -s void-scope -c styles.css -p "void-"',
				{ stdio: 'inherit' }
			);
			console.log('✅ src2/ created successfully.');
		} catch (err) {
			console.error('❌ Error running initial scope-tailwind build:', err);
			process.exit(1);
		}
	}

	// Watch mode
	const scopeTailwindWatcher = spawn('npx', [
		'nodemon',
		'--watch', 'src',
		'--ext', 'ts,tsx,css',
		'--exec',
		'npx scope-tailwind ./src -o src2/ -s void-scope -c styles.css -p "void-"'
	]);

	// 起動時に一度だけアセットをコピー。watch 中の差し替えはあまり想定されないが、
	// ファイル数が少ないので毎ビルド完了時に再コピーしてもコストは無視できる。
	copyAssetsToOut();
	// 既存ビルド出力に対しても helper 重複対策を実行 (watch 起動時の安全策)
	dedupeTsHelpersInOut();

	const tsupWatcher = spawn('npx', [
		'tsup',
		'--watch'
	]);

	scopeTailwindWatcher.stdout.on('data', (data) => {
		console.log(`[scope-tailwind] ${data}`);
		// If the output mentions "styles.css", trigger the save:
		if (data.toString().includes('styles.css')) {
			saveStylesFile();
		}
	});

	scopeTailwindWatcher.stderr.on('data', (data) => {
		console.error(`[scope-tailwind] ${data}`);
	});

	// Handle tsup watcher output
	tsupWatcher.stdout.on('data', (data) => {
		console.log(`[tsup] ${data}`);
		// tsup が再ビルドを完了したタイミングでアセットを再コピーする。
		// メッセージは `Build success` / `DTS Build success` / `Build complete` 等のため広めに拾う。
		const text = data.toString();
		if (/build\s+success|build\s+complete|⚡/i.test(text)) {
			copyAssetsToOut();
			// tsup の再ビルド完了直後に helper 名衝突を解消する。
			dedupeTsHelpersInOut();
		}
	});

	tsupWatcher.stderr.on('data', (data) => {
		console.error(`[tsup] ${data}`);
	});

	// Handle process termination
	process.on('SIGINT', () => {
		scopeTailwindWatcher.kill();
		tsupWatcher.kill();
		process.exit();
	});

	console.log('🔄 Watchers started! Press Ctrl+C to stop both watchers.');
} else {
	// Build mode
	console.log('📦 Building...');

	// Run scope-tailwind once
	execSync('npx -y scope-tailwind ./src -o src2/ -s void-scope -c styles.css -p "void-"', { stdio: 'inherit' });

	// Run tsup once
	execSync('npx tsup', { stdio: 'inherit' });

	// 静的アセット (assets/*.png 等) を out/ にコピー
	copyAssetsToOut();

	// 各バンドル内の TypeScript ランタイムヘルパー (`__rest` 等) をユニーク名にリネームし、
	// vscode 本体側のバンドル時に発生する `Identifier '__rest' has already been declared` を防ぐ。
	dedupeTsHelpersInOut();

	console.log('✅ Build complete!');
}
