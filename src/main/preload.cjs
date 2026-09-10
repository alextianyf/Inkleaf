const { contextBridge, ipcRenderer } = require("electron");
// Style only the app DOM. Native system preferences and PDF documents stay independent.
let appearance = process.argv.includes("--inkleaf-appearance=dark")
  ? "dark"
  : "light";
function applyAppearance() {
  if (document.documentElement)
    document.documentElement.dataset.appearance = appearance;
}
ipcRenderer.on("aldus:appearance-changed", (_event, value) => {
  if (value !== "light" && value !== "dark") return;
  appearance = value;
  applyAppearance();
});
window.addEventListener("DOMContentLoaded", applyAppearance, { once: true });
applyAppearance();
const invoke =
  (channel) =>
  (...args) =>
    ipcRenderer.invoke(`aldus:${channel}`, ...args);
contextBridge.exposeInMainWorld("aldus", {
  state: invoke("state"),
  openSettings: invoke("open-settings"),
  closeSettings: invoke("close-settings"),
  settingsLayout: invoke("settings-layout"),
  onSettingsClose: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("aldus:settings-close-requested", listener);
    return () =>
      ipcRenderer.removeListener("aldus:settings-close-requested", listener);
  },
  samplePreview: invoke("sample-preview"),
  chooseExportFolder: invoke("choose-export-folder"),
  onPreferencesChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("aldus:preferences-changed", listener);
    return () =>
      ipcRenderer.removeListener("aldus:preferences-changed", listener);
  },
  search: invoke("search"),
  searchScope: invoke("search-scope"),
  excludeFolder: invoke("exclude-folder"),
  removeExclusion: invoke("remove-exclusion"),
  onIndexChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("aldus:index-changed", listener);
    return () => ipcRenderer.removeListener("aldus:index-changed", listener);
  },
  addFolder: invoke("add-folder"),
  removeFolder: invoke("remove-folder"),
  refresh: invoke("refresh"),
  chooseFile: invoke("choose-file"),
  preview: invoke("preview"),
  cancelPreview: invoke("cancel-preview"),
  folder: invoke("folder"),
  batchStart: invoke("batch-start"),
  batchCancel: invoke("batch-cancel"),
  batchOpenOutput: invoke("batch-open-output"),
  onBatchProgress: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("aldus:batch-progress", listener);
    return () => ipcRenderer.removeListener("aldus:batch-progress", listener);
  },
  discard: invoke("discard"),
  exportPdf: invoke("export"),
  openPdf: invoke("open-pdf"),
  openLink: invoke("open-link"),
  settings: invoke("settings"),
  language: invoke("language"),
  resize: invoke("resize"),
  hide: invoke("hide"),
  checkUpdates: invoke("check-updates"),
  downloadUpdate: invoke("download-update"),
  installUpdate: invoke("install-update"),
  cancelUpdateInstall: invoke("cancel-update-install"),
  onUpdate: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("aldus:update-changed", listener);
    return () => ipcRenderer.removeListener("aldus:update-changed", listener);
  },
  onSettings: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("aldus:open-settings", listener);
    return () => ipcRenderer.removeListener("aldus:open-settings", listener);
  },
  onFocus: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("aldus:focus", listener);
    return () => ipcRenderer.removeListener("aldus:focus", listener);
  },
});
