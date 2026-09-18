// Produce PDFs through the real desktop app, exactly as a user would get them:
// same settings path, same header and footer, same pagination rules.
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const { existsSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { layout } = require("../../../src/shared/preferences.json");

const root = path.resolve(__dirname, "../../..");

// Settings every quality run uses, so reports stay comparable over time.
const reviewLayout = {
  ...layout,
  author: "Inkleaf",
  copyrightLabel: "Quality check",
  headerEnabled: true,
  headerText: "Inkleaf · Quality check",
  headerPosition: "left",
  footerEnabled: true,
  footerText: "{file}",
  footerPosition: "left",
  pageNumberPosition: "right",
};

async function renderWithApp({ file, themes, language, overrides = {} }) {
  if (!existsSync(path.join(root, "dist/renderer/desktop.html")))
    throw new Error("The app is not built yet. Run `npm run build:ui` first.");
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "inkleaf-quality-"));
  await fs.writeFile(
    path.join(sandbox, "settings.json"),
    JSON.stringify({
      roots: [path.dirname(file)],
      autoSearch: false,
      languagePreference: language,
      shortcut: "Control+Alt+Shift+F11",
    }),
  );
  const env = { ...process.env, ALDUS_TEST_DIR: sandbox };
  delete env.ELECTRON_RUN_AS_NODE;
  const desktop = await electron.launch({ args: [root], env });
  const results = [];
  try {
    const page = await desktop.firstWindow();
    await expect(page.getByRole("combobox")).toBeVisible();
    for (const theme of themes) {
      const options = { ...reviewLayout, ...overrides, theme };
      const result = await page.evaluate(
        async ({ options, file }) => {
          await window.aldus.settings(options);
          const preview = await window.aldus.preview(file);
          return {
            data: Array.from(preview.data),
            warnings: preview.warnings,
            layoutWarnings: preview.layoutWarnings,
            sourceDiagnostics: preview.sourceDiagnostics,
          };
        },
        { options, file },
      );
      results.push({
        theme,
        language,
        data: Uint8Array.from(result.data),
        warnings: result.warnings,
        layoutWarnings: result.layoutWarnings,
        sourceDiagnostics: result.sourceDiagnostics || [],
      });
    }
  } finally {
    await desktop.close();
    if (path.dirname(sandbox) !== path.resolve(os.tmpdir()))
      throw new Error("Unexpected test directory");
    await fs.rm(sandbox, { recursive: true, force: true });
  }
  return results;
}

module.exports = { renderWithApp, root };
