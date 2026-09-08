const { contextBridge, ipcRenderer } = require("electron");
const invoke =
  (channel) =>
  (...args) =>
    ipcRenderer.invoke(`aldus:${channel}`, ...args);
contextBridge.exposeInMainWorld("aldus", {
  state: invoke("state"),
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
