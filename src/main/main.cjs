const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  dialog,
  shell,
  protocol,
  net,
  screen,
  session,
  nativeTheme,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createUpdateService } = require("./updates.cjs");
const { autoUpdater } = require("electron-updater");
let updates;
let activeOperations = 0;
const { SearchClient } = require("../search/client.cjs");
const { isMarkdown } = require("../search/index.cjs");
const { PdfService } = require("./pdf-service.cjs");
const {
  loadSettings,
  createSettingsWriter,
  validatePreferences,
  resolveLanguage,
} = require("./settings.cjs");
const { createSettingsWindow, SETTINGS_URL } = require("./settings-window.cjs");
const { exportDirectory } = require("./export-location.cjs");
const { layoutKey } = require("../conversion/layout.cjs");
const { createTrayIcon } = require("./tray-icon.cjs");
const { BatchJob, writeUniquePdf } = require("../conversion/batch.cjs");
let batchJob;
let batchCompletion = Promise.resolve();
const {
  searchWidth,
  layoutBounds,
  MIN_SEARCH_WIDTH,
  MARGIN,
} = require("./window-layout.cjs");
const strings = require("../shared/strings.json");
const os = require("node:os");
const t = (key) => strings[config?.language || "zh"][key];

const APP_URL = "aldus://app/desktop.html";
let library;
const selectedFiles = new Set();
const documents = new Map();
const pdfService = new PdfService(documents, t);
const previews = new Map();
const sampleService = new PdfService(documents, t);
let sampleQueue = Promise.resolve();
const settingsWindow = createSettingsWindow(() => {
  void persist()
    .then(() => {
      if (!window.isDestroyed() && !quitting) {
        window.webContents.send("aldus:preferences-changed", state());
        if (currentLayout.mode === "preview" && !process.env.ALDUS_TEST_DIR)
          reveal();
      }
    })
    .catch((error) => console.error("Unable to save settings", error));
});
function state() {
  return {
    ...config,
    version: app.getVersion(),
    shortcutError,
    update: updates.getState(),
    downloadsPath: app.getPath("downloads"),
  };
}
function dialogParent() {
  return settingsWindow.get() || window;
}
let window,
  tray,
  config,
  configFile,
  quitting = false;
let shortcutError = "";
let nativeDialogs = 0;
let blurTimer;
let widthSaveTimer;
let currentLayout = { mode: "search" };
let currentDisplayId;
let requestedBounds;

app.setName("Inkleaf");
// Keep the existing profile and installation identity when changing the brand.
app.setPath(
  "userData",
  process.env.ALDUS_TEST_DIR || path.join(app.getPath("appData"), "Aldus"),
);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "aldus",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

let saveSettings;
function persist() {
  return saveSettings(config);
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
  window.hide();
  void settingsWindow.open();
}

async function withNativeDialog(action) {
  nativeDialogs++;
  clearTimeout(blurTimer);
  try {
    return await action();
  } finally {
    nativeDialogs--;
    if (!window.isDestroyed() && !quitting && !process.env.ALDUS_TEST_DIR) {
      dialogParent().show();
      dialogParent().focus();
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

function handle(name, fn) {
  const changesFiles = [
    "preview",
    "export",
    "batch-start",
    "settings",
    "sample-preview",
    "choose-export-folder",
    "language",
    "add-folder",
    "remove-folder",
    "exclude-folder",
    "remove-exclusion",
    "search-scope",
  ].includes(name);
  ipcMain.handle(`aldus:${name}`, async (event, ...args) => {
    const senderWindow = [window, settingsWindow.get()].find(
      (candidate) =>
        candidate &&
        !candidate.isDestroyed() &&
        candidate.webContents === event.sender,
    );
    if (
      !senderWindow ||
      event.senderFrame !== event.sender.mainFrame ||
      ![APP_URL, SETTINGS_URL].includes(event.senderFrame.url)
    )
      throw new Error(t("invalidRequest"));
    if (
      updates.getState().status === "installing" &&
      name !== "state" &&
      name !== "hide"
    ) {
      throw new Error(t("updateInstalling"));
    }
    if (changesFiles) activeOperations++;
    try {
      return await fn(...args);
    } finally {
      if (changesFiles) activeOperations--;
    }
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

function installHandlers() {
  handle("state", state);
  handle("open-settings", openSettings);
  handle("close-settings", () => settingsWindow.close());
  handle("settings-layout", (layout) => settingsWindow.resize(layout === true));
  handle("sample-preview", async (options) => {
    let valid;
    try {
      valid = validatePreferences(options);
    } catch {
      throw new Error(t("invalidSettings"));
    }
    const language = config.language;
    const optionsSnapshot = { ...config, ...valid, language };
    // Keep requests ordered even if the settings window is closed and reopened.
    sampleQueue = sampleQueue
      .catch(() => {})
      .then(() =>
        sampleService.render(
          path.join(
            __dirname,
            "../../resources/samples",
            "layout-" + language + ".md",
          ),
          optionsSnapshot,
        ),
      );
    const result = await sampleQueue;
    return { ...result, data: new Uint8Array(result.data) };
  });
  handle("choose-export-folder", async () => {
    const result = await withNativeDialog(() =>
      dialog.showOpenDialog(dialogParent(), {
        title: t("batchDestination"),
        properties: ["openDirectory", "createDirectory"],
      }),
    );
    return result.canceled ? null : result.filePaths[0];
  });
  handle("search", (query) =>
    library.search(String(query || "").slice(0, 200)),
  );
  handle("add-folder", async () => {
    const result = await withNativeDialog(() =>
      dialog.showOpenDialog(dialogParent(), {
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
      dialog.showOpenDialog(dialogParent(), {
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
      dialog.showOpenDialog(dialogParent(), {
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
    let patch;
    try {
      patch = validatePreferences(options);
    } catch {
      throw new Error(t("invalidSettings"));
    }
    const changesLogin =
      Object.hasOwn(patch, "launchAtLogin") &&
      patch.launchAtLogin !== config.launchAtLogin;
    const supportsLogin =
      process.env.ALDUS_TEST_DIR ||
      (app.isPackaged && ["win32", "darwin"].includes(process.platform));
    if (changesLogin && !supportsLogin) throw new Error(t("loginUnavailable"));
    if (patch.shortcut && !registerShortcut(patch.shortcut))
      throw new Error(t("shortcutConflict"));
    // Integration tests must not change the user's login applications.
    if (changesLogin && !process.env.ALDUS_TEST_DIR) {
      app.setLoginItemSettings({
        openAtLogin: patch.launchAtLogin,
        args: ["--hidden"],
      });
    }
    config = { ...config, ...patch };
    config.language = resolveLanguage(
      config.languagePreference,
      app.getLocale(),
    );
    shortcutError = "";
    await persist();
    updateTray();
    if (
      ["roots", "excludedRoots", "autoSearch"].some((key) =>
        Object.hasOwn(patch, key),
      )
    )
      await configureSearch();
    if (Object.hasOwn(patch, "searchWidth")) applyLayout();
    return state();
  });
  handle("language", async (language) => {
    if (!["system", "zh", "en"].includes(language))
      throw new Error(t("invalidSettings"));
    config.languagePreference = language;
    config.language = resolveLanguage(language, app.getLocale());
    await persist();
    updateTray();
    return state();
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
    const result = await pdfService.render(file, { ...config });
    previews.clear();
    previews.set(result.id, {
      data: result.data,
      layoutKey: result.layoutKey,
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
    if (batchJob?.running || pdfService.busy) throw new Error(t("batchBusy"));
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
      const options = { ...config };
      let sourceDestination = options.exportDestination === "source";
      let output;
      if (options.askExportLocation) {
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
        output = target.filePaths[0];
        sourceDestination = false;
      } else if (sourceDestination) output = folder;
      else
        output = path.join(
          exportDirectory(options, files[0].path, app.getPath("downloads")),
          path.basename(folder),
        );
      await fs.mkdir(output, { recursive: true });
      batchJob = new BatchJob({
        files,
        output: await fs.realpath(output),
        sourceDestination,
        preserveFolders: options.preserveFolders,
        render: (file) => pdfService.render(file, options),
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
    if (preview.layoutKey !== layoutKey(config))
      throw new Error(t("previewExpired"));
    const options = { ...config };
    const directory = exportDirectory(
      options,
      preview.source,
      app.getPath("downloads"),
    );
    let target;
    if (options.askExportLocation) {
      const result = await withNativeDialog(() =>
        dialog.showSaveDialog(window, {
          title: t("export"),
          defaultPath: path.join(
            directory,
            path.basename(preview.source).replace(/\.(md|markdown)$/i, ".pdf"),
          ),
          filters: [{ name: "PDF", extensions: ["pdf"] }],
        }),
      );
      if (result.canceled || !result.filePath) return null;
      target = /\.pdf$/i.test(result.filePath)
        ? result.filePath
        : result.filePath + ".pdf";
      await fs.writeFile(target, preview.data);
    } else {
      await fs.mkdir(directory, { recursive: true });
      target = await writeUniquePdf(
        directory,
        path.basename(preview.source),
        preview.data,
      );
    }
    if (options.openAfterExport) {
      const error = await shell.openPath(target);
      if (error) throw new Error(error);
    }
    preview.exported = target;
    return target;
  });
  handle("open-pdf", async (id) => {
    const target = previews.get(id)?.exported;
    if (!target) throw new Error(t("exportFirst"));
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
  });
  handle("check-updates", () => updates.check());
  handle("open-link", (url) => {
    if (
      typeof url !== "string" ||
      url.length > 8000 ||
      !["https:", "http:", "mailto:"].includes(new URL(url).protocol)
    )
      throw new Error(t("invalidRequest"));
    return shell.openExternal(url);
  });
  handle("download-update", () => updates.download());
  handle("install-update", () => updates.install());
  handle("cancel-update-install", () => updates.cancelInstall());
}

function updateTray() {
  if (!tray) return;
  tray.setToolTip(`${t("brandName")} · ${t("subtitle")}`);
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
  if (process.platform === "win32") app.setAppUserModelId("com.alextian.aldus");
  configFile = path.join(app.getPath("userData"), "settings.json");
  config = await loadSettings(configFile, app.getLocale());
  saveSettings = createSettingsWriter(configFile);
  updates = createUpdateService({
    updater: autoUpdater,
    enabled:
      process.platform === "win32" &&
      (app.isPackaged || Boolean(process.env.ALDUS_TEST_DIR)),
    isBusy: () =>
      quitting ||
      activeOperations > 0 ||
      nativeDialogs > 0 ||
      pdfService.busy ||
      sampleService.busy ||
      Boolean(batchJob?.running),
    beforeInstall: persist,
    onChange: (state) => {
      for (const target of [window, settingsWindow.get()]) {
        if (target && !target.isDestroyed())
          target.webContents.send("aldus:update-changed", state);
      }
    },
  });
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
    const root = path.join(__dirname, "../../dist/renderer");
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
    title: "Inkleaf",
    icon: path.join(__dirname, "../../resources/icons/inkleaf.ico"),
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
    // Top/bottom drags can include native DPI rounding in next.width. Only
    // dragging a side (including a corner) may change the width preference.
    if (!details.edge.includes("left") && !details.edge.includes("right"))
      return;
    if (next.width === window.getBounds().width) return;
    const bounds = requestedBounds || window.getBounds();
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
    // Keep the window available while one of its native pickers is open.
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

  tray = new Tray(createTrayIcon());
  nativeTheme.on("updated", () => tray.setImage(createTrayIcon()));
  updateTray();
  tray.on("click", reveal);
  if (!registerShortcut(config.shortcut)) shortcutError = t("shortcutFailed");
  installHandlers();
  await window.loadURL(APP_URL);
  if (!process.env.ALDUS_TEST_DIR) {
    const loginLaunch =
      process.argv.includes("--hidden") ||
      (process.platform === "darwin" &&
        app.getLoginItemSettings().wasOpenedAtLogin);
    if (process.argv.includes("--settings")) openSettings();
    else if (!loginLaunch) reveal();
  }
  if (!process.env.ALDUS_TEST_DIR) {
    void updates.check();
    setInterval(() => void updates.check(), 4 * 60 * 60 * 1000).unref();
  }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", (_event, argv) => {
    if (argv.includes("--settings")) openSettings();
    else reveal();
  });
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
  updates?.close();
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
