# Aldus — Project Plan

> Named after Aldus Manutius, the Renaissance printer who revolutionized how knowledge is shared.

> Desktop prototype update (2026-09-07): the `codex/desktop-spotlight` branch uses Electron with local Markdown-it/KaTeX rendering and preview before export. See [DESKTOP.md](DESKTOP.md) for the implemented architecture and scope. The Tauri and server plans below describe the earlier design.

---

## What is Aldus?

Aldus is a personal markdown-to-PDF conversion tool with a clean, modern UI. It takes a single `.md` file and produces a beautifully typeset PDF — with full LaTeX math support, custom themes, and a configurable copyright banner and footer.

**Three deployment targets from one codebase:**
- **Local web app** — run locally in the browser (primary target for now)
- **Desktop app** — packaged with Tauri as a downloadable installer
- **Web app** — deploy to a server for public use in the future

---

## Core Requirements

### Conversion
- Input: either a single `.md` file or a folder
  - **Single file** — converts that file to a PDF
  - **Folder** — recursively finds all `.md` files in the folder and its subfolders, converts each one to a PDF
- Output: PDF file(s) saved alongside the source markdown
- LaTeX math (`$...$` inline, `$$...$$` display) must render correctly in both GitHub and the exported PDF
- Images embedded and properly sized
- Tables, code blocks, blockquotes all styled

### UI
- File/folder picker — select a single `.md` file or a folder
- Live PDF preview after conversion
- Theme selector (default theme + additional themes)
- Banner/copyright management panel
- Footer configuration
- Export button to save the PDF

### Banner
Banner handling is a **UI concern**, not a parsing concern. The user is always explicitly in control through the interface — nothing is guessed from file structure.

**When a file is loaded, the UI checks for an existing banner and prompts the user:**
- Banner detected → "Use existing banner, replace it, or remove it?"
- No banner detected → "No banner found — want to add one?"

**Banner types supported:**
- **ASCII art** — entered as text in the UI, rendered as a centered PNG via matplotlib for the PDF
- **Image** (PNG/JPG) — uploaded via the UI, embedded directly

**Banner is saved in config** so it persists across sessions and auto-applies to future conversions unless overridden.

### Footer
- Default format: `Subject — Section Title · © Author Name`
- Section title auto-extracted from the first `# H1` in the markdown
- Author name configurable and saved

### Themes
- At least one default theme (blue/indigo, professional)
- Selectable from UI
- Future: ability to add custom themes

---

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Backend | Python + FastAPI | Handles conversion pipeline, file management, config storage |
| PDF preprocessing | Python (markdown, matplotlib, base64) | Banner rendering, image embedding, glyph mapping |
| PDF rendering | Node.js + Puppeteer | KaTeX math rendering, full CSS support, HTML → PDF |
| Math | KaTeX | GitHub-compatible LaTeX, best browser rendering |
| Frontend | React | Modern UI, live preview, theme selector |
| Desktop packaging | Tauri | Wraps web app as native desktop app, ~5MB installer |
| Config storage | JSON file (local) | Simple, no database needed for personal use |

---

## Architecture

```
User (Browser / Tauri window)
        │
        ▼
   React Frontend
   ┌─────────────────────────────┐
   │  File / folder picker       │
   │  Live preview panel         │
   │  Theme selector             │
   │  Banner editor              │
   │  Footer config              │
   │  Export button              │
   └────────────┬────────────────┘
                │ HTTP (FastAPI)
                ▼
   Python Backend (FastAPI)
   ┌─────────────────────────────┐
   │  1. Read markdown file      │
   │  2. Render banner PNG       │
   │     (matplotlib)            │
   │  3. Embed images (base64)   │
   │  4. Apply glyph map         │
   │  5. Convert MD → HTML       │
   │  6. Inject theme CSS        │
   │  7. Write temp HTML file    │
   └────────────┬────────────────┘
                │ Subprocess call
                ▼
   Node.js + Puppeteer
   ┌─────────────────────────────┐
   │  Load HTML via file:// URL  │
   │  KaTeX auto-renders math    │
   │  Print to PDF               │
   └─────────────────────────────┘
                │
                ▼
          PDF returned to UI
```

---

## Project Structure

```
Aldus/
├── PLAN.md                      # This file
├── README.md
│
├── backend/                     # Python FastAPI backend
│   ├── main.py                  # FastAPI app, API routes
│   ├── converter.py             # Core markdown → HTML pipeline
│   ├── banner.py                # Banner PNG rendering (matplotlib)
│   ├── themes/                  # Theme CSS files
│   │   ├── default.css
│   │   └── ...
│   ├── config.json              # Saved user settings (author, banner, etc.)
│   └── requirements.txt
│
├── renderer/                    # Node.js Puppeteer renderer
│   ├── render.js                # Takes HTML file path → outputs PDF
│   └── package.json
│
├── frontend/                    # React frontend
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── FilePicker.jsx
│   │   │   ├── PreviewPanel.jsx
│   │   │   ├── ThemeSelector.jsx
│   │   │   ├── BannerEditor.jsx
│   │   │   └── FooterConfig.jsx
│   │   └── api.js               # FastAPI client calls
│   └── package.json
│
└── src-tauri/                   # Tauri desktop packaging (later)
    └── ...
```

---

## API Endpoints (FastAPI)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/convert` | Convert a single `.md` file path, returns PDF |
| `POST` | `/convert-folder` | Convert all `.md` files in a folder recursively |
| `GET` | `/preview` | Returns PDF preview as base64 |
| `GET` | `/themes` | List available themes |
| `GET` | `/config` | Get saved user config |
| `POST` | `/config` | Save user config (author name, banner, etc.) |
| `POST` | `/banner` | Upload custom banner image |

---

## Development Phases

### Phase 1 — Core Pipeline
- [ ] Set up FastAPI backend
- [ ] Port `build_pdf.py` logic into `converter.py`
- [ ] Set up Node.js Puppeteer renderer (`render.js`)
- [ ] Connect Python → Puppeteer via subprocess
- [ ] Verify LaTeX math renders correctly end to end
- [ ] Single working CLI-style conversion (no UI yet)

### Phase 2 — Frontend UI
- [ ] Set up React app
- [ ] File picker + convert button
- [ ] PDF preview panel
- [ ] Connect frontend to FastAPI

### Phase 3 — Configuration UI
- [ ] Theme selector
- [ ] Banner editor (text + upload)
- [ ] Footer / author name config
- [ ] Persist settings in `config.json`

### Phase 4 — Polish
- [ ] Additional themes
- [ ] Error handling and user feedback
- [ ] Loading states

### Phase 5 — Desktop App (Tauri)
- [ ] Integrate Tauri
- [ ] Package as installer (Windows first)
- [ ] Test and release

---

## Math Strategy

All markdown files should use LaTeX notation:
- Inline math: `$x^2 + y^2 = r^2$`
- Display math: `$$\frac{a}{\sin A} = \frac{b}{\sin B}$$`

This ensures:
- ✅ GitHub renders it natively (added 2022)
- ✅ KaTeX renders it in the PDF via Puppeteer
- ✅ Consistent notation across all study guides

Backtick math notation (`` `y = ax²` ``) in older files should be migrated to LaTeX.

---

## Future Considerations (not in scope now)

- User accounts for the web version
- Cloud file storage
- Multiple files / full chapter export
- Custom theme builder in UI
- Export to other formats (HTML, DOCX)
