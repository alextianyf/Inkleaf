const { nativeImage, nativeTheme } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

function createTrayIcon() {
  // Windows taskbar colour can differ from the application colour scheme.
  const dark =
    nativeTheme.shouldUseDarkColorsForSystemIntegratedUI ??
    nativeTheme.shouldUseDarkColors;
  const colour = process.platform !== "darwin" && dark ? "light" : "dark";
  const icon = nativeImage.createEmpty();
  for (const size of [16, 32, 48]) {
    const file = path.join(
      __dirname,
      "../../resources/icons",
      "tray-" + colour + "-" + size + ".png",
    );
    icon.addRepresentation({
      scaleFactor: size / 16,
      buffer: fs.readFileSync(file),
    });
  }
  if (process.platform === "darwin") icon.setTemplateImage(true);
  return icon;
}
module.exports = { createTrayIcon };
