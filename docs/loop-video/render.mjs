/**
 * Renders docs/loop-video/scene.html into a seamlessly looping video.
 *
 * The scene is animated by a pure function of time (`window.setT(t)`), so every
 * frame is captured deterministically — frame 0 and frame N are identical and
 * the result loops without a seam.
 *
 * Usage:
 *   node docs/loop-video/render.mjs                 # full render -> orchestra-loop.mp4
 *   node docs/loop-video/render.mjs --preview 0,5,12 # single PNG frames, for checking
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = 1920, H = 1080, FPS = 30, DURATION = 30;   // must match D in scene.html
const TOTAL = FPS * DURATION;

const FONTS = [
	['NotoSansJP-Regular.ttf', 'https://fonts.gstatic.com/s/notosansjp/v56/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.ttf'],
	['NotoSansJP-Bold.ttf', 'https://fonts.gstatic.com/s/notosansjp/v56/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFPYk75s.ttf'],
	['NotoSansJP-Black.ttf', 'https://fonts.gstatic.com/s/notosansjp/v56/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFLgk75s.ttf'],
];

/** Make sure Noto Sans JP is visible to fontconfig, so the page can use it. */
async function ensureFonts() {
	const dir = path.join(os.homedir(), '.local', 'share', 'fonts');
	fs.mkdirSync(dir, { recursive: true });
	let added = false;
	for (const [name, url] of FONTS) {
		const dest = path.join(dir, name);
		if (fs.existsSync(dest) && fs.statSync(dest).size > 100000) { continue; }
		process.stdout.write(`font: downloading ${name}\n`);
		const res = await fetch(url);
		if (!res.ok) { throw new Error(`font download failed: ${name} (${res.status})`); }
		fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
		added = true;
	}
	if (added) {
		const fc = spawn('fc-cache', ['-f', dir], { stdio: 'ignore' });
		await once(fc, 'close');
	}
}

function ffmpegPath() {
	const local = path.join(HERE, 'node_modules', 'ffmpeg-static', 'ffmpeg');
	if (fs.existsSync(local)) { return local; }
	if (process.env.FFMPEG) { return process.env.FFMPEG; }
	return 'ffmpeg';
}

async function openScene() {
	const browser = await chromium.launch({
		args: ['--allow-file-access-from-files', '--force-color-profile=srgb', '--font-render-hinting=none'],
	});
	const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
	await page.goto('file://' + path.join(HERE, 'scene.html'), { waitUntil: 'load' });
	await page.evaluate(() => document.fonts.ready);
	await page.evaluate(() => Promise.all(
		Array.from(document.images).filter(i => !i.complete).map(i => i.decode().catch(() => { }))));
	return { browser, page };
}

async function preview(list) {
	const { browser, page } = await openScene();
	for (const sec of list) {
		await page.evaluate(t => window.setT(t), Number(sec));
		const out = path.join(HERE, `preview-${String(sec).replace('.', '_')}s.png`);
		await page.screenshot({ path: out });
		console.log('wrote', out);
	}
	await browser.close();
}

async function render() {
	const out = path.join(HERE, 'orchestra-loop.mp4');
	const { browser, page } = await openScene();

	const ff = spawn(ffmpegPath(), [
		'-y', '-hide_banner', '-loglevel', 'error',
		'-f', 'image2pipe', '-framerate', String(FPS), '-i', 'pipe:0',
		'-c:v', 'libx264', '-preset', 'slow', '-crf', '19',
		'-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1',
		'-g', String(FPS * 2), '-movflags', '+faststart',
		'-r', String(FPS), out,
	], { stdio: ['pipe', 'inherit', 'inherit'] });

	const t0 = Date.now();
	for (let f = 0; f < TOTAL; f++) {
		await page.evaluate(t => window.setT(t), f / FPS);
		const buf = await page.screenshot({ type: 'jpeg', quality: 96 });
		if (!ff.stdin.write(buf)) { await once(ff.stdin, 'drain'); }
		if (f % 60 === 0 || f === TOTAL - 1) {
			const pct = ((f + 1) / TOTAL * 100).toFixed(1);
			const el = ((Date.now() - t0) / 1000).toFixed(0);
			process.stdout.write(`frame ${f + 1}/${TOTAL}  ${pct}%  ${el}s\n`);
		}
	}
	ff.stdin.end();
	await browser.close();
	const [code] = await once(ff, 'close');
	if (code !== 0) { throw new Error('ffmpeg exited with ' + code); }
	console.log('wrote', out, (fs.statSync(out).size / 1e6).toFixed(2) + ' MB');
}

const argv = process.argv.slice(2);
await ensureFonts();
const pi = argv.indexOf('--preview');
if (pi !== -1) { await preview((argv[pi + 1] ?? '0').split(',')); }
else { await render(); }
