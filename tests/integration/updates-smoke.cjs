const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { createHash } = require("node:crypto");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "aldus-updates-"));
  const artifacts = path.join(root, "artifacts/tests");
  const notes = path.join(sandbox, "notes");
  await fs.mkdir(notes);
  await fs.mkdir(artifacts, { recursive: true });
  const file = path.join(notes, "update-fixture.md");
  await fs.writeFile(
    file,
    "# Update test\n\nFinish exporting before installing.",
  );
  await fs.writeFile(
    path.join(sandbox, "settings.json"),
    JSON.stringify({
      roots: [notes],
      autoSearch: false,
      askExportLocation: true,
      language: "zh",
      author: "Preserved author",
      shortcut: "Control+Alt+F5",
    }),
  );

  // 下载器真实走 HTTP 与 SHA-512 校验；这个文件不是程序，绝不执行。
  // 只在安装器启动边界替换 quitAndInstall，记录是否在导出完成后才调用。
  const payload = Buffer.alloc(4 * 1024 * 1024, 42);
  const checksum = createHash("sha512").update(payload).digest("base64");
  let corrupt = true;
  let downloads = 0;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/latest.yml") {
      response.end(
        JSON.stringify({
          version: "99.0.0",
          path: "Aldus-Test.exe",
          sha512: checksum,
          files: [
            { url: "Aldus-Test.exe", sha512: checksum, size: payload.length },
          ],
          releaseDate: "2026-09-01T00:00:00.000Z",
        }),
      );
      return;
    }
    if (url.pathname !== "/Aldus-Test.exe") {
      response.writeHead(404).end();
      return;
    }
    downloads++;
    const bytes = corrupt ? Buffer.alloc(payload.length, 43) : payload;
    response.writeHead(200, {
      "Content-Length": bytes.length,
      "Content-Type": "application/octet-stream",
    });
    let offset = 0;
    const timer = setInterval(() => {
      response.write(bytes.subarray(offset, offset + 128 * 1024));
      offset += 128 * 1024;
      if (offset >= bytes.length) {
        clearInterval(timer);
        response.end();
      }
    }, 100);
    response.on("close", () => clearInterval(timer));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const configPath = path.join(sandbox, "update.yml");
  await fs.writeFile(
    configPath,
    JSON.stringify({
      provider: "generic",
      url: `http://127.0.0.1:${server.address().port}/`,
      updaterCacheDirName: "cache",
    }),
  );
  const env = { ...process.env, ALDUS_TEST_DIR: sandbox };
  delete env.ELECTRON_RUN_AS_NODE;
  let desktop;
  async function screenshot(name) {
    const png = await desktop.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().startsWith("aldus://app/"),
      );
      return (await window.webContents.capturePage())
        .toPNG()
        .toString("base64");
    });
    await fs.writeFile(path.join(artifacts, name), Buffer.from(png, "base64"));
  }

  async function launch() {
    desktop = await electron.launch({
      ...(process.env.ALDUS_EXECUTABLE
        ? { executablePath: process.env.ALDUS_EXECUTABLE, args: [] }
        : { args: [root] }),
      env,
    });
    const page = await desktop.firstWindow();
    await page.getByRole("combobox").waitFor();
    await desktop.evaluate(
      ({ app, shell }, { configPath, sandbox }) => {
        const { autoUpdater } = process.mainModule.require(
          app.getAppPath() + "/node_modules/electron-updater",
        );
        autoUpdater.updateConfigPath = configPath;
        autoUpdater.forceDevUpdateConfig = true;
        autoUpdater.disableDifferentialDownload = true;
        Object.defineProperty(autoUpdater.app, "baseCachePath", {
          get: () => sandbox,
        });
        globalThis.installCalls = [];
        autoUpdater.quitAndInstall = (...args) =>
          globalThis.installCalls.push(args);
        shell.openExternal = async () => {
          throw new Error("Updates must not open a browser");
        };
      },
      { configPath, sandbox },
    );
    return page;
  }

  try {
    let page = await launch();
    await page.evaluate(() => window.aldus.checkUpdates());
    const downloadButton = page.getByRole("button", {
      name: "有新版本 · 下载",
      exact: true,
    });
    await downloadButton.waitFor();
    assert.equal(downloads, 0, "checking never starts a download");
    await downloadButton.click();
    await expect(page.getByRole("progressbar")).toBeVisible();
    await expect
      .poll(async () =>
        Number(await page.getByRole("progressbar").getAttribute("value")),
      )
      .toBeGreaterThan(0);
    await screenshot("update-downloading.png");
    await page
      .getByRole("button", { name: "下载或校验失败 · 重试" })
      .waitFor({ timeout: 20000 });
    await page.evaluate(() => window.aldus.installUpdate());
    assert.deepEqual(await desktop.evaluate(() => globalThis.installCalls), []);
    corrupt = false;
    await page.getByRole("button", { name: "下载或校验失败 · 重试" }).click();
    await page
      .getByRole("button", { name: "重启并更新", exact: true })
      .waitFor({ timeout: 20000 });
    const cached = await desktop.evaluate(({ app }) => {
      return process.mainModule.require(
        app.getAppPath() + "/node_modules/electron-updater",
      ).autoUpdater.installerPath;
    });
    assert.ok(cached.startsWith(sandbox + path.sep));
    assert.equal(
      createHash("sha512")
        .update(await fs.readFile(cached))
        .digest("base64"),
      checksum,
    );
    assert.deepEqual(await desktop.evaluate(() => globalThis.installCalls), []);
    await screenshot("update-ready.png");
    await desktop.close();
    desktop = null;

    // 重新启动后，损坏的缓存不能跳过完整性校验。
    await fs.writeFile(cached, Buffer.alloc(payload.length, 44));
    page = await launch();
    await page.evaluate(() => window.aldus.checkUpdates());
    await page
      .getByRole("button", { name: "有新版本 · 下载", exact: true })
      .click();
    await page
      .getByRole("button", { name: "重启并更新", exact: true })
      .waitFor({ timeout: 20000 });
    assert.equal(
      downloads,
      3,
      "a corrupt cached installer is downloaded again",
    );
    await page.evaluate(() => window.aldus.language("en"));
    await page.reload();
    await page
      .getByRole("button", { name: "Restart and update", exact: true })
      .waitFor();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.aldus.search("update-fixture")))
            .matches,
      )
      .toBe(1);
    await page.evaluate(async (file) => {
      globalThis.previewId = (await window.aldus.preview(file)).id;
    }, file);

    async function holdExport() {
      await desktop.evaluate(({ dialog }) => {
        dialog.showSaveDialog = () =>
          new Promise((resolve) => {
            globalThis.finishExport = resolve;
          });
      });
      await page.evaluate(() => {
        globalThis.pendingExport = window.aldus.exportPdf(globalThis.previewId);
      });
      await expect
        .poll(() => desktop.evaluate(() => typeof globalThis.finishExport))
        .toBe("function");
    }
    async function finishExport() {
      await desktop.evaluate(() => {
        globalThis.finishExport({ canceled: true });
        globalThis.finishExport = null;
      });
      await page.evaluate(() => globalThis.pendingExport);
    }
    await holdExport();
    await page
      .getByRole("button", { name: "Restart and update", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Update after current work finishes" })
      .waitFor();
    assert.deepEqual(await desktop.evaluate(() => globalThis.installCalls), []);
    await screenshot("update-waiting.png");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await finishExport();
    await page
      .getByRole("button", { name: "Restart and update", exact: true })
      .waitFor();
    assert.deepEqual(await desktop.evaluate(() => globalThis.installCalls), []);
    await holdExport();
    await page
      .getByRole("button", { name: "Restart and update", exact: true })
      .click();
    await finishExport();
    await expect
      .poll(() => desktop.evaluate(() => globalThis.installCalls))
      .toEqual([[true, true]]);
    await assert.rejects(
      page.evaluate(() => window.aldus.preview("anything.md")),
      /Installing update/,
    );
    const saved = JSON.parse(
      await fs.readFile(path.join(sandbox, "settings.json"), "utf8"),
    );
    assert.equal(saved.author, "Preserved author");
    assert.equal(saved.language, "en");
    console.log(
      "PASS: real updater HTTP download, progress, SHA-512 rejection/retry, cached-file revalidation, bilingual UI, deferred/cancelled install, saved preferences and no browser navigation. Installer launch is intercepted.",
    );
  } finally {
    if (desktop) await desktop.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    assert.ok(
      path.resolve(sandbox).startsWith(path.resolve(os.tmpdir()) + path.sep),
    );
    await fs.rm(sandbox, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
