const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "aldus-links-"));
  const notes = path.join(sandbox, "LinkNotes");
  const artifacts = path.join(__dirname, "artifacts");
  await fs.mkdir(notes);
  await fs.mkdir(artifacts, { recursive: true });
  await fs.writeFile(
    path.join(notes, "toc-fixture.md"),
    `# Contents

- [Second section](#second-section)
- [中文章节](#中文章节)
- [Legacy anchor](#legacy-target)
- [Example website](https://example.com/)

<div style="break-before:page;height:120px"></div>

## Second section

This heading is below the top of the second page.

[Back to contents](#contents)

<div style="break-before:page"></div>

## 中文章节

中文目录也应该正确跳转。

<a name="legacy-target"></a>

Legacy HTML anchor.

[Return to contents](#contents)
`,
  );
  await fs.writeFile(
    path.join(sandbox, "settings.json"),
    JSON.stringify({
      roots: [notes],
      autoSearch: false,
      language: "en",
      shortcut: "Control+Alt+F8",
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
  try {
    const page = await desktop.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await desktop.evaluate(({ shell }) => {
      global.openedLinks = [];
      shell.openExternal = async (url) => {
        global.openedLinks.push(url);
      };
    });
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.aldus.search("toc-fixture"))).busy,
      )
      .toBe(false);
    await page.getByRole("combobox").fill("toc-fixture");
    await expect(page.getByRole("option").first()).toContainText(
      "toc-fixture.md",
    );
    await page.getByRole("combobox").press("Enter");
    await expect(
      page.getByRole("button", { name: "Export PDF", exact: true }),
    ).toBeEnabled({ timeout: 30000 });
    await expect(page.locator(".pdf-page")).toHaveCount(3);
    console.log(
      "PDF links:",
      await page
        .locator(".pdf-link")
        .evaluateAll((links) =>
          links.map((link) => ({
            label: link.getAttribute("aria-label"),
            kind: link.dataset.linkKind,
          })),
        ),
    );
    const second = page.getByRole("link", {
      name: "Second section",
      exact: true,
    });
    await expect(second).toHaveAttribute("data-link-kind", "internal");
    await second.click();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.activeElement.closest(".pdf-page")?.dataset.pageNumber,
        ),
      )
      .toBe("2");
    const position = await page.evaluate(() => {
      const scroller = document.querySelector(".preview-content");
      const page = document.querySelector(
        '[data-page-number="2"] .pdf-page-surface',
      );
      return {
        scroll: scroller.scrollTop,
        top:
          page.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top,
      };
    });
    assert.ok(position.scroll > 500);
    assert.ok(
      position.top < -40,
      "scrolls to the heading, not just the page top",
    );
    await page
      .getByRole("link", { name: "Back to contents", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.activeElement.closest(".pdf-page")?.dataset.pageNumber,
        ),
      )
      .toBe("1");
    const chinese = page.getByRole("link", { name: "中文章节", exact: true });
    await chinese.focus();
    await chinese.press("Enter");
    await expect
      .poll(() =>
        page.evaluate(
          () => document.activeElement.closest(".pdf-page")?.dataset.pageNumber,
        ),
      )
      .toBe("3");
    await page
      .getByRole("link", { name: "Return to contents", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Legacy anchor", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.activeElement.closest(".pdf-page")?.dataset.pageNumber,
        ),
      )
      .toBe("3");
    await page
      .getByRole("link", { name: "Return to contents", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Example website", exact: true })
      .click();
    assert.deepEqual(await desktop.evaluate(() => global.openedLinks), [
      "https://example.com/",
    ]);
    assert.equal(page.url(), "aldus://app/desktop.html");
    assert.equal(
      await page.evaluate(() =>
        window.aldus.openLink("file:///C:/Windows/win.ini").then(
          () => false,
          () => true,
        ),
      ),
      true,
    );
    await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(620, 740),
    );
    await second.click();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.activeElement.closest(".pdf-page")?.dataset.pageNumber,
        ),
      )
      .toBe("2");
    assert.equal(page.url(), "aldus://app/desktop.html");
    await page
      .getByRole("button", { name: "Back to search", exact: true })
      .click();
    await page.getByRole("combobox").fill("LinkNotes");
    await expect(page.getByRole("option").first()).toHaveAttribute(
      "data-kind",
      "folder",
    );
    await page.getByRole("combobox").press("Enter");
    await expect(page.locator(".batch-document .pdf-page")).toHaveCount(3);
    await expect(
      page.getByRole("link", { name: "Second section", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Second section", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.activeElement.closest(".pdf-page")?.dataset.pageNumber,
        ),
      )
      .toBe("2");
    await page
      .getByRole("link", { name: "Back to contents", exact: true })
      .click();
    const png = await desktop.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
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
    await fs.writeFile(
      path.join(artifacts, "toc-links.png"),
      Buffer.from(png, "base64"),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: PDF TOC links jump to heading coordinates, Chinese/named anchors, keyboard activation, resized pages, batch preview, external browser routing and unsafe URL rejection.",
    );
  } catch (error) {
    const page = await desktop.firstWindow();
    console.error(
      "Preview errors:",
      await page.locator(".error-message").allTextContents(),
    );
    throw error;
  } finally {
    await desktop.close();
    await fs.rm(sandbox, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
