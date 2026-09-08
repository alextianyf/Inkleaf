# Settings

Settings open in a separate window from the tray. General, Search, Layout, Export and About & updates are available in Chinese and English. Ordinary settings do not render a preview. Changes save immediately; there is no Apply button. Each editable category can reset its defaults.

## General and search

- Language: system default, Chinese or English. Existing explicit language preferences are retained.
- Launch at login: off by default; supported by installed Windows/macOS builds. Startup uses a hidden search window. Development builds report that installation is required.
- Global shortcut: validates registration before replacing the old binding.
- Search width: shows the saved width or automatic screen sizing; reset returns to automatic sizing. Dragging the search bar still saves its width.
- Search scope: automatic fixed disks, additional folders, exclusions and rebuild index. Only Markdown and folders containing Markdown are indexed.

## Layout

Themes: default, minimal and dark. Paper: A4 or Letter, portrait or landscape. Margins: compact, standard or wide. Body text: 8–18 pt. Line spacing: 1.4, 1.6 or 1.8. Author name can be enabled/disabled independently of its stored text; page numbers have their own switch.

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

`npm run test:settings` launches an isolated Electron instance and checks categories, bilingual sample previews, Letter landscape PDF dimensions, live author changes, automatic persistence across restart, unchanged Markdown bytes/mtime, Downloads/source/custom/manual exports, name collisions and batch layout snapshots. The unit suite also covers preference migration, validation and flattened/sibling batch destinations.

The ordinary desktop, batch, layout, links, compatibility, diagnostics, positioning and updater suites remain part of `npm run test:all`.
