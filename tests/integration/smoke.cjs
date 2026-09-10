const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const { searchWidth } = require("../../src/main/window-layout.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "aldus-smoke-"));
  const notes = path.join(sandbox, "notes");
  const artifacts = path.join(__dirname, "../../artifacts/tests");
  await fs.mkdir(notes);
  await fs.mkdir(artifacts, { recursive: true });
  await fs.cp(
    path.join(root, "tests/fixtures/sample.md"),
    path.join(notes, "preview-test.md"),
  );
  await fs.cp(
    path.join(root, "tests/fixtures/images"),
    path.join(notes, "images"),
    {
      recursive: true,
    },
  );
  await fs.writeFile(
    path.join(notes, "中文笔记.MD"),
    "# 中文笔记\n\n先预览，再导出。",
  );
  await fs.writeFile(
    path.join(sandbox, "settings.json"),
    JSON.stringify({
      roots: [notes],
      autoSearch: false,
      askExportLocation: true,
      language: "zh",
      shortcut: "Control+Alt+F11",
    }),
  );
  const env = { ...process.env, ALDUS_TEST_DIR: sandbox };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    electron.launch({
      ...(process.env.ALDUS_EXECUTABLE
        ? { executablePath: process.env.ALDUS_EXECUTABLE, args: [] }
        : { args: [root] }),
      env,
    });
  let desktop = await launch();
  async function screenshot(name) {
    const png = await desktop.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(
        (window) => window.webContents.getURL() === "aldus://app/desktop.html",
      );
      const image = await window.webContents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      });
      return image.toPNG().toString("base64");
    });
    await fs.writeFile(path.join(artifacts, name), Buffer.from(png, "base64"));
  }
  async function openTraySettings() {
    await desktop.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const show = window.show;
      const focus = window.focus;
      // Exercise the real tray callback while keeping the test off the desktop.
      window.show = window.focus = () => {};
      try {
        global.aldusTestMenu.getMenuItemById("settings").click();
      } finally {
        window.show = show;
        window.focus = focus;
      }
    });
  }
  try {
    const page = await desktop.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const search = page.getByRole("combobox");
    await search.waitFor();
    await expect(page.locator(".brand")).toHaveText("Inkleaf");
    await expect(page).toHaveTitle("印页");
    assert.equal(await desktop.evaluate(({ app }) => app.getName()), "Inkleaf");
    await expect(page.locator(".brand-icon")).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.aldus.search("preview-test")))
            .matches,
      )
      .toBe(1);
    const latency = await page.evaluate(async () => {
      const input = document.querySelector('[role="combobox"]');
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set;
      const samples = [];
      for (let i = 0; i < 24; i++) {
        const query = i % 2 ? "preview-test" : "中文";
        const expected = i % 2 ? "preview-test.md" : "中文笔记.MD";
        const start = performance.now();
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            observer.disconnect();
            reject(new Error("Search render timed out"));
          }, 5000);
          const observer = new MutationObserver(() => {
            if (
              document.querySelector('[role="option"] strong')?.textContent ===
              expected
            ) {
              observer.disconnect();
              clearTimeout(timeout);
              requestAnimationFrame(() => resolve());
            }
          });
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
          });
          setter.call(input, query);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      return {
        scope:
          "two real files; repeated queries; input event to results render frame",
        samples: samples.length,
        medianMs: samples[12],
        p95Ms: samples[22],
        maxMs: samples.at(-1),
      };
    });
    await fs.writeFile(
      path.join(artifacts, "search-ui-latency.json"),
      JSON.stringify(latency, null, 2),
    );
    console.log("Search UI latency:", JSON.stringify(latency));
    await search.fill("");
    await desktop.evaluate(({ Menu }) => {
      const build = Menu.buildFromTemplate.bind(Menu);
      Menu.buildFromTemplate = (...args) => {
        const menu = build(...args);
        if (menu.getMenuItemById("settings")) global.aldusTestMenu = menu;
        return menu;
      };
    });
    await page.evaluate(() => window.aldus.language("zh"));
    await expect(page.getByRole("option")).toHaveCount(0);
    await expect(page.locator(".search-results")).toHaveCount(0);
    await screenshot("compact.png");
    const compactSize = await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getSize(),
    );
    assert.ok(
      compactSize[1] <= 70 && compactSize[0] <= 644,
      "empty search is a single compact bar",
    );
    await expect(page.locator(".titlebar button")).toHaveCount(2);
    assert.equal(
      await desktop.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isAlwaysOnTop(),
      ),
      true,
    );
    const layout = await page.evaluate(() => {
      const input = document
        .querySelector(".search-field")
        .getBoundingClientRect();
      const actions = document
        .querySelector(".window-actions")
        .getBoundingClientRect();
      return {
        inputRight: input.right,
        actionsLeft: actions.left,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.ok(
      layout.inputRight <= layout.actionsLeft && !layout.overflow,
      "single-row controls fit without overlap",
    );
    await expect(search).toHaveAttribute(
      "placeholder",
      "搜索 Markdown，转为 PDF",
    );
    const position = await desktop.evaluate(({ BrowserWindow, screen }) => {
      const bounds = BrowserWindow.getAllWindows()[0].getBounds();
      return { bounds, area: screen.getDisplayMatching(bounds).workArea };
    });
    assert.ok(
      Math.abs(
        position.bounds.y - position.area.y - position.area.height * 0.16,
      ) < 4,
      "search appears near the top",
    );
    assert.equal(
      (await page.evaluate(() => window.aldus.state())).searchWidth,
      null,
      "automatic layout must not become a manual preference",
    );
    const drag = await desktop.evaluate(({ BrowserWindow }, logicalWidth) => {
      const window = BrowserWindow.getAllWindows()[0];
      const before = window.getBounds();
      window.emit(
        "will-resize",
        { preventDefault() {} },
        { ...before, width: before.width + (640 - logicalWidth) / 2 },
        { edge: "right" },
      );
      const wider = window.getBounds();
      window.emit(
        "will-resize",
        { preventDefault() {} },
        { ...wider, x: wider.x + 85, width: wider.width - 85 },
        { edge: "left" },
      );
      return { wider, narrower: window.getBounds() };
    }, searchWidth(position.area));
    assert.ok(Math.abs(drag.wider.width - 640) <= 4);
    assert.ok(Math.abs(drag.narrower.width - 470) <= 4);
    assert.ok(
      Math.abs(
        drag.wider.x +
          drag.wider.width / 2 -
          drag.narrower.x -
          drag.narrower.width / 2,
      ) <= 4,
      "dragging the left edge keeps the center in place",
    );
    await expect
      .poll(
        async () =>
          JSON.parse(await fs.readFile(path.join(sandbox, "settings.json")))
            .searchWidth,
      )
      .toBe(470);
    await desktop.evaluate(({ BrowserWindow, dialog }) => {
      const window = BrowserWindow.getAllWindows()[0];
      global.aldusTestWindow = {
        hide: window.hide,
        isFocused: window.isFocused,
        openDialog: dialog.showOpenDialog,
        hides: 0,
      };
      window.hide = () => global.aldusTestWindow.hides++;
      window.isFocused = () => false;
      dialog.showOpenDialog = async () => {
        window.emit("blur");
        await new Promise((resolve) => setTimeout(resolve, 220));
        return { canceled: true };
      };
    });
    await page.evaluate(() => window.aldus.chooseFile());
    assert.equal(
      await desktop.evaluate(() => global.aldusTestWindow.hides),
      0,
      "native picker does not hide Aldus",
    );
    await desktop.evaluate(async ({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].emit("blur");
      await new Promise((resolve) => setTimeout(resolve, 220));
    });
    assert.equal(
      await desktop.evaluate(() => global.aldusTestWindow.hides),
      1,
      "clicking away hides Aldus",
    );
    await search.fill("retained query");
    await search.press("Escape");
    await expect
      .poll(() => desktop.evaluate(() => global.aldusTestWindow.hides))
      .toBe(2);
    await expect(search).toHaveValue("retained query");
    await desktop.evaluate(({ BrowserWindow, dialog }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.hide = global.aldusTestWindow.hide;
      window.isFocused = global.aldusTestWindow.isFocused;
      dialog.showOpenDialog = global.aldusTestWindow.openDialog;
    });
    await search.fill("   ");
    await expect(page.locator(".search-results")).toHaveCount(0);
    await search.fill("preview-test");
    await expect(page.getByRole("option")).toHaveCount(1);
    await page
      .getByRole("option")
      .filter({ hasText: "preview-test.md" })
      .waitFor();
    await screenshot("search.png");
    await search.press("ArrowDown");
    await search.press("ArrowUp");
    const previousQuery = await search.inputValue();
    await search.press("Enter");
    const exportButton = page.getByRole("button", {
      name: "导出 PDF",
      exact: true,
    });
    await exportButton.waitFor();
    await expect(exportButton).toBeEnabled({ timeout: 60000 });
    assert.ok(
      (await page.locator(".pdf-page canvas").count()) > 1,
      "PDF has multiple rendered pages",
    );
    const count = await page.locator(".pdf-page canvas").count();
    assert.equal(
      (await fs.readdir(notes)).some((file) => file.endsWith(".pdf")),
      false,
      "Enter must not save PDF",
    );
    await screenshot("preview.png");
    await page.locator(".pdf-page").nth(1).scrollIntoViewIfNeeded();
    await screenshot("math.png");
    const pdfPath = path.join(sandbox, "saved.pdf");
    await desktop.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => ({ canceled: true });
    });
    await exportButton.click();
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll("button")].some(
          (button) => button.textContent === "正在保存…",
        ),
    );
    assert.equal(
      (await fs.readdir(notes)).some((file) => file.endsWith(".pdf")),
      false,
    );
    await desktop.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: target,
      });
    }, pdfPath);
    await exportButton.click();
    await page.getByText(`已保存：${pdfPath}`, { exact: true }).waitFor();
    const bytes = await fs.readFile(pdfPath);
    assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
    await fs.copyFile(pdfPath, path.join(artifacts, "preview-export.pdf"));
    // Export again uses exactly the already-previewed bytes, even if the source changes.
    await fs.writeFile(
      path.join(notes, "preview-test.md"),
      "# Changed after preview",
    );
    await exportButton.click();
    await page.waitForTimeout(300);
    assert.deepEqual(await fs.readFile(pdfPath), bytes);
    await fs.copyFile(
      path.join(root, "tests/fixtures/sample.md"),
      path.join(notes, "preview-test.md"),
    );
    const settingsCreated = desktop.waitForEvent("window", {
      predicate: (candidate) => candidate !== page,
    });
    await page.getByRole("button", { name: "设置", exact: true }).click();
    const settings = await settingsCreated;
    await openTraySettings();
    await settings.getByRole("button", { name: "排版", exact: true }).click();
    await expect(
      settings.locator(".layout-sample .pdf-page canvas"),
    ).not.toHaveCount(0, { timeout: 60000 });
    await settings
      .getByLabel("版权所有者 · © 右侧", { exact: true })
      .fill("Aldus smoke test");
    await settings.getByLabel("主题", { exact: true }).selectOption("minimal");
    await settings
      .getByRole("button", { name: "保存排版", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          JSON.parse(await fs.readFile(path.join(sandbox, "settings.json")))
            .author,
      )
      .toBe("Aldus smoke test");
    await settings.getByRole("button", { name: "通用", exact: true }).click();
    await settings.getByLabel("语言", { exact: true }).selectOption("en");
    await expect(settings.getByLabel("Language", { exact: true })).toHaveValue(
      "en",
    );
    await settings.getByRole("button", { name: "Layout", exact: true }).click();
    await expect(
      settings.getByLabel("Copyright holder · after ©", { exact: true }),
    ).toHaveValue("Aldus smoke test");
    await settings
      .getByRole("button", { name: "General", exact: true })
      .click();
    await settings.getByLabel("Language", { exact: true }).selectOption("zh");
    await desktop.evaluate(({ app }) => {
      const { autoUpdater } = process.mainModule.require(
        app.getAppPath() + "/node_modules/electron-updater",
      );
      autoUpdater.checkForUpdates = async () => {
        autoUpdater.emit("update-available", { version: "99.0.0" });
      };
    });
    await settings
      .getByRole("button", { name: "关于与更新", exact: true })
      .click();
    await settings
      .getByRole("button", { name: "检查更新", exact: true })
      .click();
    await settings.getByRole("button", { name: "有新版本 · 下载" }).waitFor();
    await settings.getByRole("button", { name: "关闭设置" }).click();
    await expect(page.locator(".preview-title")).toContainText("简约", {
      timeout: 60000,
    });
    await expect(exportButton).toBeEnabled({ timeout: 60000 });
    await page.keyboard.press("Escape");
    await expect(search).toBeFocused();
    await expect(search).toHaveValue(previousQuery);
    await search.fill("中文");
    await page.getByRole("option").filter({ hasText: "中文笔记.MD" }).waitFor();
    await search.press("Enter");
    await expect(exportButton).toBeEnabled({ timeout: 60000 });
    await page.getByRole("button", { name: "返回搜索" }).click();
    await search.fill("");
    await expect(page.locator(".search-results")).toHaveCount(0);
    await expect
      .poll(() =>
        desktop.evaluate(
          ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize()[0],
        ),
      )
      .toBeGreaterThanOrEqual(470);
    assert.equal(
      (await page.evaluate(() => window.aldus.state())).searchWidth,
      470,
      "results, preview and settings preserve the preferred search width",
    );
    assert.ok(
      Math.abs(
        (await desktop.evaluate(
          ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize()[0],
        )) - 470,
      ) <= 4,
    );
    const shortcuts = await desktop.evaluate(({ globalShortcut }) =>
      globalShortcut.isRegistered("Control+Alt+F11"),
    );
    assert.equal(shortcuts, true);
    assert.deepEqual(errors, []);
    // Quit before the debounce fires: the last drag must still survive restart.
    const closed = desktop.waitForEvent("close");
    await desktop.evaluate(({ BrowserWindow, app }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.emit(
        "will-resize",
        { preventDefault() {} },
        { ...window.getBounds(), width: window.getBounds().width + 10 },
        { edge: "right" },
      );
      app.quit();
    });
    await closed;
    desktop = await launch();
    const restarted = await desktop.firstWindow();
    await restarted.getByRole("combobox").waitFor();
    assert.equal(
      (await restarted.evaluate(() => window.aldus.state())).searchWidth,
      490,
    );
    assert.ok(
      Math.abs(
        (await desktop.evaluate(
          ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize()[0],
        )) - 490,
      ) <= 4,
      "preferred width survives an application restart",
    );
    await restarted.evaluate(() => window.aldus.language("en"));
    await restarted.reload();
    await expect(restarted.locator(".brand")).toHaveText("Inkleaf");
    await expect(restarted).toHaveTitle("Inkleaf");
    await expect(restarted.getByRole("combobox")).toHaveAttribute(
      "placeholder",
      "Find Markdown for PDF",
    );
    await screenshot("compact-english.png");
    console.log(
      `PASS: responsive/top-positioned search; manual width survives preview/settings and restart; always on top; Esc/blur hide; native picker stays open; tray settings; Enter → ${count}-page preview → explicit export; offline math/images; Chinese filename; bilingual settings; shortcut registered. Artifacts: ${artifacts}`,
    );
  } finally {
    await desktop.close();
    assert.equal(
      path.dirname(path.resolve(sandbox)),
      path.resolve(os.tmpdir()),
    );
    assert.ok(path.basename(sandbox).startsWith("aldus-"));
    await fs.rm(sandbox, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
