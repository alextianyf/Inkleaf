const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  globalShortcut,
  ipcMain,
  dialog,
  shell,
  protocol,
  net,
  screen,
  session,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { randomUUID } = require("node:crypto");
const semver = require("semver");
const { SearchClient } = require("./search-client.cjs");
const { isMarkdown } = require("./search-index.cjs");
const { buildDocument } = require("./document.cjs");
const { BatchJob } = require("./batch.cjs");
let batchJob;
let batchCompletion = Promise.resolve();
const pdfCache = new Map();
const {
  searchWidth,
  layoutBounds,
  MIN_SEARCH_WIDTH,
  MARGIN,
} = require("./window-layout.cjs");
const strings = require("./strings.json");
const os = require("node:os");
const t = (key) => strings[config?.language || "zh"][key];

const APP_URL = "aldus://app/desktop.html";
const RELEASES = "https://github.com/alextianyf/Aldus/releases";
let library;
const selectedFiles = new Set();
const documents = new Map();
const previews = new Map();
let window,
  tray,
  config,
  configFile,
  quitting = false,
  rendering = false;
let shortcutError = "",
  update = { status: "idle" },
  lastCheck = 0;
let checkingUpdates;
let nativeDialogs = 0;
let blurTimer;
let widthSaveTimer;
let currentLayout = { mode: "search" };
let currentDisplayId;
let requestedBounds;
const defaults = {
  roots: [],
  autoSearch: true,
  excludedRoots: [],
  theme: "default",
  author: "",
  pageNumbers: true,
  language: "zh",
  shortcut: "CommandOrControl+Shift+Space",
  searchWidth: null,
};

app.setName("Aldus");
if (process.env.ALDUS_TEST_DIR)
  app.setPath("userData", process.env.ALDUS_TEST_DIR);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "aldus",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

let savingSettings = Promise.resolve();
function persist() {
  const snapshot = JSON.stringify(config, null, 2);
  savingSettings = savingSettings
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(path.dirname(configFile), { recursive: true });
      await fs.writeFile(`${configFile}.tmp`, snapshot);
      await fs.rename(`${configFile}.tmp`, configFile);
    });
  return savingSettings;
}

function applyLayout(display, reposition = false) {
  if (!window || window.isDestroyed()) return;
  const target = display || screen.getDisplayMatching(window.getBounds());
  currentDisplayId = target.id;
  window.setMinimumSize(
    Math.min(MIN_SEARCH_WIDTH, target.workArea.width - MARGIN * 2),
    62,
  );
  // Keep the requested logical bounds as the layout anchor. Native bounds can
  // be a pixel or two wider at fractional DPI; feeding them back accumulates drift.
  requestedBounds = layoutBounds(
    target.workArea,
    currentLayout,
    config.searchWidth,
    reposition ? undefined : requestedBounds,
  );
  window.setBounds(requestedBounds);
}

function reveal() {
  if (!window || window.isDestroyed()) return;
  clearTimeout(blurTimer);
  if (!window.isVisible()) {
    const display = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    );
    applyLayout(display, true);
  }
  window.show();
  window.focus();
  window.webContents.send("aldus:focus");
}

function openSettings() {
  reveal();
  window.webContents.send("aldus:open-settings");
}

async function withNativeDialog(action) {
  nativeDialogs++;
  clearTimeout(blurTimer);
  try {
    return await action();
  } finally {
    nativeDialogs--;
    if (!window.isDestroyed() && !quitting && !process.env.ALDUS_TEST_DIR) {
      window.show();
      window.focus();
    }
  }
}

function registerShortcut(accelerator) {
  if (globalShortcut.isRegistered(accelerator)) return true;
  try {
    if (
      !globalShortcut.register(accelerator, () =>
        window.isVisible() && window.isFocused() ? window.hide() : reveal(),
      )
    )
      return false;
    if (config.shortcut !== accelerator)
      globalShortcut.unregister(config.shortcut);
    return true;
  } catch {
    return false;
  }
}

async function checkUpdates() {
  if (checkingUpdates) return checkingUpdates;
  if (Date.now() - lastCheck < 60000) return update;
  lastCheck = Date.now();
  checkingUpdates = (async () => {
    try {
      const response = await net.fetch(
        "https://api.github.com/repos/alextianyf/Aldus/releases/latest",
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "Aldus",
          },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (response.status === 404) return (update = { status: "unpublished" });
      if (!response.ok) throw new Error("获取版本失败");
      const release = await response.json();
      const version = semver.valid(release.tag_name);
      if (!version) throw new Error("版本格式无法识别");
      update = {
        status: semver.gt(version, app.getVersion()) ? "available" : "current",
        version,
      };
    } catch {
      update = { status: "offline" };
    }
    return update;
  })();
  try {
    return await checkingUpdates;
  } finally {
    checkingUpdates = null;
  }
}

function handle(name, fn) {
  ipcMain.handle(`aldus:${name}`, (event, ...args) => {
    if (
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      event.senderFrame.url !== APP_URL
    )
      throw new Error(t("invalidRequest"));
    return fn(...args);
  });
}

function configureSearch() {
  return library.configure({
    cacheFile: path.join(app.getPath("userData"), "markdown-index.jsonl"),
    roots: config.roots,
    autoSearch: config.autoSearch,
    excludedRoots: config.excludedRoots,
    priorityRoots: ["desktop", "documents", "downloads", "home"].map((name) =>
      app.getPath(name),
    ),
  });
}

async function renderPdf(file, options) {
  if (rendering) throw new Error(t("renderBusy"));
  const id = randomUUID();
  let printer;
  rendering = true;
  try {
    const stat = await fs.stat(file);
    const cacheKey = JSON.stringify([
      file,
      stat.mtimeMs,
      stat.size,
      options.theme,
      options.author,
      options.pageNumbers,
      options.language,
    ]);
    const cached = pdfCache.get(cacheKey);
    if (cached && Date.now() - cached.created < 60000) return cached;
    const document = await buildDocument(file, options);
    documents.set(id, document.html);
    printer = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    printer.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    printer.webContents.on("will-navigate", (event) => event.preventDefault());
    await printer.loadURL(`aldus://document/${id}`);
    const missing = await printer.webContents.executeJavaScript(
      `document.fonts.ready.then(() => Promise.all(Array.from(document.images, async image => { try { await image.decode(); return null; } catch { return image.alt || "image"; } })))`,
    );
    document.warnings.push(...missing.filter(Boolean));
    const data = await printer.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0.79, bottom: 0.98, left: 0.79, right: 0.79 },
      displayHeaderFooter: options.pageNumbers,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="width:100%;text-align:center;font-size:9px;color:#888"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
    const result = {
      id,
      data,
      created: Date.now(),
      warnings: document.warnings,
      layoutWarnings: document.layoutWarnings,
      sourceDiagnostics: document.sourceDiagnostics,
      theme: options.theme,
    };
    if (!document.warnings.length) {
      pdfCache.set(cacheKey, result);
      let bytes = [...pdfCache.values()].reduce(
        (sum, item) => sum + item.data.length,
        0,
      );
      while (pdfCache.size > 8 || bytes > 64 * 1024 * 1024) {
        const key = pdfCache.keys().next().value;
        bytes -= pdfCache.get(key).data.length;
        pdfCache.delete(key);
      }
    }
    return result;
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(t("fileMissing"));
    throw error;
  } finally {
    documents.delete(id);
    printer?.destroy();
    rendering = false;
  }
}

function installHandlers() {
  handle("state", () => ({
    ...config,
    version: app.getVersion(),
    shortcutError,
    update,
  }));
  handle("search", (query) =>
    library.search(String(query || "").slice(0, 200)),
  );
  handle("add-folder", async () => {
    const result = await withNativeDialog(() =>
      dialog.showOpenDialog(window, {
        title: t("folderDialog"),
        properties: ["openDirectory"],
      }),
    );
    if (!result.canceled) {
      const folder = await fs.realpath(result.filePaths[0]);
      if (!config.roots.includes(folder)) {
        config.roots.push(folder);
        await persist();
        await configureSearch();
      }
    }
    return config.roots;
  });
  handle("remove-folder", async (folder) => {
    config.roots = config.roots.filter((root) => root !== folder);
    await persist();
    await configureSearch();
    return config.roots;
  });
  handle("refresh", () => library.refresh());
  handle("search-scope", async (autoSearch) => {
    if (typeof autoSearch !== "boolean") throw new Error(t("invalidSettings"));
    config.autoSearch = autoSearch;
    await persist();
    await configureSearch();
    return config;
  });
  handle("exclude-folder", async () => {
    const result = await withNativeDialog(() =>
      dialog.showOpenDialog(window, {
        title: t("excludeFolder"),
        properties: ["openDirectory"],
      }),
    );
    if (!result.canceled) {
      const folder = await fs.realpath(result.filePaths[0]);
      if (!config.excludedRoots.includes(folder))
        config.excludedRoots.push(folder);
      await persist();
      await configureSearch();
    }
    return config;
  });
  handle("remove-exclusion", async (folder) => {
    config.excludedRoots = config.excludedRoots.filter(
      (root) => root !== folder,
    );
    await persist();
    await configureSearch();
    return config;
  });
  handle("choose-file", async () => {
    const result = await withNativeDialog(() =>
      dialog.showOpenDialog(window, {
        title: t("previewDialog"),
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
        properties: ["openFile"],
      }),
    );
    if (result.canceled) return null;
    const file = result.filePaths[0];
    selectedFiles.add(file);
    return {
      path: file,
      name: path.basename(file),
      folder: path.dirname(file),
    };
  });
  handle("settings", async (options) => {
    if (batchJob?.running) throw new Error(t("batchBusy"));
    if (
      !options ||
      !["default", "minimal", "dark"].includes(options.theme) ||
      typeof options.author !== "string" ||
      options.author.length > 200 ||
      typeof options.pageNumbers !== "boolean" ||
      typeof options.shortcut !== "string" ||
      options.shortcut.length > 100
    )
      throw new Error(t("invalidSettings"));
    if (!registerShortcut(options.shortcut))
      throw new Error(t("shortcutConflict"));
    config = {
      ...config,
      theme: options.theme,
      author: options.author.trim(),
      pageNumbers: options.pageNumbers,
      shortcut: options.shortcut,
    };
    shortcutError = "";
    await persist();
    return { ...config, version: app.getVersion() };
  });
  handle("language", async (language) => {
    if (!["zh", "en"].includes(language)) throw new Error(t("invalidSettings"));
    config.language = language;
    await persist();
    updateTray();
    return { ...config, version: app.getVersion() };
  });
  handle("resize", (layout) => {
    if (!layout || !["search", "preview"].includes(layout.mode)) return;
    const changedMode = currentLayout.mode !== layout.mode;
    currentLayout = layout;
    applyLayout(undefined, changedMode);
  });
  handle("hide", () => window.hide());
  handle("preview", async (file) => {
    if (
      typeof file !== "string" ||
      !isMarkdown(file) ||
      !(selectedFiles.has(file) || (await library.has(file)))
    )
      throw new Error(t("chooseMarkdown"));
    if (batchJob?.running) throw new Error(t("batchBusy"));
    const result = await renderPdf(file, { ...config });
    previews.clear();
    previews.set(result.id, {
      data: result.data,
      source: file,
      exported: null,
    });
    return { ...result, data: new Uint8Array(result.data) };
  });
  handle("folder", async (folder, recursive = true) => {
    if (typeof folder !== "string" || !path.isAbsolute(folder))
      throw new Error(t("invalidRequest"));
    const result = await library.folder(folder, recursive !== false);
    if (result.files.length > 2000) throw new Error(t("batchLimit"));
    return result;
  });
  handle("batch-start", async (folder, paths, recursive = true) => {
    if (batchJob?.running || rendering) throw new Error(t("batchBusy"));
    if (
      typeof folder !== "string" ||
      !Array.isArray(paths) ||
      !paths.length ||
      paths.length > 2000
    )
      throw new Error(t("invalidRequest"));
    batchJob = { running: true };
    try {
      const listing = await library.folder(folder, recursive !== false);
      const selected = new Set(paths);
      const files = listing.files.filter((file) => selected.has(file.path));
      if (files.length !== selected.size) throw new Error(t("fileMissing"));
      // The reservation covers validation, the picker, and rendering.
      const target = await withNativeDialog(() =>
        dialog.showOpenDialog(window, {
          title: t("batchDestination"),
          properties: ["openDirectory", "createDirectory"],
        }),
      );
      if (target.canceled || quitting) {
        batchJob = undefined;
        return null;
      }
      const options = { ...config };
      batchJob = new BatchJob({
        files,
        output: await fs.realpath(target.filePaths[0]),
        render: (file) => renderPdf(file, options),
        onChange: (state) => {
          if (!window.isDestroyed())
            window.webContents.send("aldus:batch-progress", state);
        },
      });
      const initial = batchJob.snapshot();
      const job = batchJob;
      setImmediate(() => {
        batchCompletion = job.run();
      });
      return initial;
    } catch (error) {
      batchJob = undefined;
      throw error;
    }
  });
  handle("batch-cancel", (id) => {
    if (batchJob?.id === id) batchJob.cancel();
  });
  handle("batch-open-output", async (id) => {
    if (batchJob?.id !== id) throw new Error(t("invalidRequest"));
    const error = await shell.openPath(batchJob.output);
    if (error) throw new Error(error);
  });
  handle("discard", (id) => previews.delete(id));
  handle("export", async (id) => {
    const preview = previews.get(id);
    if (!preview) throw new Error(t("previewExpired"));
    const result = await withNativeDialog(() =>
      dialog.showSaveDialog(window, {
        title: t("export"),
        defaultPath: preview.source.replace(/\.(md|markdown)$/i, ".pdf"),
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      }),
    );
    if (result.canceled || !result.filePath) return null;
    const target = /\.pdf$/i.test(result.filePath)
      ? result.filePath
      : `${result.filePath}.pdf`;
    await fs.writeFile(target, preview.data);
    preview.exported = target;
    return target;
  });
  handle("open-pdf", async (id) => {
    const target = previews.get(id)?.exported;
    if (!target) throw new Error(t("exportFirst"));
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
  });
  handle("check-updates", checkUpdates);
  handle("open-link", (url) => {
    if (
      typeof url !== "string" ||
      url.length > 8000 ||
      !["https:", "http:", "mailto:"].includes(new URL(url).protocol)
    )
      throw new Error(t("invalidRequest"));
    return shell.openExternal(url);
  });
  handle("download-update", () => shell.openExternal(RELEASES));
}

function updateTray() {
  if (!tray) return;
  tray.setToolTip(`Aldus · ${t("subtitle")}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t("trayOpen"), click: reveal },
      { id: "settings", label: t("settings"), click: openSettings },
      { type: "separator" },
      { label: t("quit"), click: () => app.quit() },
    ]),
  );
}

async function start() {
  defaults.language = app.getLocale().startsWith("zh") ? "zh" : "en";
  configFile = path.join(app.getPath("userData"), "settings.json");
  try {
    const saved = JSON.parse(await fs.readFile(configFile, "utf8"));
    config = {
      ...defaults,
      ...saved,
      roots: Array.isArray(saved.roots)
        ? saved.roots.filter(
            (root) => typeof root === "string" && path.isAbsolute(root),
          )
        : [],
    };
  } catch {
    config = { ...defaults };
  }
  if (!["zh", "en"].includes(config.language))
    config.language = defaults.language;
  config.autoSearch =
    typeof config.autoSearch === "boolean" ? config.autoSearch : true;
  config.excludedRoots = Array.isArray(config.excludedRoots)
    ? config.excludedRoots.filter(
        (root) => typeof root === "string" && path.isAbsolute(root),
      )
    : [];
  library = new SearchClient();
  library.on("changed", () => {
    if (window && !window.isDestroyed())
      window.webContents.send("aldus:index-changed");
  });
  void configureSearch().catch((error) =>
    console.error("Search startup failed", error),
  );
  session.defaultSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  protocol.handle("aldus", async (request) => {
    const url = new URL(request.url);
    if (url.host === "document") {
      const html = documents.get(url.pathname.slice(1));
      return new Response(html || "Not found", {
        status: html ? 200 : 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    if (url.host !== "app") return new Response("Not found", { status: 404 });
    const root = path.join(__dirname, "../frontend/dist");
    const file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
    const relative = path.relative(root, file);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).href);
  });
  const initialDisplay = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint(),
  );
  window = new BrowserWindow({
    width: searchWidth(initialDisplay.workArea, config.searchWidth),
    height: 62,
    minWidth: MIN_SEARCH_WIDTH,
    minHeight: 62,
    show: false,
    frame: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    backgroundColor: "#f5f5f6",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  applyLayout(initialDisplay, true);
  window.on("will-move", (_event, next) => {
    requestedBounds = { ...requestedBounds, x: next.x, y: next.y };
  });
  // Only a native user drag sets the preference. Preview/settings expansion,
  // result heights and smaller monitors must never overwrite it.
  window.on("will-resize", (event, next, details) => {
    if (currentLayout.mode !== "search" || currentLayout.settings) return;
    event.preventDefault();
    const bounds = window.getBounds();
    if (next.width === bounds.width) return;
    const area = screen.getDisplayMatching(bounds).workArea;
    const width = searchWidth(area, next.width);
    const left = details.edge.includes("left");
    const x = left ? bounds.x + bounds.width - width : bounds.x;
    requestedBounds = {
      ...bounds,
      width,
      x: Math.round(
        Math.max(
          area.x + MARGIN,
          Math.min(x, area.x + area.width - width - MARGIN),
        ),
      ),
    };
    window.setBounds(requestedBounds);
    config.searchWidth = width;
    clearTimeout(widthSaveTimer);
    widthSaveTimer = setTimeout(() => {
      widthSaveTimer = undefined;
      void persist().catch((error) =>
        console.error("Unable to save window width", error),
      );
    }, 250);
  });
  window.on("moved", () => {
    const display = screen.getDisplayMatching(window.getBounds());
    if (display.id !== currentDisplayId) applyLayout(display);
  });
  screen.on("display-metrics-changed", () => applyLayout());
  screen.on("display-removed", () => applyLayout());
  window.setAlwaysOnTop(true, "floating");
  if (process.platform === "darwin")
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.on("focus", () => clearTimeout(blurTimer));
  window.on("blur", () => {
    clearTimeout(blurTimer);
    // Native pickers are part of Aldus, not a click away to another application.
    if (nativeDialogs || quitting) return;
    blurTimer = setTimeout(() => {
      if (!window.isDestroyed() && !window.isFocused() && !nativeDialogs)
        window.hide();
    }, 120);
  });
  // Use the OS backdrop instead of reducing the opacity of text and PDF pages.
  const acrylic =
    process.platform === "win32" && Number(os.release().split(".")[2]) >= 22621;
  if (
    !process.env.ALDUS_TEST_DIR &&
    (acrylic || process.platform === "darwin")
  ) {
    window.setBackgroundColor("#00000000");
    if (acrylic) window.setBackgroundMaterial("acrylic");
    else window.setVibrancy("under-window");
  }
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      window.hide();
    }
  });
  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="8" fill="#30343b"/><text x="16" y="24" text-anchor="middle" font-family="Georgia" font-size="27" fill="white">A</text></svg>',
    ),
  );
  // Windows needs a raster tray icon; construct a small monogram without external assets.
  const pixels = Buffer.alloc(32 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const leg =
        y > 6 &&
        y < 26 &&
        (Math.abs(x - (16 - (y - 6) * 0.43)) < 2 ||
          Math.abs(x - (16 + (y - 6) * 0.43)) < 2 ||
          (y > 18 && y < 22 && x > 10 && x < 22));
      const i = (y * 32 + x) * 4;
      pixels[i] = leg ? 255 : 59;
      pixels[i + 1] = leg ? 255 : 52;
      pixels[i + 2] = leg ? 255 : 48;
      pixels[i + 3] = 255;
    }
  tray = new Tray(
    icon.isEmpty()
      ? nativeImage.createFromBitmap(pixels, { width: 32, height: 32 })
      : icon,
  );
  updateTray();
  tray.on("click", reveal);
  if (!registerShortcut(config.shortcut)) shortcutError = t("shortcutFailed");
  installHandlers();
  await window.loadURL(APP_URL);
  if (!process.env.ALDUS_TEST_DIR) reveal();
  if (!process.env.ALDUS_TEST_DIR) {
    void checkUpdates();
    setInterval(() => void checkUpdates(), 4 * 60 * 60 * 1000).unref();
  }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", reveal);
  app
    .whenReady()
    .then(start)
    .catch((error) => {
      dialog.showErrorBox(t("startupError"), error.message);
      app.quit();
    });
}
app.on("activate", reveal);
app.on("before-quit", (event) => {
  clearTimeout(blurTimer);
  clearTimeout(widthSaveTimer);
  if (!quitting && config) {
    event.preventDefault();
    quitting = true;
    batchJob?.cancel?.();
    void Promise.all([persist(), library?.close(), batchCompletion])
      .catch((error) => console.error("Unable to save settings", error))
      .finally(() => app.quit());
  } else quitting = true;
});
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {});
