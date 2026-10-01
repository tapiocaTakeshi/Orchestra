#!/usr/bin/env node
// Renders the intro video frame by frame with headless Chromium.
//
//   node tools/render.cjs video  [--workers 3] [--from 0] [--to 75] [--out out/orchestra-intro.mp4] [--crf 14] [--keep-frames] [--no-audio]
//   node tools/render.cjs stills --scene 03-leader [--times 0.5,2,4 | --every 1] [--out out/stills]
//   node tools/render.cjs sheet  --scene 03-leader [--every 0.5] [--out out/sheets]
//   node tools/render.cjs timeline
//
// stills/sheet load only --scene (other scenes may not exist yet) unless --global
// is given, which renders through the full timeline to show transitions.
// --only a,b restricts any mode to those scenes.
//
// A page error or console error aborts the render: a broken scene must never
// silently produce blank frames.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FPS = 30;

function loadPlaywright() {
	try { return require('playwright'); } catch { /* fall through to the global install */ }
	return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}

function parseArgs(argv) {
	const args = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i].startsWith('--')) {
			const key = argv[i].slice(2);
			const next = argv[i + 1];
			args[key] = next === undefined || next.startsWith('--') ? true : (i++, next);
		} else {
			args._.push(argv[i]);
		}
	}
	return args;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.wav': 'audio/wav', '.jpg': 'image/jpeg' };
function serve() {
	return new Promise(resolve => {
		const server = http.createServer((req, res) => {
			const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
			if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
				res.writeHead(404).end();
				return;
			}
			res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
			fs.createReadStream(file).pipe(res);
		});
		server.listen(0, '127.0.0.1', () => resolve(server));
	});
}

async function openPage(browser, base, only) {
	const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
	const errors = [];
	page.on('pageerror', e => errors.push(`pageerror: ${e.stack || e}`));
	page.on('console', m => { if (m.type() === 'error') { errors.push(`console: ${m.text()}`); } });
	page.on('requestfailed', r => { if (!r.url().endsWith('music.wav')) { errors.push(`requestfailed: ${r.url()}`); } });
	await page.goto(`${base}/index.html?render=1${only ? `&only=${encodeURIComponent(only)}` : ''}`);
	await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 60000 });
	const err = await page.evaluate(async () => { if (window.__error) { return window.__error; } try { await window.__ready; return null; } catch (e) { return String(e.stack || e); } });
	if (err) { errors.push(err); }
	page.assertClean = () => {
		const bad = errors.filter(e => !/music\.wav/.test(e));
		if (bad.length) { throw new Error(`scene errors:\n${bad.join('\n')}`); }
	};
	page.assertClean();
	return page;
}

function ffmpeg(args, opts = {}) {
	const proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: [opts.stdin ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
	proc.done = new Promise((resolve, reject) => proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${args.join(' ')}`))));
	return proc;
}

async function writeFrame(stream, buf) {
	if (!stream.write(buf)) { await new Promise(r => stream.once('drain', r)); }
}

// Render frames [from, to) to numbered JPEGs in dir.
async function renderFrames(browser, base, from, to, dir, label, only) {
	const page = await openPage(browser, base, only);
	const t0 = Date.now();
	for (let f = from; f < to; f++) {
		await page.evaluate(T => ORC.seek(T), f / FPS);
		await page.screenshot({ type: 'jpeg', quality: 97, path: path.join(dir, `${String(f).padStart(5, '0')}.jpg`) });
		if ((f - from) % 150 === 0) {
			page.assertClean();
			const done = f - from;
			process.stdout.write(`[${label}] ${done}/${to - from} frames (${((Date.now() - t0) / Math.max(done, 1)).toFixed(0)} ms/frame)\n`);
		}
	}
	page.assertClean();
	await page.close();
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const mode = args._[0] || 'video';
	const server = await serve();
	const base = `http://127.0.0.1:${server.address().port}`;
	const { chromium } = loadPlaywright();
	const browsers = [];
	const launch = async () => { const b = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'] }); browsers.push(b); return b; };
	try {
		const only = args.only || (mode !== 'video' && mode !== 'timeline' && args.scene && !args.global ? args.scene : '');
		const probe = await openPage(await launch(), base, only);
		const timeline = await probe.evaluate(() => ORC.timeline());
		const total = await probe.evaluate(() => ORC.total);

		if (mode === 'timeline') {
			console.log(JSON.stringify({ total, timeline }, null, 2));
		} else if (mode === 'stills' || mode === 'sheet') {
			const scene = args.scene;
			const item = timeline.find(x => x.id === scene);
			if (!item) { throw new Error(`--scene must be one of: ${timeline.map(x => x.id).join(', ')}`); }
			const dur = item.end - item.start;
			let times;
			if (args.times) { times = String(args.times).split(',').map(Number); } else {
				const every = parseFloat(args.every || (mode === 'sheet' ? .5 : 1));
				times = [];
				for (let t = 0; t < dur - 1e-6; t += every) { times.push(+t.toFixed(3)); }
				times.push(+(dur - 1 / FPS).toFixed(3));
			}
			const outDir = path.resolve(ROOT, args.out || (mode === 'sheet' ? 'out/sheets' : 'out/stills'));
			fs.mkdirSync(outDir, { recursive: true });
			const tmp = mode === 'sheet' ? fs.mkdtempSync(path.join(require('os').tmpdir(), 'sheet-')) : outDir;
			const files = [];
			for (const [i, t] of times.entries()) {
				// --global renders through ORC.seek so incoming/outgoing transitions are visible.
				if (args.global) { await probe.evaluate(T => ORC.seek(T), item.start + t); } else { await probe.evaluate(([id, tt]) => ORC.seekScene(id, tt), [scene, t]); }
				if (mode === 'sheet') {
					await probe.evaluate(label => {
						let el = document.getElementById('__label');
						if (!el) { el = Object.assign(document.createElement('div'), { id: '__label' }); el.style.cssText = 'position:fixed;left:0;top:0;z-index:999;padding:6px 14px;background:rgba(0,0,0,.75);color:#fff;font:600 44px Inter,monospace'; document.body.appendChild(el); }
						el.textContent = label;
					}, `${t.toFixed(2)}s`);
				}
				const file = mode === 'sheet' ? path.join(tmp, `${String(i).padStart(4, '0')}.png`) : path.join(outDir, `${scene}@${t.toFixed(2)}.png`);
				await probe.screenshot({ path: file });
				files.push(file);
			}
			probe.assertClean();
			if (mode === 'sheet') {
				const cols = 4, rows = Math.ceil(files.length / cols);
				const sheet = path.join(outDir, `${scene}.png`);
				await ffmpeg(['-framerate', '1', '-i', path.join(tmp, '%04d.png'), '-vf', `scale=480:270,tile=${cols}x${rows}:padding=4:color=0x333333`, '-frames:v', '1', sheet]).done;
				fs.rmSync(tmp, { recursive: true, force: true });
				console.log(sheet);
			} else {
				files.forEach(f => console.log(f));
			}
		} else if (mode === 'video') {
			const from = Math.round(parseFloat(args.from || 0) * FPS);
			const to = Math.round(parseFloat(args.to || total) * FPS);
			const workers = Math.max(1, parseInt(args.workers || 3, 10));
			const out = path.resolve(ROOT, args.out || 'out/orchestra-intro.mp4');
			// Workers write frames to disk; one encoder pass then gives uniform quality
			// (encoding per-worker segments shows quality steps at the joins).
			const frameDir = path.resolve(ROOT, 'out', `frames-${path.basename(out, path.extname(out))}`);
			fs.rmSync(frameDir, { recursive: true, force: true });
			fs.mkdirSync(frameDir, { recursive: true });
			const per = Math.ceil((to - from) / workers);
			const jobs = [];
			for (let w = 0; w < workers; w++) {
				const a = from + w * per, b = Math.min(to, a + per);
				if (a >= b) { break; }
				jobs.push((async () => renderFrames(w === 0 ? browsers[0] : await launch(), base, a, b, frameDir, `w${w}`, only))());
			}
			const t0 = Date.now();
			await Promise.all(jobs);
			const music = path.resolve(ROOT, args.music || 'out/music.wav');
			const len = (to - from) / FPS;
			const withAudio = fs.existsSync(music) && !args['no-audio'];
			fs.mkdirSync(path.dirname(out), { recursive: true });
			await ffmpeg([
				'-framerate', String(FPS), '-start_number', String(from), '-i', path.join(frameDir, '%05d.jpg'),
				...(withAudio ? ['-ss', String(from / FPS), '-i', music] : []),
				'-map', '0:v', ...(withAudio ? ['-map', '1:a', '-c:a', 'aac', '-b:a', '256k', '-af', `afade=t=out:st=${Math.max(0, len - 1.5)}:d=1.5`] : []),
				'-c:v', 'libx264', '-preset', 'slow', '-crf', String(args.crf || 14), '-pix_fmt', 'yuv420p', '-r', String(FPS),
				'-t', String(len), '-movflags', '+faststart', out,
			]).done;
			if (!args['keep-frames']) { fs.rmSync(frameDir, { recursive: true, force: true }); }
			console.log(`${out}  (${((to - from) / FPS).toFixed(1)}s, rendered in ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
		} else {
			throw new Error(`unknown mode ${mode}`);
		}
	} finally {
		await Promise.all(browsers.map(b => b.close()));
		server.close();
	}
}

if (require.main === module) {
	main().catch(e => { console.error(e.message || e); process.exit(1); });
}
