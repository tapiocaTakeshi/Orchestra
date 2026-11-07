// usage: node render.js out.mp4 [fps]   |   node render.js --stills t1 t2 ...
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

(async () => {
  const args = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'index.html'));
  await page.evaluate(async () => { await document.fonts.ready; });
  // touch every scene once so all font subsets load
  for (const t of [3, 9, 15, 25, 32, 38, 44, 50]) await page.evaluate(t => window.setTime(t), t);
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(500);

  if (args[0] === '--stills') {
    for (const t of args.slice(1)) {
      await page.evaluate(t => window.setTime(t), Number(t));
      await page.screenshot({ path: path.join(__dirname, `still_${t}.png`) });
    }
    await browser.close();
    return;
  }

  const out = args[0] || 'out.mp4';
  const fps = Number(args[1] || 30);
  const duration = await page.evaluate(() => window.DURATION);
  const frames = Math.round(duration * fps);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < frames; i++) {
    await page.evaluate(t => window.setTime(t), i / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i}/${frames}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  console.log('done', out);
})();
