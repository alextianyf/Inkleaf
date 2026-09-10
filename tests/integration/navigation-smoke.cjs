const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const profile = await fs.mkdtemp(
    path.join(os.tmpdir(), "inkleaf-navigation-"),
  );
  const notes = path.join(profile, "notes");
  await fs.mkdir(notes);
  await fs.writeFile(
    path.join(notes, "slow.md"),
    "# Slow document\n\nFirst preview.",
  );
  await fs.writeFile(
    path.join(notes, "next.md"),
    "# Next document\n\nSecond preview.",
  );
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      roots: [notes],
      autoSearch: false,
      language: "en",
      shortcut: "Control+Alt+F5",
    }),
  );
  const env = { ...process.env, ALDUS_TEST_DIR: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root], env });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    const input = page.getByRole("combobox");
    await input.waitFor();
    await app.evaluate(({ app }) => {
      global.holdFirstPrint = true;
      app.on("web-contents-created", (_event, contents) => {
        const print = contents.printToPDF.bind(contents);
        contents.printToPDF = async (...args) => {
          if (global.holdFirstPrint) {
            global.holdFirstPrint = false;
            global.printStarted = true;
            await new Promise((resolve) => {
              global.releasePrint = resolve;
            });
          }
          return print(...args);
        };
      });
    });
    await input.fill("slow");
    await expect(page.getByRole("option")).toHaveCount(1);
    await page.getByRole("option").click();
    await expect.poll(() => app.evaluate(() => global.printStarted)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("slow");
    // A new document can finish before the cancelled print is released.
    await input.fill("next");
    await expect(page.getByRole("option")).toHaveCount(1);
    await input.press("Enter");
    await expect(
      page.getByRole("button", { name: "Export PDF", exact: true }),
    ).toBeEnabled({ timeout: 30000 });
    await app.evaluate(() => global.releasePrint());
    await expect(page.locator(".preview-title")).toContainText("next.md");
    await expect(page.locator(".error-message")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(input).toHaveValue("next");
    console.log(
      "PASS: single-click starts loading, Escape cancels, Enter opens the next document",
    );

    // Clicking another row opens that row, not the keyboard's selected result.
    await input.fill(".md");
    await expect(page.getByRole("option")).toHaveCount(2);
    const second = page.getByRole("option").nth(1);
    const clickedName = await second.locator("strong").textContent();
    await expect(second).toHaveAttribute("aria-selected", "false");
    await second.click();
    await expect(page.locator(".preview-title")).toContainText(clickedName);
    await expect(
      page.getByRole("button", { name: "Export PDF", exact: true }),
    ).toBeEnabled({ timeout: 30000 });
    await page.keyboard.press("Escape");
    await expect(input).toHaveValue(".md");
    await input.fill("notes");
    // The result element itself owns data-kind.
    const folderRow = page.locator('[role="option"][data-kind="folder"]');
    await expect(folderRow).toHaveCount(1);
    await folderRow.click();
    await expect(
      page.getByRole("complementary", { name: "Markdown file list" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(input).toHaveValue("notes");
    console.log(
      "PASS: single-click opens the clicked file and folder batch preview",
    );

    const created = app.waitForEvent("window", {
      predicate: (win) => win !== page,
    });
    await page.evaluate(() => window.aldus.openSettings());
    const settings = await created;
    settings.setDefaultTimeout(15000);
    await settings.locator("#languagePreference").waitFor();
    const bounds = () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((win) => win.webContents.getURL().endsWith("?settings"))
          .getBounds(),
      );
    const original = await bounds();
    for (let round = 0; round < 12; round++) {
      for (const tab of [
        "Search",
        "Export",
        "About & updates",
        "Layout",
        "General",
      ]) {
        await settings.getByRole("button", { name: tab, exact: true }).click();
        await settings.evaluate(
          (layout) => window.aldus.settingsLayout(layout),
          tab === "Layout",
        );
        if (tab !== "Layout")
          assert.deepEqual(
            await bounds(),
            original,
            "category changes must not accumulate DPI drift",
          );
      }
    }
    console.log("PASS: 60 category switches without position drift");

    await settings.getByRole("button", { name: "Layout", exact: true }).click();
    await settings.locator("#author").fill("Draft copyright");
    await settings.getByRole("button", { name: "Search", exact: true }).click();
    await expect(settings.getByRole("dialog")).toBeVisible();
    await expect(
      settings.getByRole("button", { name: "Layout", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await settings
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await expect(settings.locator("#author")).toHaveValue("Draft copyright");
    await settings.getByRole("button", { name: "Search", exact: true }).click();
    await settings
      .getByRole("button", { name: "Discard and leave", exact: true })
      .click();
    await expect(
      settings.getByRole("button", { name: "Search", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    assert.equal((await page.evaluate(() => window.aldus.state())).author, "");

    await settings.getByRole("button", { name: "Layout", exact: true }).click();
    await expect(settings.locator("#author")).toHaveValue("");
    await settings.locator("#author").fill("Saved copyright");
    await settings.getByRole("button", { name: "Export", exact: true }).click();
    const blocked = path.join(profile, "settings.json.tmp");
    await fs.mkdir(blocked);
    await settings
      .getByRole("button", { name: "Save and leave", exact: true })
      .click();
    await expect(settings.getByRole("dialog").getByRole("alert")).toContainText(
      /EISDIR|EPERM|EACCES/,
    );
    await expect(
      settings.getByRole("button", { name: "Layout", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    assert.equal((await page.evaluate(() => window.aldus.state())).author, "");
    await fs.rmdir(blocked);
    await settings
      .getByRole("button", { name: "Save and leave", exact: true })
      .click();
    await expect(
      settings.getByRole("button", { name: "Export", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    assert.equal(
      (await page.evaluate(() => window.aldus.state())).author,
      "Saved copyright",
    );

    await settings
      .getByRole("button", { name: "General", exact: true })
      .click();
    await settings.locator("#languagePreference").selectOption("zh");
    await settings.getByRole("button", { name: "排版", exact: true }).click();
    await settings.locator("#author").fill("未保存署名");
    await settings.getByRole("button", { name: "通用", exact: true }).click();
    await expect(settings.getByRole("dialog")).toContainText("离开排版前");
    await settings
      .getByRole("button", { name: "继续编辑", exact: true })
      .click();
    await settings
      .getByRole("button", { name: "关闭设置", exact: true })
      .click();
    await expect(settings.getByRole("dialog")).toContainText(
      "排版更改尚未保存",
    );
    await settings
      .getByRole("button", { name: "放弃并关闭", exact: true })
      .click()
      .catch((error) => {
        if (!settings.isClosed()) throw error;
      });
    await expect.poll(() => settings.isClosed()).toBe(true);
    console.log(
      "PASS: Esc cancels loading and immediately opens another preview; late results stay discarded; 60 category switches retain position; bilingual save/discard/stay and failed-save navigation.",
    );
  } finally {
    await app.close();
    assert.equal(
      path.dirname(path.resolve(profile)),
      path.resolve(os.tmpdir()),
    );
    assert.ok(path.basename(profile).startsWith("inkleaf-navigation-"));
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
