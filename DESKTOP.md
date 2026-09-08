# Aldus desktop prototype

Source-format checks and in-memory repairs are documented in [desktop/diagnostics/README.md](desktop/diagnostics/README.md). Source files are never rewritten by conversion.

See [ENGINE.md](ENGINE.md) for the desktop Markdown/PDF compatibility audit, supported behavior, known limits and repeatable engine checks.

The desktop app runs entirely on the user's computer. It uses Electron, the existing PDF themes, Markdown-it and bundled KaTeX. Python, FastAPI, Puppeteer and a hosted conversion server are not required for the desktop app. The existing browser app remains available through its original startup scripts.

## Try it

Development prerequisites: Node.js 22.12+ and npm.

```powershell
npm ci
npm --prefix frontend ci
npm start
```

1. Start typing a filename. Aldus automatically discovers Markdown files on local fixed drives, starting with common folders. Existing indexed results work while discovery continues. You can also add a folder or use **打开文件**.
2. Type part of a filename. The empty search window is a single 62-pixel-high row: A / Aldus, “搜索 Markdown，转为 PDF / Find Markdown for PDF”, then refresh, add-folder and open-file icons. Whitespace shows no results. Search covers `.md` and `.markdown`, including subfolders. Files and folders have distinct icons; folder counts include indexed descendants. Select with ↑ / ↓ or a mouse click.
3. Press **Enter** (or double-click a result) to preview the actual paginated PDF. This creates no PDF beside the source file.
4. Choose **导出 PDF / Export PDF** and a save location. The saved bytes are exactly the PDF being previewed. To include subsequent source edits, return to search and preview again. Applying style settings also regenerates the current preview.
5. **Esc** hides the window from search, preview or settings. Clicking another application also hides it, preserving the current search and preview. Native file/folder pickers and save dialogs keep Aldus open. Use the preview's back arrow to return to search.
6. **Ctrl+Shift+Space** on Windows/Linux, **⌘+Shift+Space** on macOS, toggles the app. Closing the window hides it in the tray. Use the tray menu's **退出** to quit.

The shortcut is active while Aldus is running. Launch at login is not enabled. Right-click the Aldus system tray icon and choose **设置 / Settings**. Settings open alongside the document so the preview stays visible. Changes to style and shortcut require **应用设置 / Apply settings**; applying a style change regenerates the current preview without exporting. Closing settings discards unapplied style changes. Directory and language changes are saved immediately. Chinese and English are supported throughout the app and tray; the initial language follows the system locale. Native dialog button labels follow the operating system. Settings are stored in Electron's per-user `userData/settings.json`, not in the project or installation folder.

While visible, the window floats above ordinary application windows; clicking elsewhere intentionally hides it. System security screens and exclusive fullscreen applications are outside this guarantee.

When opened, search is horizontally centered on the display containing the pointer, with its top at about 16% of that display's usable height. Results expand downward. Automatic width is 30% of the usable display width plus 40 logical pixels, bounded to 480–560 logical pixels. Drag either side of the search window to set a preferred width (minimum 420 pixels); this is saved locally and restored after restarting. Search height continues to follow its contents. Opening a preview or settings does not change the search-width preference. On a smaller monitor, the visible width is limited to fit without replacing the saved preference. Monitor changes and display scaling are handled in logical pixels. Native edge-drag preference handling targets Windows/macOS; Linux packaging remains unvalidated.

The provisional palette uses graphite `#30343B` for the brand and text, with muted blue-gray `#66788A` for accents. A 48% white surface overlays native acrylic on Windows 11 22H2+ and vibrancy on macOS, with an opaque fallback elsewhere and for reduced-transparency preferences. Document pages remain opaque for readability. Native backdrop effects are disabled during hidden screenshot tests because they require desktop composition; the layout and interactions are tested independently.

## Folder conversion and badges

Select a folder in search and press Enter. A sidebar lists its indexed Markdown files with checkboxes; the right pane generates only the selected document’s PDF preview. Subfolders are included by default and can be disabled. The list follows search exclusions; if discovery is still running, its notice asks you to refresh the list after indexing. A batch supports up to 2,000 files; larger folders prompt you to choose a smaller scope.

Choose **导出 / Export** and an output directory. The serial queue keeps the subdirectory structure and uses exclusive writes with numbered names to preserve existing PDFs. An individual failure does not stop other files. Progress, per-file status, cancellation of remaining files, opening the output folder and retrying failed files are available. Cancellation finishes the current file; hiding the bar preserves the running batch. Quitting cancels remaining work and waits for the current file to finish writing. Settings apply to the whole batch as a snapshot. Recently viewed PDFs are cached in memory for one minute (up to eight previews / 64 MB).

HTTPS raster images and SVG badges are downloaded before printing, then embedded as data images. Local SVG images within the document folder are supported too. Small SVG badges stay inline, with their native size, text, gradients and embedded logos. Their alignment follows the original paragraph or container: `align` attributes and inline `text-align` styles are preserved. Scripts and external SVG resources are removed. Fetching uses public HTTPS addresses, no cookies or document uploads, bounded redirects, ten-second request deadlines and a 15 MB limit per image. Each document resolves up to 100 unique images with four concurrent loads. Remote images are cached in memory for five minutes (up to 128 images / 32 MB). A new remote image requires a connection; exported PDFs contain their own image bytes and work offline. Missing images show alt text and an explicit warning rather than silently disappearing.

## HTML layout fidelity

The desktop renderer preserves static HTML layout rather than replacing it with theme defaults. Source image IDs, classes, inline styles and dimensions survive image embedding. Paragraph/container/heading alignment, table widths and alignment, cell padding/spacing, cell alignment, row/column spans, vertical alignment, and list numbering are retained. Valid presentation attributes are normalized into an intermediate CSS layer: theme defaults have the lowest priority, HTML hints follow, and document styles retain their normal priority above both. Inline CSS stays inline. This also permits document class rules to override HTML width/height hints, matching author expectations.

Document-local `<style>` blocks and inline CSS are supported, including flex/grid layout and print page breaks. The preview uses the actual Chromium-generated PDF. External stylesheets, CSS images/fonts referenced by URL, scripts, and embedded web pages are not loaded or executed; the preview reports these dependencies as document notices. This is a tested static-document subset, not a guarantee of pixel-identical reproduction of arbitrary websites or JavaScript applications.

`npm run test:layout` exercises all three themes in Electron and measures the rendered geometry for alignment, image dimensions, table dimensions/cell properties, flex/grid and author CSS precedence; it also verifies a two-page PDF from an explicit page break and visible notices for unsupported dependencies. PDF fixtures and a preview screenshot are stored under `desktop/test/artifacts/`.

## Build Windows downloads

```powershell
npm run pack       # release/win-unpacked/Aldus.exe and companion files
npm run dist:win   # release/Aldus Setup 0.4.5.exe
```

Users of the built application do not need Node.js, Python, or this repository. Share the installer, or the entire `win-unpacked` folder as a ZIP; the executable from that folder cannot be shared on its own.

This prototype is unsigned. Windows may show a reputation warning. macOS and Linux packaging targets are configured but have not been validated; macOS signing/notarization is not configured. No store submission or paid service is involved.

## Updates and publishing

Aldus checks `https://api.github.com/repos/alextianyf/Aldus/releases/latest` at startup and every four hours. The check transmits no document content, filenames or directory list. A newer stable semantic-version tag, such as `v0.2.1`, shows a download prompt that opens the project's GitHub Releases page. Manual checks are available in settings and are limited to once a minute.

This is an **update notification**, not silent installation or automatic replacement of the app. A 404 is shown as “尚未发布下载版本”; network errors do not block local conversion. A public release with an installer still needs to be published before friends can download an update. This branch does not publish anything automatically.

## Scope and limits

- Searches `.md` and `.markdown` filenames and paths, with case-insensitive partial keywords, Unicode normalization, and filename matches ranked before path matches. It does not search document contents, pinyin, or spelling approximations. Windows fixed disks are discovered automatically; use Settings to disable automatic search, add extra folders, or exclude folders. System/dependency/cache directories and symbolic links are skipped; hidden personal folders are otherwise eligible. Inaccessible locations produce a warning. Removable and network locations require explicitly adding a folder. macOS/Linux discovery and packaging remain unvalidated.
- A worker thread handles discovery, queries and the persistent local metadata index (`userData/markdown-index.jsonl`). Startup loads cached paths before reconciliation. New results are searchable progressively; filesystem events update changes, with a ten-minute reconciliation fallback. Index metadata contains paths only, never document contents. The renderer queries immediately and receives index-change notifications instead of polling. Results are capped at 80, metadata at 500,000 Markdown files, and discovery at 1,000,000 queued directories, with a visible limit warning.
- Markdown files up to 10 MB. Relative SVG/PNG/JPEG/GIF/WebP images within the Markdown file's directory tree and public HTTPS images are embedded, up to 15 MB each. Unavailable or unsupported images and local images outside that tree produce a preview warning. KaTeX and its fonts are bundled for offline use.
- The desktop parser is Markdown-it; the legacy backend uses Python Markdown. Common headings, tables, code, local images and dollar-delimited math are supported. Python-specific extensions are not guaranteed to match. Existing HTML banners are retained after sanitization; the desktop prototype does not yet include the legacy custom banner editor.
- PDF preview uses canvas pages. It shows the actual output with clickable links, but does not yet offer text selection or zoom controls. Internal links scroll to the destination heading and follow the displayed page scale; HTTP/HTTPS/mailto links open in the system browser or mail application. Exported PDFs retain their text and links.
- No account, cloud sync, document upload or analytics. Each computer maintains its own folders and preferences.

## Verification

```powershell
npm test
npm --prefix frontend run lint
npm run build:ui
npm run test:desktop
npm run test:position
npm run test:batch
npm run test:layout
npm run test:links
node desktop/test/benchmark.cjs
```

The Electron smoke test uses an isolated temporary user-data folder, manual search scope and a separate test shortcut. It measures input-to-results-frame latency and verifies the compact search position, manual resize event handling and width persistence across preview/settings and a full restart, always-on-top state, Esc and blur handling (including native dialog protection), the real tray settings callback, Enter-to-preview without saving, explicit/cancelled export, identical re-export, Chinese filenames, a settings sidebar that does not overlap the document, theme regeneration, discarded drafts, language persistence, and update prompts. Search tests exercise keyword ranking, cache recovery, exclusions, and real worker filesystem notifications for creation, rename and deletion. Screenshots, timing reports and the exported sample are saved under ignored `desktop/test/artifacts/`. See [SEARCH.md](SEARCH.md) for performance measurements and their scope.

To run the same smoke test against a packaged Windows build:

```powershell
$env:ALDUS_EXECUTABLE = (Resolve-Path 'release/win-unpacked/Aldus.exe').Path
npm run test:desktop
npm run test:position
Remove-Item Env:ALDUS_EXECUTABLE
```

The batch smoke test verifies folder search/counts, lazy SVG badge rendering, checkbox selection, subfolder filtering, a cancelled output picker, real PDF export, filename collisions, individual failures and retry, and Chinese/English views. Set `ALDUS_TEST_REMOTE=1` to include a live Shields.io badge with an embedded logo; the default fixture works offline.

The link smoke test uses a real three-page PDF to verify TOC navigation, heading coordinates, Chinese destinations, legacy HTML named anchors, keyboard activation, resized pages and batch preview. It stubs external app launching while checking URL routing and rejection of file URLs.

`ALDUS_TEST_DIR` is reserved for the smoke test: it isolates preferences and suppresses initial display and update requests.
