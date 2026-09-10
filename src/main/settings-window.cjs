const { app, BrowserWindow, screen } = require("electron");
const path = require("node:path");

const SETTINGS_URL = "aldus://app/desktop.html?settings";

function createSettingsWindow(
  onClosed,
  isQuitting = () => false,
  getAppearance = () => "light",
) {
  let window;
  let allowClose = false;
  let layoutMode = false;
  let anchor;
  function resize(layout) {
    if (!window || window.isDestroyed()) return;
    if (layout === layoutMode) return;
    layoutMode = layout;
    const area = screen.getDisplayMatching(window.getBounds()).workArea;
    const width = Math.min(layout ? 1320 : 760, area.width - 32);
    const height = Math.min(layout ? 860 : 660, area.height - 32);
    window.setBounds({
      width,
      height,
      x: Math.round(
        Math.max(
          area.x + 16,
          Math.min(
            anchor.centerX - width / 2,
            area.x + area.width - width - 16,
          ),
        ),
      ),
      y: Math.round(
        Math.max(
          area.y + 16,
          Math.min(anchor.top, area.y + area.height - height - 16),
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
    const width = Math.min(760, area.width - 32);
    const height = Math.min(660, area.height - 32);
    anchor = {
      centerX: area.x + area.width / 2,
      top: Math.round(area.y + (area.height - height) / 2),
    };
    layoutMode = false;
    window = new BrowserWindow({
      x: Math.round(anchor.centerX - width / 2),
      y: anchor.top,
      width,
      height,
      minWidth: Math.min(600, area.width - 32),
      minHeight: Math.min(460, area.height - 32),
      show: false,
      frame: false,
      backgroundColor: getAppearance() === "dark" ? "#20252c" : "#f5f6f8",
      title: app.getName(),
      icon: path.join(__dirname, "../../resources/icons/inkleaf.ico"),
      autoHideMenuBar: true,
      webPreferences: {
        additionalArguments: [`--inkleaf-appearance=${getAppearance()}`],
        preload: path.join(__dirname, "preload.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    const opened = window;
    // Window creation and setBounds can round differently on scaled displays.
    // Use the same sizing path initially and when returning from Layout.
    window.setBounds({
      x: Math.round(anchor.centerX - width / 2),
      y: anchor.top,
      width,
      height,
    });
    // Only user gestures update the anchor. Native DPI rounding from setBounds
    // must never become input to the next category switch.
    window.on("will-move", (_event, next) => {
      anchor = { centerX: next.x + next.width / 2, top: next.y };
    });
    window.on("will-resize", (_event, next) => {
      anchor = { centerX: next.x + next.width / 2, top: next.y };
    });
    allowClose = false;
    window.on("close", (event) => {
      if (allowClose || isQuitting()) return;
      event.preventDefault();
      window.webContents.send("aldus:settings-close-requested");
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("dom-ready", () => {
      window.webContents.send("aldus:appearance-changed", getAppearance());
    });
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
  return {
    open,
    resize,
    get: () => window,
    close: () => {
      allowClose = true;
      window?.close();
    },
  };
}

module.exports = { createSettingsWindow, SETTINGS_URL };
