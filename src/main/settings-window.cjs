const { BrowserWindow, screen } = require("electron");
const path = require("node:path");

const SETTINGS_URL = "aldus://app/desktop.html?settings";

function createSettingsWindow(onClosed) {
  let window;
  function resize(layout) {
    if (!window || window.isDestroyed()) return;
    const area = screen.getDisplayMatching(window.getBounds()).workArea;
    const previous = window.getBounds();
    const width = Math.min(layout ? 1040 : 700, area.width - 32);
    const height = Math.min(layout ? 740 : 610, area.height - 32);
    window.setBounds({
      width,
      height,
      x: Math.round(
        Math.max(
          area.x + 16,
          Math.min(
            previous.x + (previous.width - width) / 2,
            area.x + area.width - width - 16,
          ),
        ),
      ),
      y: Math.round(
        Math.max(
          area.y + 16,
          Math.min(previous.y, area.y + area.height - height - 16),
        ),
      ),
    });
  }
  async function open() {
    if (window && !window.isDestroyed()) {
      if (!process.env.ALDUS_TEST_DIR) {
        window.show();
        window.focus();
      }
      return;
    }
    const area = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    ).workArea;
    window = new BrowserWindow({
      width: Math.min(700, area.width - 32),
      height: Math.min(610, area.height - 32),
      minWidth: Math.min(600, area.width - 32),
      minHeight: Math.min(460, area.height - 32),
      show: false,
      frame: false,
      backgroundColor: "#f5f6f8",
      title: "Inkleaf",
      icon: path.join(__dirname, "../../resources/icons/inkleaf.ico"),
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    const opened = window;
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    window.on("closed", () => {
      window = undefined;
      onClosed();
    });
    await window.loadURL(SETTINGS_URL);
    if (!opened.isDestroyed() && !process.env.ALDUS_TEST_DIR) {
      opened.show();
      opened.focus();
    }
  }
  return { open, resize, get: () => window, close: () => window?.close() };
}

module.exports = { createSettingsWindow, SETTINGS_URL };
