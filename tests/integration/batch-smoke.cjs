const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "aldus-batch-ui-"));
  const folder = path.join(sandbox, "BatchNotes");
  const output = path.join(sandbox, "output");
  const artifacts = path.join(__dirname, "../../artifacts/tests");
  await fs.mkdir(path.join(folder, "nested"), { recursive: true });
  await fs.mkdir(output);
  await fs.mkdir(artifacts, { recursive: true });
  const badge =
    '<svg xmlns="http://www.w3.org/2000/svg" width="110" height="20"><rect width="55" height="20" fill="#555"/><rect x="55" width="55" height="20" fill="#4c8c60"/><g fill="white" font-family="Verdana,sans-serif" font-size="11" text-anchor="middle"><text x="27" y="14">build</text><text x="82" y="14">passing</text></g></svg>';
  await fs.writeFile(path.join(folder, "badge.svg"), badge);
  const remote = process.env.ALDUS_TEST_REMOTE
    ? ' <img alt="Aldus" src="https://img.shields.io/badge/Aldus-PDF-66788a?logo=markdown">'
    : "";
  await fs.writeFile(
    path.join(folder, "01-badges.md"),
    `# Badge preview\n\n<p align="center"><a href="https://example.com"><img alt="build" src="badge.svg"></a> <img alt="build" src="badge.svg">${remote}</p>\n\nBadges follow the paragraph alignment in the exported PDF.\n\n## Notes\n\nSelect a document on the left to preview it.\n`,
  );
  await fs.writeFile(
    path.join(folder, "nested", "02-中文.md"),
    "# 中文笔记\n\n批量转换，保留目录结构。",
  );
  await fs.writeFile(
    path.join(folder, "Z-too-large.md"),
    "x".repeat(10 * 1024 * 1024 + 1),
  );
  await fs.writeFile(path.join(output, "01-badges.pdf"), "keep original");
  await fs.writeFile(
    path.join(sandbox, "settings.json"),
    JSON.stringify({
      roots: [folder],
      autoSearch: false,
      askExportLocation: true,
      language: "zh",
      shortcut: "Control+Alt+F10",
    }),
  );
  const env = { ...process.env, ALDUS_TEST_DIR: sandbox };
  delete env.ELECTRON_RUN_AS_NODE;
  const desktop = await electron.launch({
    ...(process.env.ALDUS_EXECUTABLE
      ? { executablePath: process.env.ALDUS_EXECUTABLE, args: [] }
      : { args: [root] }),
    env,
  });
  async function screenshot(name) {
    const page = await desktop.firstWindow();
    if (await page.locator(".batch-document canvas").count())
      await expect(page.locator(".batch-document-title > span")).toBeVisible({
        timeout: 30000,
      });
    const png = await desktop.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(
        (win) => win.webContents.getURL() === "aldus://app/desktop.html",
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
    });
    await fs.writeFile(path.join(artifacts, name), Buffer.from(png, "base64"));
  }
  try {
    const page = await desktop.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await desktop.evaluate(({ app }) => {
      global.badgeChecks = [];
      app.on("web-contents-created", (_event, contents) => {
        contents.on("did-finish-load", () => {
          if (contents.getURL().startsWith("aldus://document/")) {
            void contents
              .executeJavaScript(
                `Promise.all(Array.from(document.images, async img => { await img.decode(); const box = img.getBoundingClientRect(); const paragraph = img.closest('p'); const parent = paragraph.getBoundingClientRect(); return { width: img.naturalWidth, height: img.naturalHeight, display: getComputedStyle(img).display, top: box.top, left: box.left, right: box.right, alignment: getComputedStyle(paragraph).textAlign, paragraphCenter: parent.left + parent.width / 2 }; }))`,
              )
              .then((images) => global.badgeChecks.push(images));
          }
        });
      });
    });
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.aldus.search("BatchNotes"))).busy,
      )
      .toBe(false);
    await page.getByRole("combobox").fill("BatchNotes");
    await expect(page.getByRole("option").first()).toHaveAttribute(
      "data-kind",
      "folder",
    );
    await expect(page.getByRole("option").first()).toContainText("3 Markdown");
    await screenshot("folder-search.png");
    await page.getByRole("combobox").press("Enter");
    await expect(page.locator(".batch-document canvas").first()).toBeVisible({
      timeout: 30000,
    });
    await expect(
      page.getByRole("button", { name: "导出 3 PDF", exact: true }),
    ).toBeEnabled();
    assert.equal(
      (await fs.readdir(folder)).some((name) => name.endsWith(".pdf")),
      false,
    );
    const images = await desktop.evaluate(() => global.badgeChecks.flat());
    assert.equal(images.length, process.env.ALDUS_TEST_REMOTE ? 3 : 2);
    for (const image of images) {
      assert.equal(image.height, 20);
      assert.equal(image.display, "inline-block");
      assert.ok(image.width > 20);
      assert.match(image.alignment, /center$/);
    }
    assert.equal(images[0].top, images[1].top);
    assert.ok(
      Math.abs(
        (images[0].left + images.at(-1).right) / 2 - images[0].paragraphCenter,
      ) <= 2,
      "badge group follows the paragraph center",
    );
    await screenshot("batch-badges.png");
    await page
      .getByRole("checkbox", { name: "包含子文件夹", exact: true })
      .uncheck();
    await expect(
      page.getByRole("button", { name: "导出 2 PDF", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("checkbox", { name: "包含子文件夹", exact: true })
      .check();
    await expect(
      page.getByRole("button", { name: "导出 3 PDF", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("checkbox", { name: "选择 Z-too-large.md", exact: true })
      .uncheck();
    await expect(
      page.getByRole("button", { name: "导出 2 PDF", exact: true }),
    ).toBeEnabled();
    await desktop.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    });
    await page.getByRole("button", { name: "导出 2 PDF", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "导出 2 PDF", exact: true }),
    ).toBeEnabled();
    assert.deepEqual(await fs.readdir(output), ["01-badges.pdf"]);
    await page
      .getByRole("checkbox", { name: "选择 Z-too-large.md", exact: true })
      .check();
    await desktop.evaluate(({ dialog }, output) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [output],
      });
    }, output);
    await page.getByRole("button", { name: "导出 3 PDF", exact: true }).click();
    await expect(page.locator(".batch-summary")).toContainText(
      "2 / 3 已导出 · 1 失败",
      { timeout: 30000 },
    );
    await expect(
      page.getByRole("button", { name: "打开输出文件夹", exact: true }),
    ).toBeVisible();
    assert.equal(
      await fs.readFile(path.join(output, "01-badges.pdf"), "utf8"),
      "keep original",
    );
    const exported = await fs.readFile(path.join(output, "01-badges (1).pdf"));
    assert.equal(exported.subarray(0, 5).toString(), "%PDF-");
    assert.equal(
      (await fs.readFile(path.join(output, "nested", "02-中文.pdf")))
        .subarray(0, 5)
        .toString(),
      "%PDF-",
    );
    await fs.writeFile(path.join(artifacts, "badges-export.pdf"), exported);
    await screenshot("batch-completed.png");
    await fs.writeFile(
      path.join(folder, "Z-too-large.md"),
      "# Fixed\n\nReady to export.",
    );
    await page.getByRole("button", { name: "重试失败项", exact: true }).click();
    await expect(page.locator(".batch-summary")).toContainText("1 / 1 已导出", {
      timeout: 30000,
    });
    assert.equal(
      (await fs.readdir(output)).filter((name) => name.startsWith("01-badges"))
        .length,
      2,
      "retry does not re-export successful files",
    );
    await page.getByRole("button", { name: "返回搜索", exact: true }).click();
    await page.getByRole("combobox").press("Enter");
    await expect(
      page.getByRole("button", { name: "导出 3 PDF", exact: true }),
    ).toBeEnabled();
    // Changing language through the same API used by Settings updates the new UI on reopen.
    await page.getByRole("button", { name: "返回搜索", exact: true }).click();
    await page.evaluate(() => window.aldus.language("en"));
    await page.reload();
    await page.getByRole("combobox").fill("BatchNotes");
    await expect(page.getByRole("option").first()).toHaveAttribute(
      "data-kind",
      "folder",
    );
    await page.getByRole("combobox").press("Enter");
    await expect(
      page.getByRole("button", { name: "Export 3 PDF", exact: true }),
    ).toBeEnabled();
    await screenshot("batch-english.png");
    assert.deepEqual(errors, []);
    console.log(
      "PASS: folder search, lazy SVG badge preview, inline dimensions, selection/subfolders, cancelled picker, batch PDFs, collision preservation, failure/retry, bilingual UI.",
    );
  } finally {
    await desktop.close();
    await fs.rm(sandbox, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
