// Renders promo.html frame-by-frame and encodes it (with music.wav) into an MP4.
//
//   python3 promo/music.py            # -> promo/music.wav
//   node promo/render.mjs             # -> promo/orchestra-promo.mp4
//
// Env: FFMPEG (path to ffmpeg, default "ffmpeg"), FPS (default 30),
//      FROM / TO (seconds, render a partial range for previews).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FPS = Number(process.env.FPS || 30);
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const out = process.env.OUT || join(here, 'orchestra-promo.mp4');
const audio = join(here, 'music.wav');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(here, 'promo.html')).href + '?render=1', { waitUntil: 'networkidle' });
await page.evaluate(() => window.ready);
const duration = await page.evaluate(() => window.DURATION);
const from = Number(process.env.FROM || 0);
const to = Number(process.env.TO || duration);
const frames = Math.round((to - from) * FPS);

const args = ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-'];
const withAudio = existsSync(audio);
if (withAudio) args.push('-ss', String(from), '-t', String(to - from), '-i', audio);
args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
if (withAudio) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
args.push(out);
const ff = spawn(FFMPEG, args, { stdio: ['pipe', 'inherit', 'inherit'] });

for (let i = 0; i < frames; i++) {
  const t = from + i / FPS;
  await page.evaluate(t => window.render(t), t);
  const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % FPS === 0) process.stderr.write(`\rframe ${i}/${frames}`);
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
await browser.close();
console.error(`\nwrote ${out}`);
