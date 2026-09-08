# Desktop conversion compatibility audit

Audited on 2026-09-07 for Aldus 0.4.4, on Windows, using the actual Electron/Chromium printing pipeline and PDF.js preview. This covers the desktop engine; the older Python web backend is a separate implementation.

0.4.5 adds a separate [source-format diagnostic stage](desktop/diagnostics/README.md): narrow in-memory recovery for consecutive list items missing spaces after hyphens, source-line notices for ambiguous cases, and tests proving source bytes/mtime remain unchanged. Correct lists without a separating blank line already work and are not flagged. This stage is separate from layout preservation and geometry checks.

Previously we had targeted regressions for HTML alignment, badges and PDF links. This audit adds a broader document corpus and inspects the generated PDF, rather than treating successful HTML rendering as proof of correct PDF output. It is not a full CommonMark/GFM conformance certification or a guarantee for arbitrary HTML/CSS.

## Findings and fixes

| Finding | Result in 0.4.4 |
| --- | --- |
| Headings containing Markdown links used the link URL in their anchor; duplicate headings could reuse an existing suffix | Anchors use visible inline text and avoid existing generated and authored HTML IDs. Same-file `file.md#section` links become internal links. |
| Task markers remained literal `[x]` / `[ ]` | Checked, unchecked and nested task lists render as static checkboxes. |
| Footnote syntax could be mistaken for ordinary reference links | Footnotes render at the document end, including repeated references and clickable return links. |
| Theme forced ordinary images into centered blocks | Images follow their paragraph's alignment and inline flow. Explicit source CSS remains higher priority. |
| Centered tables silently received centered cells, no borders and banner padding | Banner styling now requires the explicit `aldus-banner` class. Table placement no longer changes cell alignment. |
| A long unbroken table value squeezed other columns down to a few characters | Markdown tables use equal column widths and wrapping. Authored HTML tables and source CSS can still specify their own widths. |
| HTML disclosure tags were removed, losing structure | `details` and `summary` are retained and expanded for static PDF output. |
| Ordinary links inherited browser blue even in the dark theme | Default link colors follow the PDF theme. |
| Unsupported content could look successfully converted | Preview notices cover diagram source, authored inline SVG, missing anchors, local-file links and invalid math, in addition to existing image/CSS/script notices. |

## Coverage and remaining limits

| Feature | What is covered | Remaining boundary |
| --- | --- | --- |
| Basic Markdown | Headings, emphasis, strong, strike-through, escaping, entities, hard breaks, quotes, nested/numbered lists and code | No full upstream CommonMark conformance suite has been imported. |
| Tables | Left/center/right column alignment, long cells, all 70 fixture rows retained, repeated headers across pages; HTML sizing, spans, padding and alignment | Extremely wide tables or an individual row taller than a page can still need authored layout adjustments. |
| Links | Actual PDF destinations and annotations; English/Chinese headings, duplicates, HTML IDs/named anchors, same-file paths, HTTP/HTTPS/mailto; mouse, keyboard, resized preview and batch preview | Other local documents are not opened or automatically mapped to sibling PDFs. Broken fragment targets produce a notice. |
| Images and badges | Embedded local raster/SVG and public HTTPS images, dimensions, parent alignment, source CSS precedence, offline PDF bytes | Missing/private/unsupported resources produce notices. Authored inline SVG has a limited sanitizer; use an SVG image file for reliable static diagrams. Animated images cannot remain animated in PDF. |
| Math | Bundled KaTeX, inline/display equations, offline fonts; parse errors produce notices | KaTeX is a subset of LaTeX. Very wide formulas and custom fonts still need visual review. |
| Task lists and footnotes | Static check state, nested tasks, endnotes, repeated reference IDs and working return links | PDF checkboxes are not editable form fields. Footnotes are document endnotes, not automatically placed at the bottom of each printed page. |
| HTML/CSS | Common static layout, explicit alignment/dimensions, Flex/Grid, source CSS cascade, disclosures expanded; explicit page breaks | Scripts, embedded apps and external CSS dependencies are not rendered. Arbitrary browser layouts, overflow containers and all print CSS combinations are not guaranteed. |
| Code and dialect extensions | Plain code preserves its text and wraps long lines | No syntax highlighting, Mermaid/PlantUML rendering, Obsidian wiki-link resolution, YAML metadata processing or special GitHub alert styling. Diagram fences show a notice; not every dialect extension is automatically detected. |
| Preview versus export | Preview renders actual PDF bytes; exported PDF retains text/links; link overlays support navigation | Preview still lacks text selection, find-in-document and zoom controls. Source edits require reopening the preview; dependency-only edits may be cached for up to one minute. |

## Repeatable checks

```powershell
npm run build:ui
npm run test:engine
```

`test:engine` runs unit tests plus the HTML layout, PDF link and compatibility Electron tests in sequence. The compatibility fixture checks all three themes, every code line and table row in extracted PDF text, text within printable margins, actual link destinations, and footnote navigation in the preview. Existing layout tests check computed geometry; existing link tests include batch preview and resizing. Artifact PDFs, screenshots and a JSON result summary are written to the ignored `desktop/test/artifacts/` directory.

The tests deliberately distinguish structural assertions from visual review: text extraction alone cannot prove the appearance of a formula, checkbox, SVG or every page break. When changing printing, sanitization, themes, Markdown plugins or PDF.js, run these checks and inspect the generated PDFs. New real-world failures should become small fixtures before fixing the engine.

Reference scope: [GFM specification](https://github.github.com/gfm/), [Markdown-it](https://github.com/markdown-it/markdown-it), [footnote extension](https://github.com/markdown-it/markdown-it-footnote), [task-list extension](https://github.com/revin/markdown-it-task-lists).
