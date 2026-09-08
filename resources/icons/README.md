# Brand assets

The mark is a worn ink seal on paper carrying **印**, to print. Warm-white paper
plate, graphite seal, no third colour.

## Which file to use

| File                    | Use it for                                                  |
| ----------------------- | ----------------------------------------------------------- |
| `inkleaf.svg`           | App icon master, 1024. Anything **32 px and above**.        |
| `inkleaf-small.svg`     | App icon at **16 and 24 px only**.                          |
| `inkleaf-tray.svg`      | Tray glyph. 16-unit grid, single colour via `currentColor`. |
| `inkleaf-lockup-zh.svg` | 印页 + 让文字成页. Chinese-facing surfaces.                 |
| `inkleaf-lockup-en.svg` | Inkleaf + tagline. English-facing surfaces.                 |
| `inkleaf-<n>.png`       | 1024, 512, 256, 128, 64, 48, 32, 24, 16.                    |
| `inkleaf.ico`           | Windows. 16 through 256.                                    |
| `inkleaf.icns`          | macOS. 32 through 1024.                                     |
| `tray-dark-<n>.png`     | Tray on a **light** menu bar. 16, 32, 48.                   |
| `tray-light-<n>.png`    | Tray on a **dark** menu bar. 16, 32, 48.                    |

Wired into `package.json` and the desktop UI as of 0.4.9:

```json
"build": {
  "win": { "icon": "resources/icons/inkleaf.ico" },
  "mac": { "icon": "resources/icons/inkleaf.icns" }
}
```

The preview and settings headers use `inkleaf-small.svg` at 24 px. The search bar uses only the Inkleaf name. README headers
use the master-derived PNG. Native windows use `inkleaf.ico`, and the tray uses
the supplied 16/32/48 PNG representations, choosing light or dark according to
the system taskbar theme. Windows builds keep executable icon/metadata editing
enabled while disabling code signing (`signExecutable: false`).

## Rules

- **Three masters, never one file scaled.** 16 and 24 come from `inkleaf-small.svg`,
  which drops the edge wear and enlarges the character. Scaling `inkleaf.svg` down
  to 16 gives a grey smudge.
- **Clear space** is 10% of the icon width. The plate already sits on a 100/1024
  inset, so do not place it full-bleed.
- **One icon for both languages.** The seal is the constant; language lives in the
  lockup beside it. Do not make a separate Latin icon.
- Do not recolour, rotate, crop, outline, or add a shadow or gradient.

| Role           | Hex       |
| -------------- | --------- |
| Paper plate    | `#F6F2EA` |
| Plate hairline | `#E1DACA` |
| Seal, wordmark | `#30343B` |
| Tray on light  | `#30343B` |
| Tray on dark   | `#E8E6E1` |

## Provenance

The character outline comes from **Noto Serif SC**, SIL OFL 1.1, which permits
outlining and commercial use. It is shipped as path data, so nothing here depends
on a font at runtime. The seal geometry, the wear, the palette and the proportions
are ours; a common character in a common serif is not, and does not need to be.

`印` is set at weight 700 and squared up to fill the seal face, the way a carver
fits a character to the stone.

## Regenerating

Both steps write into this directory. Run from the repo root.

```bash
python resources/icons/tools/build_svg.py
```

```bash
npx electron resources/icons/tools/rasterize.cjs
```

`build_svg.py` needs `fonttools` and a copy of Noto Serif SC. It looks in
`C:/Windows/Fonts/NotoSerifSC-VF.ttf`; set `INKLEAF_FONT` to point elsewhere.
`rasterize.cjs` draws every size through Chromium at a forced device scale factor
of 1, then packs the `.ico` and `.icns` containers by hand.

To change the drawing, edit the seal and glyph boxes in `build_svg.py` and rerun
both steps. `stamp.py` generates the worn edge from fixed parameters, so rebuilds
are identical.
