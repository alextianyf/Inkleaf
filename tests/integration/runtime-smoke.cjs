const { _electron: electron, expect } = require("@playwright/test");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "inkleaf-runtime-"));
  const apps = [];
  function environment(mode) {
    const env = {
      ...process.env,
      ALDUS_TEST_DIR: path.join(folder, mode),
      INKLEAF_TEST_MODE: mode,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    return env;
  }
  async function launch(mode) {
    const app = await electron.launch({ args: [root], env: environment(mode) });
    apps.push(app);
    const page = await app.firstWindow();
    await page.getByRole("combobox").waitFor();
    return { app, page };
  }
  try {
    for (const mode of ["production", "development"]) {
      await fs.mkdir(path.join(folder, mode));
      await fs.writeFile(
        path.join(folder, mode, "settings.json"),
        JSON.stringify({
          autoSearch: false,
          language: "en",
          author: mode,
          // Leave the installed user's production shortcut available.
          ...(mode === "production"
            ? { shortcut: "Control+Alt+Shift+F11" }
            : { shortcut: "Control+Alt+Space" }),
        }),
      );
    }
    const prod = await launch("production");
    const dev = await launch("development");
    const production = await prod.page.evaluate(() => window.aldus.state());
    const development = await dev.page.evaluate(() => window.aldus.state());
    assert.equal(production.shortcutError, "");
    assert.equal(development.shortcutError, "");
    // An existing profile using the former Dev default upgrades on startup.
    assert.equal(development.shortcut, "Control+Alt+Shift+Space");
    assert.notEqual(production.shortcut, development.shortcut);
    assert.equal(development.update.status, "unsupported");
    await expect(dev.page.locator(".brand")).toHaveText("Inkleaf Dev");
    await expect(dev.page).toHaveTitle("Inkleaf Dev");
    for (const [instance, mode] of [
      [prod, "production"],
      [dev, "development"],
    ]) {
      const paths = await instance.app.evaluate(({ app }) => ({
        data: app.getPath("userData"),
        cache: app.getPath("sessionData"),
        logs: app.getPath("logs"),
        name: app.getName(),
      }));
      assert.equal(paths.data, path.join(folder, mode));
      assert.equal(paths.cache, path.join(paths.data, "chromium"));
      assert.equal(paths.logs, path.join(paths.data, "logs"));
      // A second process of the same mode exits while the other mode survives.
      await new Promise((resolve, reject) => {
        const child = spawn(require("electron"), [root], {
          env: environment(mode),
          windowsHide: true,
          stdio: "ignore",
        });
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error("Duplicate did not exit"));
        }, 15000);
        child.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.on("exit", (code) => {
          clearTimeout(timer);
          code === 0 ? resolve() : reject(new Error(`Duplicate exit ${code}`));
        });
      });
    }
    await dev.page.evaluate(() =>
      window.aldus.settings({ author: "Dev only", searchWidth: 700 }),
    );
    assert.equal(
      (await prod.page.evaluate(() => window.aldus.state())).author,
      "production",
    );
    assert.equal(
      JSON.parse(
        await fs.readFile(path.join(folder, "production/settings.json")),
      ).author,
      "production",
    );
    await assert.rejects(
      dev.page.evaluate(() => window.aldus.settings({ launchAtLogin: true })),
    );
    await dev.app.evaluate(({ app }) => {
      app.setLoginItemSettings = () => {
        throw new Error("Must not change OS login settings");
      };
    });
    const opened = dev.app.waitForEvent("window");
    await dev.page.evaluate(() => window.aldus.openSettings());
    const settings = await opened;
    await expect(settings.locator("#launchAtLogin")).toBeDisabled();
    await settings.getByRole("button", { name: "Reset this category" }).click();
    await expect
      .poll(
        async () =>
          (await dev.page.evaluate(() => window.aldus.state())).shortcut,
      )
      .toBe("Control+Alt+Shift+Space");
    await settings
      .getByRole("button", { name: "About & updates", exact: true })
      .click();
    await expect(settings.locator(".preferences-about")).toContainText(
      "local source",
    );
    await settings
      .getByRole("button", { name: "General", exact: true })
      .click();
    await settings.locator("#languagePreference").selectOption("zh");
    await expect(settings.locator(".brand")).toHaveText("Inkleaf Dev设置");
    await settings
      .getByRole("button", { name: "关于与更新", exact: true })
      .click();
    await expect(settings.locator(".preferences-about")).toContainText(
      "本地源码",
    );
    await dev.app.close();
    apps.splice(apps.indexOf(dev.app), 1);
    const reopened = await launch("development");
    const restored = await reopened.page.evaluate(() => window.aldus.state());
    assert.equal(restored.author, "Dev only");
    assert.equal(restored.language, "zh");
    assert.equal(restored.launchAtLogin, false);
    assert.equal(
      (await prod.page.evaluate(() => window.aldus.state())).language,
      "en",
    );
    console.log(
      "PASS: simultaneous runtimes, per-profile single-instance locks, separate caches/settings, shortcuts, bilingual Dev identity, disabled updates/login, reset and restart.",
    );
  } finally {
    for (const app of apps.reverse()) await app.close().catch(() => {});
    assert.equal(path.dirname(folder), path.resolve(os.tmpdir()));
    assert.ok(path.basename(folder).startsWith("inkleaf-runtime-"));
    await fs.rm(folder, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
