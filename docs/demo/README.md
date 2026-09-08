# README demo

The English and Chinese animations capture the real Electron UI: type a partial filename, press Enter, preview a generated PDF, click its table-of-contents link and export a local PDF. The sample is [field-notes.md](field-notes.md).

Record again from the repository root on Windows:

```powershell
npm run build:ui
node docs/demo/record.cjs
python docs/demo/encode.py
```

To capture a packaged build, set `ALDUS_EXECUTABLE` to its `Inkleaf.exe` before
running the recorder. The current README media was recorded from the 0.4.10
Windows package, with the final brand assets.

The encoder requires Pillow (`python -m pip install Pillow`) and uses the Windows Microsoft YaHei font. It reads the current Windows wallpaper file, adds the captured app window and step captions, preserves capture timing, and produces 1280 × 800 GIFs plus static PNG alternatives in `docs/media/`. Because the background comes from the image file, the recording contains no taskbar, clock, desktop icons or unrelated application windows.

Use `python docs/demo/encode.py --wallpaper "C:\path\to\wallpaper.jpg"` to choose a specific background. The current media uses the Windows lake wallpaper `C:\Windows\Web\Wallpaper\ThemeC\img28.jpg`. The wallpaper source is read locally and is not copied into the repository as a separate asset.

The recorder uses a fresh isolated app profile, indexes only its sample folder, and verifies that export writes a PDF. It does not change personal settings or search personal documents. Raw frames, sample copies, profiles and exported PDFs stay in the ignored `artifacts/readme-demo/` folder; only the finished media belong in Git.

These are automated walkthroughs, not search benchmarks or recordings of the global shortcut. Background capture does not reproduce the Windows acrylic desktop backdrop. The search bar shows only Inkleaf text in both languages. Other surfaces retain the brand icon.

The encoder restores rounded window corners with an antialiased mask because `capturePage` does not include the native window clipping. New recordings store the UI corner radius in physical pixels; older recordings use their original 10 CSS-pixel radius at 125% Windows scaling.

## Markdown / PDF comparisons

`examples/` contains four small documents for headings and typography, code and math, tables and lists, and images and links. The two local image assets are copied from the existing brand and settings samples by the generator.

Run `npm run build:ui` and `node docs/demo/features.cjs` from the project root. This requires the existing Playwright dependency, Microsoft Edge, Poppler (`pdftoppm` on PATH), and Python with Pillow.

The generator launches the real desktop app with isolated settings, requests PDFs through its normal preview API, and checks that each example is one page, has text, has no resource/layout warnings, and leaves its source unchanged. The image/link example also checks actual PDF annotations. Poppler renders the saved PDFs; only empty paper margins are removed. A side-by-side source panel is then composed in Edge with bilingual labels. PDF content is never recreated as styled HTML.

Final PDF and PNG comparisons live in `docs/media/examples/`. Raw page renders, temporary profiles and a verification report stay in `artifacts/readme-features/`. The comparisons use Minimal, A4, 10.5 pt, standard margins, 1.6 line spacing, no author and no page numbers. Code is shown without syntax highlighting to reflect the current engine.
