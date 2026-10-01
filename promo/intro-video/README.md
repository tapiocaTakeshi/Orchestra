# Orchestra intro video

A ~75 second Japanese introduction video for Orchestra, built as HTML motion
graphics and rendered frame by frame to MP4. The background music is
synthesized too, so the whole video is reproducible from this folder.

```bash
./tools/fetch-fonts.sh                 # once: Noto Sans JP / Inter / JetBrains Mono into fonts/
python3 tools/music.py                 # out/music.wav from tools/music.json (needs numpy)
node tools/render.cjs video            # out/orchestra-intro.mp4 (needs ffmpeg + Playwright)
```

Open `index.html` through any static server (`npx serve .`) for a preview
player with a scrubber, scene jump list and the music.

## How it works

- `scenes/manifest.js` lists the scene ids in playback order.
- Each `scenes/<id>.js` calls `ORC.register({ id, duration, transition, build, draw })`.
  - `build(root)` creates the scene's DOM once inside `root` (a 1920×1080 box) and returns a state object.
  - `draw(t, state, root)` sets every style from the scene-local time `t` in seconds.
- `lib/core.js` lays the scenes end to end and `ORC.seek(T)` draws global time `T`,
  compositing the incoming transition over the previous scene (which keeps being
  drawn past its end while it is covered, so `draw` must accept `t > duration`).
- `tools/render.cjs` serves the folder, drives headless Chromium through every
  frame at 30 fps and pipes the screenshots into ffmpeg.

### The one rule: a frame is a pure function of `t`

No `requestAnimationFrame`, timers, `Date`, `Math.random()`, CSS transitions or
CSS animations (base.css disables them). Use `ORC.u.rng(seed)` for randomness
and compute everything from `t`. Drawing the same `t` twice must give the same
pixels, and drawing `t` without having drawn earlier frames must work too
(workers start mid-timeline, and stills jump straight to a time).

## Scene API cheat sheet

`const { u, c, ease } = ORC;`

| helper | what it does |
|---|---|
| `u.p(t, start, dur, ease?)` | progress 0..1 through `[start, start+dur]` |
| `u.range(t, start, dur, from, to, ease?)` | value from `from` to `to` over that window |
| `u.env(t, inStart, inDur, outStart, outDur)` | fade-in / hold / fade-out envelope |
| `u.keys(t, [[t0, v0], [t1, v1, ease?], ...])` | piecewise keyframes |
| `u.typed(str, t, start, cps)` | typewriter prefix |
| `u.count(t, start, dur, from, to, decimals)` | counting number as string |
| `u.rng(seed)`, `u.noise(x, seed)` | deterministic randomness |
| `u.h(tag, props, ...children)`, `u.svg(tag, attrs, ...children)` | DOM builders (`props.class/style/text/html`) |
| `u.tf(el, {x, y, s, sx, sy, r, o, blur, origin})` | transform + opacity + blur in one call |
| `u.rise(el, t, start, dur, dist)` | standard fade-up entrance |
| `u.chars(el, text)` | split into per-character spans |
| `ease.outCubic`, `outExpo`, `outBack`, `inOutCubic`, `spring`, ... | easings |

| component | what it gives you |
|---|---|
| `c.backdrop({tint})` | the shared noir background; call `.draw(t)` |
| `c.mark({width, variant: 'splash'|'small', ambient})` | the animated brand mark (two weaving strands opening into arrows); `.draw(t, {reveal, launch, light, speed})` |
| `c.logo(size)` | the red ring logo PNG |
| `c.headline(text, {cls, style})` + `c.reveal/hide/cycle(chars, t, ...)` | kinetic captions |
| `c.label(text)` | small gold Latin caps label |
| `c.zoomBox(z, style)` | container that enlarges native-size UI mocks crisply (`zoom`) |
| `c.ideWindow({width, height, running})` | Orchestra window: `.titlebar .editor .chat .thread .chatFoot` |
| `c.home({highlight})` | agent-mode home screen (editor watermark) |
| `c.greet()` | chat greeting block |
| `c.composer()` | two-row chat composer; `.setText(str, caret, 'idle'|'running'|'waiting')` |
| `c.bubble(text)` | user message bubble |
| `c.card({n, title, role, body, open})` | role step card; `.draw(t, 'running'|'done', openK)` |
| `c.indicator(text)` | gold dot + shimmer label + small mark; `.draw(t)` |
| `c.code(lines)` | syntax-coloured editor lines |
| `c.icon(name, size)` | lucide icons used by the UI |

## Look and feel

- Palette: noir backgrounds `#0e0c0b` / `#131110` / `#1a1716`, ivory text `#ece6de` /
  `#f7f2ea`, muted `#877c72`, champagne gold `#c6a769` (accents, focus, progress),
  garnet `#8f1d2c` (filled buttons), brand crimson `#d8283b` / `#dc1428` (logo and
  mark only). This is the shipped Orchestra Dark theme.
- Type: Noto Sans JP (900/700 headlines, 500 body), Inter for Latin labels,
  JetBrains Mono for code. Classes `t-hero / t-h1 / t-h2 / t-h3 / t-body / t-label`.
- Keep text inside a 120px safe margin, and give every caption at least
  0.25 s per character plus 0.5 s on screen.
- UI mocks use the product's real strings and colours (see `lib/ui.css`).

## Checking a scene

```bash
node tools/render.cjs sheet  --scene 03-goal            # out/sheets/03-goal.png contact sheet (every 0.5 s)
node tools/render.cjs stills --scene 03-goal --times 1,2.5
node tools/render.cjs sheet  --scene 03-goal --global   # through the timeline, with transitions
node tools/render.cjs video  --only 03-goal --no-audio --out out/03-goal.mp4
```

Any page error, console error or missing file aborts the render.
