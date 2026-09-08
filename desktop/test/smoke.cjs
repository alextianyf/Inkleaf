const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "aldus-smoke-"));
  const notes = path.join(sandbox, "notes");
  const artifacts = path.join(__dirname, "artifacts");
  await fs.mkdir(notes);
  await fs.mkdir(artifacts, { recursive: true });
  await fs.cp(
    path.join(root, "test/test.md"),
    path.join(notes, "preview-test.md"),
  );
  await fs.cp(path.join(root, "test/images"), path.join(notes, "images"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(notes, "中文笔记.MD"),
    "# 中文笔记\n\n先预览，再导出。",
  );
  await fs.writeFile(
    path.join(sandbox, "settings.json"),
    JSON.stringify({
      roots: [notes],
      autoSearch: false,
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
      compactSize[1] <= 70 && compactSize[0] <= 564,
      "empty search is a single compact bar",
    );
    await expect(page.locator(".titlebar button")).toHaveCount(3);
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
    const drag = await desktop.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const before = window.getBounds();
      window.emit(
        "will-resize",
        { preventDefault() {} },
        { ...before, width: 640 },
        { edge: "right" },
      );
      const wider = window.getBounds();
      window.emit(
        "will-resize",
        { preventDefault() {} },
        { ...wider, x: wider.x + wider.width - 470, width: 470 },
        { edge: "left" },
      );
      return { wider, narrower: window.getBounds() };
    });
    assert.ok(Math.abs(drag.wider.width - 640) <= 4);
    assert.ok(Math.abs(drag.narrower.width - 470) <= 4);
    assert.ok(
      Math.abs(
        drag.wider.x + drag.wider.width - drag.narrower.x - drag.narrower.width,
      ) <= 4,
      "dragging the left edge keeps the right edge in place",
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
      path.join(root, "test/test.md"),
      path.join(notes, "preview-test.md"),
    );
    await openTraySettings();
    await expect(page.locator(".settings-panel")).toBeVisible();
    await expect(page.locator(".pdf-page canvas")).toHaveCount(count);
    await expect(page.locator(".preview-title")).toBeVisible();
    const bounds = await page.evaluate(() => ({
      content: document.querySelector(".document-pane").getBoundingClientRect()
        .right,
      settings: document
        .querySelector(".settings-panel")
        .getBoundingClientRect().left,
    }));
    assert.ok(
      bounds.content <= bounds.settings + 1,
      `settings must not cover the document: ${JSON.stringify(bounds)}`,
    );
    await page.getByLabel("署名").fill("Aldus smoke test");
    await page.getByLabel("主题", { exact: true }).selectOption("minimal");
    await page.getByRole("button", { name: "应用设置" }).click();
    await page.getByText("设置已应用", { exact: true }).waitFor();
    await expect(page.locator(".preview-title")).toContainText("简约", {
      timeout: 60000,
    });
    await expect(exportButton).toBeEnabled({ timeout: 60000 });
    assert.equal(
      JSON.parse(await fs.readFile(path.join(sandbox, "settings.json"))).author,
      "Aldus smoke test",
    );
    await screenshot("settings.png");
    await page.getByLabel("语言", { exact: true }).selectOption("en");
    await expect(
      page.getByRole("button", { name: "Export PDF", exact: true }),
    ).toBeEnabled();
    await expect(page.getByLabel("Language", { exact: true })).toHaveValue(
      "en",
    );
    assert.equal(
      JSON.parse(await fs.readFile(path.join(sandbox, "settings.json")))
        .language,
      "en",
    );
    await screenshot("settings-english.png");
    await page.getByLabel("Author", { exact: true }).fill("Unsaved draft");
    await page.getByRole("button", { name: "Close settings" }).click();
    await expect(page.locator(".pdf-page canvas")).not.toHaveCount(0);
    await openTraySettings();
    await expect(page.getByLabel("Author", { exact: true })).toHaveValue(
      "Aldus smoke test",
    );
    await page.getByLabel("Language", { exact: true }).selectOption("zh");
    await desktop.evaluate(({ net }) => {
      const fetch = net.fetch.bind(net);
      net.fetch = async (...args) =>
        String(args[0]).startsWith("https://api.github.com/")
          ? {
              ok: true,
              status: 200,
              json: async () => ({ tag_name: "v99.0.0" }),
            }
          : fetch(...args);
    });
    await page.getByRole("button", { name: "检查更新", exact: true }).click();
    await page.getByRole("button", { name: "有新版本 · 下载" }).waitFor();
    await page.getByRole("button", { name: "关闭设置" }).click();
    await page.getByRole("button", { name: "返回搜索" }).click();
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
        { ...window.getBounds(), width: 490 },
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
    await fs.rm(sandbox, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
