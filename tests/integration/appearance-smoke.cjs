const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const profile = await fs.mkdtemp(
    path.join(os.tmpdir(), "inkleaf-appearance-"),
  );
  const artifacts = path.join(root, "artifacts/tests");
  const file = path.join(profile, "Appearance sample.md");
  await fs.mkdir(artifacts, { recursive: true });
  await fs.writeFile(file, "# Appearance sample\n\nPDF paper stays white.\n");
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      appearance: "light",
      roots: [profile],
      autoSearch: false,
      languagePreference: "en",
      shortcut: "Control+Alt+F9",
    }),
  );
  const env = { ...process.env, ALDUS_TEST_DIR: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => electron.launch({ args: [root], env });
  let desktop = await launch();
  const errors = [];
  async function openSettings(page) {
    const opened = desktop.waitForEvent("window", {
      predicate: (win) => win !== page,
    });
    await page.evaluate(() => window.aldus.openSettings());
    const settings = await opened;
    settings.on("pageerror", (error) => errors.push(error.message));
    await settings.locator("#appearance").waitFor();
    return settings;
  }
  async function appearance(pages, value) {
    for (const page of pages)
      await expect(page.locator("html")).toHaveAttribute(
        "data-appearance",
        value,
      );
  }
  // Emulate OS changes inside this Electron process; never modify Windows settings.
  async function systemAppearance(value) {
    await desktop.evaluate(({ nativeTheme }, value) => {
      nativeTheme.themeSource = value;
    }, value);
  }
  async function capture(page, name) {
    const png = await desktop.evaluate(async ({ BrowserWindow }, url) => {
      const window = BrowserWindow.getAllWindows().find(
        (window) => window.webContents.getURL() === url,
      );
      await window.webContents.executeJavaScript(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      );
      return (
        await window.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        })
      )
        .toPNG()
        .toString("base64");
    }, page.url());
    await fs.writeFile(path.join(artifacts, name), Buffer.from(png, "base64"));
  }
  try {
    let page = await desktop.firstWindow();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByRole("combobox").waitFor();
    await systemAppearance("light");
    let settings = await openSettings(page);
    const mode = settings.locator("#appearance");
    await expect(mode.locator("option")).toHaveText([
      "Light",
      "Dark",
      "System default",
    ]);
    await mode.selectOption("dark");
    await appearance([page, settings], "dark");
    assert.equal(
      await desktop.evaluate(({ nativeTheme }) => nativeTheme.themeSource),
      "light",
    );
    await capture(settings, "appearance-dark-general.png");
    await capture(page, "appearance-dark-search.png");
    await page.reload();
    await page.getByRole("combobox").waitFor();
    await appearance([page], "dark");
    await settings.reload();
    await settings.locator("#appearance").waitFor();
    await appearance([settings], "dark");

    for (const tab of ["Search", "Export", "About & updates", "Layout"]) {
      await settings.getByRole("button", { name: tab, exact: true }).click();
      await appearance([settings], "dark");
    }
    await settings.locator(".pdf-page canvas").first().waitFor();
    await expect(settings.locator(".sample-heading span")).not.toContainText(
      "Preparing",
    );
    await capture(settings, "appearance-dark-layout.png");
    await settings.locator("#author").fill("Alex Tian");
    await settings
      .getByRole("button", { name: "General", exact: true })
      .click();
    await expect(settings.getByRole("dialog")).toBeVisible();
    await capture(settings, "appearance-dark-dialog.png");
    await settings
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await settings
      .getByRole("button", { name: "Revert changes", exact: true })
      .click();
    await settings
      .getByRole("button", { name: "General", exact: true })
      .click();
    await mode.selectOption("system");
    await appearance([page, settings], "light");
    await systemAppearance("dark");
    await appearance([page, settings], "dark");
    await systemAppearance("light");
    await appearance([page, settings], "light");
    await mode.selectOption("light");
    await systemAppearance("dark");
    await appearance([page, settings], "light");
    await capture(settings, "appearance-light-general.png");

    await settings.locator("#languagePreference").selectOption("zh");
    await expect(settings.locator("label[for=appearance]")).toHaveText(
      "外观模式",
    );
    await expect(mode.locator("option")).toHaveText([
      "浅色",
      "深色",
      "跟随系统",
    ]);
    await mode.selectOption("dark");
    await settings.evaluate(() => {
      void window.aldus.closeSettings();
    });
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.aldus.search("Appearance sample")))
            .matches,
      )
      .toBeGreaterThan(0);
    await page.getByRole("combobox").fill("Appearance sample");
    await page.locator(".file-result").first().waitFor();
    await page.getByRole("combobox").press("Enter");
    const canvas = page.locator(".pdf-page canvas").first();
    await canvas.waitFor();
    await expect(page.locator(".render-indicator")).toHaveCount(0);
    await expect(page.locator(".preview-topbar .primary-button")).toBeEnabled();
    await expect
      .poll(() => canvas.evaluate((canvas) => canvas.width))
      .toBeGreaterThan(100);
    const paper = await canvas.evaluate((canvas) =>
      Array.from(canvas.getContext("2d").getImageData(5, 5, 1, 1).data),
    );
    assert.deepEqual(paper, [255, 255, 255, 255]);
    const pdfPixels = await canvas.evaluate((canvas) => canvas.toDataURL());
    await capture(page, "appearance-dark-preview.png");
    settings = await openSettings(page);
    await settings.locator("#appearance").selectOption("light");
    await appearance([page, settings], "light");
    assert.ok(
      (await canvas.evaluate((canvas) => canvas.toDataURL())) === pdfPixels,
      "Switching app appearance must not change the rendered PDF pixels",
    );
    assert.equal(
      (await page.evaluate(() => window.aldus.state())).theme,
      "folio",
    );
    await settings.locator("#appearance").selectOption("dark");
    await appearance([page, settings], "dark");
    await desktop.close();

    desktop = await launch();
    page = await desktop.firstWindow();
    await page.getByRole("combobox").waitFor();
    await appearance([page], "dark");
    settings = await openSettings(page);
    await expect(settings.locator("#appearance")).toHaveValue("dark");
    await settings.locator(".preferences-reset button").click();
    await expect(settings.locator("#appearance")).toHaveValue("system");
    await systemAppearance("light");
    await appearance([page, settings], "light");
    await systemAppearance("dark");
    await appearance([page, settings], "dark");
    assert.deepEqual(errors, []);
    console.log(
      "PASS: appearance switches across windows, OS following, explicit overrides, bilingual labels, persistence/reset, unchanged PDF pixels and theme.",
    );
  } finally {
    await desktop.close();
    if (profile.startsWith(path.join(os.tmpdir(), "inkleaf-appearance-")))
      await fs.rm(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
