# Minimalist Themes

A pair of low-chrome, whitespace-first color themes designed for the Electron-based VS Code shell.

## Themes
- **Minimalist Light** — near-white background, single accent (near-black), no decorative borders.
- **Minimalist Dark** — near-black background, near-white accent, soft separators.

## Design Principles
1. **Reduce visual noise** — remove non-essential borders, badges and shadows.
2. **One accent only** — foreground/background contrast does the work; no rainbow tokens.
3. **Generous whitespace** — backgrounds for activity bar, side bar, panels and editor share the same tone so the eye is not pulled by chrome.
4. **Typography-led syntax highlighting** — emphasis is conveyed through `bold` / `italic` rather than hue.

## Activate
1. Build & launch the Electron app (`./scripts/code.sh` or `code-oss` on this fork).
2. Open the command palette (`Cmd/Ctrl+K Cmd/Ctrl+T`) → **Color Theme** → pick *Minimalist Light* or *Minimalist Dark*.

## Recommended companion settings
For the most minimal look, add to `settings.json`:

