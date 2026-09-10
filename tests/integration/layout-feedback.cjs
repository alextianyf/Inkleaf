const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "inkleaf-feedback-"));
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      language: "en",
      autoSearch: false,
      shortcut: "Control+Alt+F8",
    }),
  );
  const env = { ...process.env, ALDUS_TEST_DIR: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root], env });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  async function pages(data) {
    const task = pdfjs.getDocument({ data: new Uint8Array(data) });
    const pdf = await task.promise;
    const result = [];
    for (let i = 1; i <= pdf.numPages; i++)
      result.push(
        (await (await pdf.getPage(i)).getTextContent()).items
          .map((item) => item.str)
          .join(" "),
      );
    await task.destroy();
    return result;
  }
  try {
    const main = await app.firstWindow();
    await main.getByRole("combobox").waitFor();
    await app.evaluate(({ app }) => {
      global.feedbackMetrics = [];
      app.on("web-contents-created", (_, contents) => {
        const print = contents.printToPDF.bind(contents);
        contents.printToPDF = async (options) => {
          const metrics = await contents.executeJavaScript(`(() => {
            const heading = document.querySelector('h3');
            const rect = heading?.getBoundingClientRect();
            return { colors: [...new Set([...document.querySelectorAll('pre code span')].map(s => getComputedStyle(s).color))],
              before: heading ? rect.top - heading.previousElementSibling.getBoundingClientRect().bottom : null,
              after: heading ? heading.nextElementSibling.getBoundingClientRect().top - rect.bottom : null };
          })()`);
          global.feedbackMetrics.push(metrics);
          return print(options);
        };
      });
    });
    async function sample(options = {}, scenario = null) {
      return main.evaluate(
        async ({ options, scenario }) => {
          const result = await window.aldus.samplePreview(options, scenario);
          return Array.from(result.data);
        },
        { options, scenario },
      );
    }
    const normal = await sample();
    assert.ok(
      (await app.evaluate(() => global.feedbackMetrics.at(-1))).colors.length >=
        4,
      "PDF source keeps at least four token colors after sanitization",
    );
    await fs.mkdir(path.join(root, "artifacts/tests"), { recursive: true });
    await fs.writeFile(
      path.join(root, "artifacts/tests/code-colors.pdf"),
      new Uint8Array(normal),
    );
    for (const gap of [0, 3, 18]) {
      await sample({ h3Before: gap, h3After: gap });
      const measured = await app.evaluate(() => global.feedbackMetrics.at(-1));
      assert.ok(
        Math.abs(measured.before - (gap * 96) / 72) < 1,
        JSON.stringify(measured),
      );
      assert.ok(
        Math.abs(measured.after - (gap * 96) / 72) < 1,
        JSON.stringify(measured),
      );
    }
    for (const name of [
      "keepHeadings",
      "keepTables",
      "keepCodeBlocks",
      "avoidWidows",
      "repeatTableHeaders",
      "chapterBreak",
    ]) {
      const off = await pages(await sample({}, { name, enabled: false }));
      const on = await pages(
        await sample(name === "chapterBreak" ? { chapterBreak: "h2" } : {}, {
          name,
          enabled: true,
        }),
      );
      console.log(
        name,
        JSON.stringify({
          off: off.map((s) => s.slice(0, 170)),
          on: on.map((s) => s.slice(0, 170)),
        }),
      );
      if (name === "repeatTableHeaders") {
        assert.ok(
          !off[1].includes("Description") && on[1].includes("Description"),
        );
      } else if (name === "chapterBreak") assert.ok(on.length > off.length);
      else {
        const marker = {
          keepHeadings: "Keep this heading",
          keepTables: "ROW_1",
          keepCodeBlocks: "function",
          avoidWidows: "Sample content",
        }[name];
        assert.ok(
          off[0].includes(marker),
          `${name} off leaves some content on page one`,
        );
        assert.ok(
          !on[0].includes(marker),
          `${name} on moves the block to page two`,
        );
      }
    }
    const opened = app.waitForEvent("window");
    await main.evaluate(() => window.aldus.openSettings());
    const settings = await opened;
    settings.setDefaultTimeout(20000);
    await settings.getByRole("button", { name: "Layout", exact: true }).click();
    await expect(settings.locator("#theme option")).toHaveCount(2);
    await settings.locator("#author").fill("Alex Tian");
    await settings.locator(".advanced-layout summary").click();
    await settings.locator("#headerEnabled").check();
    await settings.locator("#headerText").fill("COURSE HEADER");
    await settings.locator("#footerEnabled").check();
    await settings.locator("#footerText").fill("TEACHING FOOTER");
    async function highlighted(action) {
      await settings.evaluate(() =>
        document.querySelector(".pdf-change-highlight")?.remove(),
      );
      await action();
      await expect(settings.locator(".pdf-change-highlight")).toBeVisible();
      const position = await settings
        .locator(".pdf-change-highlight")
        .evaluate((el) => ({
          top: parseFloat(el.style.top),
          page: Number(el.closest(".pdf-page").dataset.pageNumber),
        }));
      return position;
    }
    const header = settings
      .locator(".settings-group")
      .filter({ has: settings.locator("#headerEnabled") });
    assert.ok(
      (
        await highlighted(() =>
          header.getByRole("button", { name: "View the change" }).click(),
        )
      ).top < 10,
    );
    const footer = settings
      .locator(".settings-group")
      .filter({ has: settings.locator("#footerEnabled") });
    assert.ok(
      (
        await highlighted(() =>
          footer.getByRole("button", { name: "View the change" }).click(),
        )
      ).top > 90,
    );
    assert.ok(
      (
        await highlighted(() =>
          settings.locator("#pageNumberArea").selectOption("header"),
        )
      ).top < 10,
    );
    assert.ok(
      (
        await highlighted(() =>
          settings.locator("#signaturePosition").selectOption("right"),
        )
      ).page >= 2,
    );
    await settings.locator("#headingLevel").selectOption("h6");
    await expect(
      settings.getByRole("button", { name: "View heading example" }),
    ).toHaveCount(0);
    for (const name of [
      "keepHeadings",
      "keepTables",
      "keepCodeBlocks",
      "avoidWidows",
      "repeatTableHeaders",
      "chapterBreak",
    ]) {
      const group = settings
        .locator(
          name === "chapterBreak" ? ".settings-group" : ".pagination-option",
        )
        .filter({ has: settings.locator(`#${name}`) });
      await group
        .getByRole("button", { name: "Compare page breaks", exact: true })
        .last()
        .click();
      await settings
        .getByRole("button", { name: "Rule off", exact: true })
        .click();
      await expect(
        settings.getByRole("button", { name: "Rule off", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(settings.locator(".preview-content")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      await settings
        .getByRole("button", { name: "Rule on", exact: true })
        .click();
      if (name === "chapterBreak") {
        await expect(settings.locator(".comparison-notice")).toContainText(
          "No forced break is selected",
        );
        await expect(
          settings.getByRole("button", { name: "Rule off", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        await expect(settings.locator("#chapterBreak")).toHaveValue("none");
        await settings.locator("#chapterBreak").selectOption("h1");
        await expect(settings.locator(".comparison-notice")).toHaveCount(0);
      }
      await expect(
        settings.getByRole("button", { name: "Rule on", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(settings.locator(".preview-content")).toHaveAttribute(
        "aria-busy",
        "false",
      );
    }
    await expect(settings.locator(".pdf-change-highlight")).toBeVisible();
    await settings.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await app.evaluate(
      async ({ BrowserWindow }, output) => {
        const window = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().includes("settings"),
        );
        const image = await window.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        });
        await process.mainModule
          .require("node:fs/promises")
          .writeFile(output, image.toPNG());
      },
      path.join(root, "artifacts/tests/layout-comparison.png"),
    );
    const state = await main.evaluate(() => window.aldus.state());
    assert.equal(
      state.headerEnabled,
      false,
      "Comparisons and drafts never save implicitly",
    );
    console.log(
      "Layout feedback passed: syntax colors, exact heading gaps, six real PDF comparisons, all focus targets, unsaved drafts.",
    );
  } finally {
    await app.close();
    assert.equal(path.dirname(profile), path.resolve(os.tmpdir()));
    assert.ok(path.basename(profile).startsWith("inkleaf-feedback-"));
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
