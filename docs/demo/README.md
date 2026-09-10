# README demo

The English and Chinese animations capture the real Electron UI: type a partial filename, press Enter, preview a generated PDF, click its table-of-contents link and export a local PDF. The sample is [field-notes.md](field-notes.md).

Record again from the repository root on Windows:

```powershell
npm run build:ui
node docs/demo/record.cjs
python docs/demo/encode.py
```

To capture a packaged build, set `ALDUS_EXECUTABLE` to its `Inkleaf.exe` before
running the recorder. The current README media is recorded from the working
source with the two-action search bar and final brand assets. The isolated test
profile uses the production-facing Inkleaf name for the walkthrough.

The encoder requires Pillow (`python -m pip install Pillow`) and uses the Windows Microsoft YaHei font. It reads the current Windows wallpaper file, adds the captured app window and step captions, preserves capture timing, and produces 1280 × 800 GIFs plus static PNG alternatives in `docs/media/`. Because the background comes from the image file, the recording contains no taskbar, clock, desktop icons or unrelated application windows.

Use `python docs/demo/encode.py --wallpaper "C:\path\to\wallpaper.jpg"` to choose a specific background. The current media uses the Windows lake wallpaper `C:\Windows\Web\Wallpaper\ThemeC\img28.jpg`. The wallpaper source is read locally and is not copied into the repository as a separate asset.

The recorder uses a fresh isolated app profile, indexes only its sample folder, and verifies that export writes a PDF. It does not change personal settings or search personal documents. Raw frames, sample copies, profiles and exported PDFs stay in the ignored `artifacts/readme-demo/` folder; only the finished media belong in Git.

These are automated walkthroughs, not search benchmarks or recordings of the global shortcut. Background capture does not reproduce the Windows acrylic desktop backdrop. The search bar shows only Inkleaf text in both languages. Other surfaces retain the brand icon.

The encoder restores rounded window corners with an antialiased mask because `capturePage` does not include the native window clipping. New recordings store the UI corner radius in physical pixels; older recordings use their original 10 CSS-pixel radius at 125% Windows scaling.

## Markdown / PDF comparisons

`examples/` contains four small documents for headings and typography, code and math, tables and lists, and images and links. The two local image assets are copied from the existing brand and settings samples by the generator.

Run `npm run build:ui` and `node docs/demo/features.cjs` from the project root. This requires the existing Playwright dependency, Microsoft Edge, Poppler (`pdftoppm` on PATH), and Python with Pillow.

The generator launches the real desktop app with isolated settings, requests PDFs through its normal preview API, and checks that each example is one page, has text, has no resource/layout warnings, and leaves its source unchanged. The image/link example also checks actual PDF annotations. Poppler renders the saved PDFs; only empty paper margins are removed. A side-by-side source panel is then composed in Edge with bilingual labels. PDF content is never recreated as styled HTML.

Final PDF and PNG comparisons live in `docs/media/examples/`. Raw page renders, temporary profiles and a verification report stay in `artifacts/readme-features/`. The comparisons use Minimal, A4, 10.5 pt, standard margins, 1.6 line spacing, no author and no page numbers. Code uses the current engine's offline syntax highlighting. These images describe the current source, which may contain improvements beyond the latest installer.

## README hero

The links below the banner use local SVG assets in `docs/media/badges/`: `download-*` is the primary release-page button, `quick-start-*` links to the README guide, and `languages-*` groups the supported system/document languages. Keep the English and Chinese variants together when changing these assets. README language switching remains a separate text link. These are linked images, so the buttons do not depend on inline CSS or scripts.

Run `npm run build:ui` and `node docs/demo/hero.cjs` on Windows to regenerate all four wide banners. It requires Microsoft Edge, Poppler (`pdftoppm` on PATH), and the project's Playwright dependency.

The generator converts [hero.md](hero.md) through the real Electron preview API using a temporary profile. It then places the rendered PDF, a Markdown excerpt, the existing brand icon and localized text into a 1500 × 500 composition. The PDF is an actual engine output, not an illustrated page. Palettes and markup live in [banner.cjs](banner.cjs), which renders each language in a light and a dark theme. Outputs are `docs/media/hero-en.png`, `hero-zh.png`, `hero-en-dark.png`, `hero-zh-dark.png` and `hero-document.pdf`; intermediate renders stay in ignored `artifacts/readme-hero/`. The isolated temporary profile is removed after capture, and the source is unchanged.
