# Settings

Settings open in a separate window from the search bar's settings icon or the tray. The bar keeps two actions: Open file and Settings. Add search folders and rebuild the index under Settings → Search. General, Search, Layout, Export and About & updates are available in Chinese and English. Ordinary settings do not render a preview and save automatically. Layout changes stay in a draft until **Save layout** is clicked. Each editable category can reset its defaults; resetting Layout also requires saving.

## General and search

Categories share a grouped layout: labeled panels separate related options, thin dividers separate rows, and consistent switches and fields keep controls aligned. The sidebar uses icons and a distinct selection background. Secondary descriptions explain each category and stay visually separate from editable values.

- Language: system default, Chinese or English. Existing explicit language preferences are retained.
- Appearance: Light, Dark or System default (the default). Changes save automatically and immediately update the search bar, preview surroundings and all settings categories. System mode follows operating-system appearance changes while the app is running; explicit Light/Dark choices stay fixed. This preference is independent of the PDF theme: document colors and exported PDFs remain unchanged. Resetting General restores System default.
- Launch at login: off by default; supported by installed Windows/macOS builds. Startup uses a hidden search window. Inkleaf Dev disables this control and rejects requests to enable it.
- Global shortcut: validates registration before replacing the old binding. Defaults to Ctrl + Shift + Space in production and Ctrl + Alt + Shift + Space in Inkleaf Dev; resetting General retains the appropriate mode's default.
- Search size: shows saved width and height. Automatic width adapts between 560 and 640 logical pixels, constrained to the current screen; a manually saved width takes precedence. Side drags resize around the horizontal center; top/bottom drags resize around the vertical center. Unrelated native DPI rounding is ignored. Dimensions persist across restart and reset together. Search results still expand downward without changing the preferred compact size.
- Search scope: automatic fixed disks, additional folders, exclusions and rebuild index. Only Markdown and folders containing Markdown are indexed.

## Layout

Themes: Folio (开本, default), Classic and Minimal. New profiles, missing/invalid theme preferences and Reset this category use Folio; resetting Layout remains a draft until saved. Existing saved Classic/Minimal choices are retained. Legacy Dark preferences fall back to Folio. Paper: A4 or Letter, portrait or landscape. Margins: compact, standard or wide. Body text: 8–18 pt. Line spacing: 1.4, 1.6 or 1.8. Signature and copyright can be enabled/disabled independently of the stored name; existing `author` / `authorEnabled` preferences remain compatible. Page numbers have their own switch.

The expanded preview supports Fit width, 100%, 125% and 150% zoom. **View the change** in the copyright, page header and page footer groups scrolls to the corresponding text in the generated sample PDF and briefly highlights it. Alignment and page-number area/format choices automatically locate their output after the latest render; typing text waits for an explicit View action. This does not rebuild the canvases or alter the exported PDF. Reduced-motion preferences use a steady highlight. Smaller windows stack the controls and preview in a scrollable layout.

The copyright line has two fields: text before © (defaults to the document title) and the copyright holder after ©. These affect only the signature at the end of the PDF. They never replace body headings, metadata titles, source Markdown or output filenames. Older development builds' `documentTitle` value migrates to `copyrightLabel`.

Fenced code uses offline, explicit-language syntax highlighting in both themes and in preview/export. Keywords, strings, comments, numbers, functions and types use a restrained light-editor palette. Unknown/omitted languages stay plain; no automatic language guessing is performed. Fences above 200,000 characters remain plain to bound highlighting work. Raw HTML ASCII-art `<pre>` blocks retain their authored styling.

### Advanced layout

The collapsed Advanced layout section contains:

- H1–H6 styles: choose a level, then set its size, color, and spacing before/after in points. Empty numeric fields use the theme; Reset this heading restores all four defaults for that level. The ordinary sample includes H1–H6, with H3 labels for the JavaScript and Python code examples. There is no separate heading preview. Explicit gaps suppress the adjoining paragraph/list margin so smaller values are visible; page boundaries may still discard whitespace.
- Pagination: keep headings with following text, keep tables/code blocks together when they fit, avoid isolated paragraph lines, repeat table headers, and optionally start H1 or H2 sections on new pages. Oversized blocks can still split across pages rather than clipping content. Each rule has a Compare page breaks action with real Rule off/on PDFs and automatic navigation to the relevant boundary. Controlled Classic/A4 fixtures isolate one rule at a time; comparison toggles do not change the draft or export settings. Back to my layout restores the normal sample. When No forced break is selected, Rule on shows a bilingual inline notice and keeps the rule off until the user chooses H1 or H2 on the left; the main process also rejects an incompatible comparison request.
- Repeating headers and footers: independent enable switches, text and left/center/right alignment. Text supports `{title}`, `{file}`, `{date}`, `{page}` and `{pages}`. Custom text is escaped, not interpreted as HTML. Compact margins reserve extra room for enabled text.
- Page numbers: header or footer, left/center/right, number only, number/total, or localized “Page 1 of 10”. The existing Page numbers switch controls automatic numbering. Signature alignment controls the copyright line at the end of the document independently.

All advanced settings belong to the Layout draft and follow the same save/discard/leave confirmation flow. They use the same conversion pipeline in the sample, single-file export and batch export.

**Revert changes** restores saved values. Leaving Layout with unsaved changes prompts to save, discard, or keep editing. This applies both to category changes and closing through the close button, Escape or native window close. Saving or discarding continues to the requested category or closes the window; keeping edits cancels navigation. Failed saves retain the draft and do not apply its layout to conversions. A successful save shows explicit feedback.

Category changes retain a fixed window position anchor. Ordinary categories share the same size; Layout expands to fit its preview without accumulating native DPI rounding drift.

The fixed sample lives in `resources/samples/`, including a local badge that needs no network access. It has two pages at normal settings and contains headings, prose, lists, a table, code, mathematics, centered badges and a working internal link. Large text or tight paper layouts may naturally produce more pages.

Sample rendering waits 300 ms after changes and serializes requests. Superseded results are ignored. It uses a separate `PdfService` instance with the same document builder and printing path as real documents. Neither sample generation nor formatting checks write to user Markdown.

Closing settings refreshes the previously open document if its layout changed. Export is disabled until the new preview is ready. Main-process validation also rejects exporting an outdated layout. Running batches retain the settings snapshot taken when the batch starts.

## Export

Default: Downloads, without a location dialog.

- Downloads: save the PDF to the operating system's Downloads path.
- Same folder: save each PDF beside its Markdown source.
- Custom: select a persistent output folder.
- Ask each time: explicitly choose a location for that export; the configured destination remains unchanged.
- Open after export: off by default; applies to single-file exports so a batch does not open dozens of windows.
- Preserve subfolders: on by default. Downloads/custom batch output is grouped under the selected source folder name. Same-folder mode always preserves the source locations.

Automatic output uses exclusive creation and numbered names (`Note.pdf`, `Note (1).pdf`, …). Flattened batches also number duplicate basenames. A manual save dialog uses the operating system's overwrite confirmation. An unwritable location is reported as an error; Inkleaf does not silently choose another destination.

## Verification

`npm run test:settings` launches an isolated Electron instance and checks categories, bilingual sample previews, zoom, copyright highlighting and navigation, copyright text in real PDFs, unsaved drafts, save failure/retry, close choices, small windows, persistence across restart, unchanged Markdown bytes/mtime, Downloads/source/custom/manual exports, name collisions and batch layout snapshots. `npm run test:advanced` exercises all six heading levels and repeating print decorations, and checks that oversized tables/code retain every row and line. `npm run test:position` checks symmetry, size persistence, native rounding and stable search position. The unit suite also covers preference migration, text escaping, unchanged headings/anchors, validation and flattened/sibling batch destinations.

`npm run test:layout-feedback` measures actual heading gaps at 0/3/18 pt, verifies colored syntax survives sanitization, compares all six pagination rules in printed PDFs, and checks header/footer/page-number/signature navigation without implicit saves.

`npm run test:navigation` checks Escape during a blocked preview, immediately opening another document, late-result isolation, 60 settings category switches, and bilingual unsaved-layout navigation with failed-save recovery.

The ordinary desktop, batch, layout, links, compatibility, diagnostics, positioning and updater suites remain part of `npm run test:all`.
