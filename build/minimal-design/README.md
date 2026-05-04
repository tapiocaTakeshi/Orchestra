# Minimal Design Overlay

This fork ships with a **Minimal Design** overlay that refines the default
VS Code workbench chrome:

- Calmer borders (single-pixel, 8% currentColor)
- Generous spacing tokens (`--md-space-1` … `--md-space-5`)
- Consistent rounding (`--md-radius-sm/md/lg`)
- Quieter title bar, status bar and tab strip
- Pill-style active editor tab indicator
- Card-style Command Palette and notifications
- Reduced-motion friendly transitions

## How it is wired

1. `src/vs/workbench/browser/media/minimal-design.css`
   contains every visual tweak. It uses low-specificity selectors so user
   themes (`workbench.colorCustomizations`) keep working.

2. `src/vs/workbench/browser/parts/minimalDesign.contribution.ts`
   side-effect imports the CSS so it ends up in the workbench bundle.

3. `src/vs/workbench/workbench.common.main.ts` imports the
   contribution alongside the standard workbench contributions.

## Customizing

Override any token in your user settings via a custom CSS extension, e.g.:

