// Opt-in Windows test: two real NSIS installers, with an isolated app ID and data.
const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");

function run(file, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd,
      windowsHide: true,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)),
    );
  });
}

(async () => {
  assert.equal(process.platform, "win32");
  const root = path.resolve(__dirname, "../..");
  const sandbox = await fs.mkdtemp(
    path.join(os.tmpdir(), "aldus-installed-update-"),
  );
  const artifacts = path.join(root, "artifacts/installed-update");
  const preferences = path.join(sandbox, "preferences");
  const installDir = path.join(sandbox, "installed");
  const marker = path.join(sandbox, "updated.json");
  const settingsFile = path.join(preferences, "settings.json");
  const fixture = path.join(sandbox, "fixture");
  await fs.mkdir(fixture);
  await fs.mkdir(preferences);
  await fs.mkdir(artifacts, { recursive: true });
  await fs.writeFile(
    settingsFile,
    JSON.stringify({
      roots: [],
      autoSearch: false,
      language: "en",
      author: "Upgrade keeps my preferences",
      searchWidth: 493,
      shortcut: "Control+Alt+F4",
    }),
  );
  let targetFolder;
  const server = http.createServer(async (request, response) => {
    try {
      const name = path.basename(
        decodeURIComponent(new URL(request.url, "http://localhost").pathname),
      );
      const data = await fs.readFile(path.join(targetFolder, name));
      response.writeHead(200, { "Content-Length": data.length });
      response.end(data);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const feed = `http://127.0.0.1:${server.address().port}/`;
  const updateConfig = path.join(sandbox, "update.yml");
  await fs.writeFile(
    updateConfig,
    JSON.stringify({
      provider: "generic",
      url: feed,
      updaterCacheDirName: "cache",
    }),
  );
  await fs.writeFile(
    path.join(fixture, "bootstrap.cjs"),
    `
process.env.ALDUS_TEST_DIR = ${JSON.stringify(preferences)};
const { app } = require('electron');
if (app.getVersion() === '9.0.0' && process.env.ALDUS_UPGRADE_TEST_INTERACTIVE !== '1') {
  app.whenReady().then(() => app.quit());
} else {
  const { autoUpdater } = require('electron-updater');
  autoUpdater.updateConfigPath = ${JSON.stringify(updateConfig)};
  autoUpdater.disableDifferentialDownload = true;
  autoUpdater.installDirectory = ${JSON.stringify(installDir)};
  Object.defineProperty(autoUpdater.app, 'baseCachePath', { get: () => ${JSON.stringify(sandbox)} });
  app.on('browser-window-created', (_event, window) => {
    window.webContents.on('did-finish-load', () => {
      if (app.getVersion() !== '9.0.1' || !window.webContents.getURL().startsWith('aldus://app/')) return;
      setTimeout(() => {
        const fs = require('node:fs');
        const settings = JSON.parse(fs.readFileSync(${JSON.stringify(settingsFile)}, 'utf8'));
        fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ version: app.getVersion(), executable: app.getPath('exe'), settings }));
        app.quit();
      }, 500);
    });
  });
  require('../src/main/main.cjs');
}
`,
  );
  let desktop;
  try {
    for (const version of ["9.0.0", "9.0.1"]) {
      console.log(`Building isolated upgrade test ${version}`);
      const config = structuredClone(
        JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"))
          .build,
      );
      config.appId = "com.alextian.aldus.updatetest";
      config.productName =
        version === "9.0.0" ? "Aldus Update Test" : "Inkleaf Update Test";
      config.artifactName = `${version === "9.0.0" ? "Aldus" : "Inkleaf"}-Update-Test-${version}.exe`;
      config.win.artifactName = config.artifactName;
      config.directories.output = path.join(artifacts, version);
      config.extraMetadata = {
        name: version === "9.0.0" ? "aldus-update-test" : "inkleaf-update-test",
        version,
        main: "update-test/bootstrap.cjs",
      };
      config.files.push({
        from: fixture,
        to: "update-test",
        filter: ["bootstrap.cjs"],
      });
      config.nsis.createDesktopShortcut = false;
      config.nsis.createStartMenuShortcut = false;
      config.publish = [{ provider: "generic", url: feed }];
      const configFile = path.join(sandbox, `build-${version}.json`);
      await fs.writeFile(configFile, JSON.stringify(config));
      await run(
        process.execPath,
        [
          path.join(root, "node_modules/electron-builder/cli.js"),
          "--win",
          "nsis",
          "--publish",
          "never",
          "--config",
          configFile,
        ],
        root,
      );
    }
    targetFolder = path.join(artifacts, "9.0.1");
    console.log("Installing isolated 9.0.0 into the test directory");
    await run(
      path.join(artifacts, "9.0.0/Aldus-Update-Test-9.0.0.exe"),
      ["/S", `/D=${installDir}`],
      root,
    );
    await delay(2000);
    const env = { ...process.env, ALDUS_UPGRADE_TEST_INTERACTIVE: "1" };
    delete env.ELECTRON_RUN_AS_NODE;
    desktop = await electron.launch({
      executablePath: path.join(installDir, "Aldus Update Test.exe"),
      args: [],
      env,
    });
    const page = await desktop.firstWindow();
    await page.getByRole("combobox").waitFor();
    assert.equal(
      await desktop.evaluate(({ app }) => app.getVersion()),
      "9.0.0",
    );
    await page.evaluate(() => window.aldus.checkUpdates());
    await page
      .getByRole("button", { name: "Update available · Download", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Restart and update", exact: true })
      .waitFor({ timeout: 120000 });
    const closed = desktop.waitForEvent("close");
    await page
      .getByRole("button", { name: "Restart and update", exact: true })
      .click();
    await closed;
    desktop = null;
    await expect
      .poll(
        async () => {
          try {
            return JSON.parse(await fs.readFile(marker, "utf8")).version;
          } catch {
            return null;
          }
        },
        { timeout: 120000, intervals: [1000] },
      )
      .toBe("9.0.1");
    const report = JSON.parse(await fs.readFile(marker, "utf8"));
    assert.equal(
      path.dirname(report.executable).toLowerCase(),
      installDir.toLowerCase(),
    );
    assert.equal(path.basename(report.executable), "Inkleaf Update Test.exe");
    assert.equal(report.settings.author, "Upgrade keeps my preferences");
    assert.equal(report.settings.language, "en");
    assert.equal(report.settings.searchWidth, 493);
    await fs.writeFile(
      path.join(artifacts, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      "PASS: installed Aldus 9.0.0 downloads the Inkleaf NSIS update, upgrades in place to Inkleaf 9.0.1, restarts with the new executable name, and preserves preferences.",
    );
  } finally {
    if (desktop) await desktop.close();
    await delay(1500);
    for (const name of ["Inkleaf", "Aldus"]) {
      const uninstaller = path.join(
        installDir,
        `Uninstall ${name} Update Test.exe`,
      );
      try {
        await fs.access(uninstaller);
        await run(uninstaller, ["/S"], root);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    assert.ok(
      path.resolve(sandbox).startsWith(path.resolve(os.tmpdir()) + path.sep),
    );
    await fs.rm(sandbox, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 500,
    });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
