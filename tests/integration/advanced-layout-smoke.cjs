const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "inkleaf-advanced-"));
  const file = path.join(profile, "lesson.md");
  const source =
    "# Original lesson\n\n[Jump](#topic)\n\n" +
    Array.from(
      { length: 6 },
      (_, i) => "#".repeat(i + 1) + ` Level ${i + 1}\n\nHeading example.\n\n`,
    ).join("") +
    "| Row | Content |\n|---|---|\n" +
    Array.from(
      { length: 100 },
      (_, i) => `| ROW_${i + 1} | Table content |`,
    ).join("\n") +
    "\n\n```text\n" +
    Array.from({ length: 100 }, (_, i) => `CODE_${i + 1} keep this line`).join(
      "\n",
    ) +
    "\n```\n\n## Topic\n\nEND_OF_DOCUMENT\n";
  await fs.writeFile(file, source);
  const before = await fs.stat(file);
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      language: "en",
      autoSearch: false,
      roots: [profile],
      shortcut: "Control+Alt+F9",
    }),
  );
  const env = { ...process.env, ALDUS_TEST_DIR: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root], env });
  try {
    const main = await app.firstWindow();
    await main.getByRole("combobox").waitFor();
    await app.evaluate(
      ({ app }, directory) => app.setPath("downloads", directory),
      profile,
    );
    const created = app.waitForEvent("window");
    await main.evaluate(() => window.aldus.openSettings());
    const settings = await created;
    settings.setDefaultTimeout(15000);
    await settings.getByRole("button", { name: "Layout", exact: true }).click();
    await settings.locator("#copyrightLabel").fill("Physics course");
    await settings.locator("#author").fill("Alex Tian");
    await expect(settings.locator("#documentTitle")).toHaveCount(0);
    await settings.locator(".advanced-layout > summary").click();
    for (let level = 1; level <= 6; level++) {
      await settings.locator("#headingLevel").selectOption(`h${level}`);
      await settings.locator(`#h${level}Size`).fill("");
      await settings
        .locator(`#h${level}Size`)
        .pressSequentially(String(32 - level * 2));
      await settings.locator(`#h${level}Before`).fill("12");
      await settings.locator(`#h${level}After`).fill("8");
      await settings.locator(`#h${level}Color`).evaluate((el) => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        ).set.call(el, "#a12345");
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    await settings.locator("#keepTables").check();
    await settings.locator("#keepCodeBlocks").check();
    await settings.locator("#chapterBreak").selectOption("h2");
    await settings.locator("#headerEnabled").check();
    await settings.locator("#headerText").fill("Teaching · {title}");
    await settings.locator("#headerPosition").selectOption("left");
    await settings.locator("#footerEnabled").check();
    await settings.locator("#footerText").fill("Course notes · {file}");
    await settings.locator("#footerPosition").selectOption("center");
    await settings.locator("#pageNumberArea").selectOption("header");
    await settings.locator("#pageNumberPosition").selectOption("right");
    await settings.locator("#pageNumberFormat").selectOption("label");
    await settings.locator("#signaturePosition").selectOption("right");
    assert.equal(
      (await main.evaluate(() => window.aldus.state())).headerEnabled,
      false,
    );
    await settings
      .getByRole("button", { name: "Save layout", exact: true })
      .click();
    await expect(settings.locator(".layout-savebar [role=status]")).toHaveText(
      "Layout saved",
    );
    const config = await main.evaluate(() => window.aldus.state());
    assert.equal(config.h1Color, "#a12345");
    assert.equal(config.h6Size, 20);
    await expect(
      settings.locator(".layout-sample .preview-content"),
    ).toHaveAttribute("aria-busy", "false", { timeout: 60000 });
    await app.evaluate(({ app }) => {
      app.on("web-contents-created", (_, contents) => {
        const original = contents.printToPDF.bind(contents);
        contents.printToPDF = async (options) => {
          global.advancedStyles = await contents.executeJavaScript(
            `Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(el => ({text:el.textContent,size:getComputedStyle(el).fontSize,color:getComputedStyle(el).color,after:getComputedStyle(el).marginBottom}))`,
          );
          return original(options);
        };
      });
    });
    const result = await main.evaluate(
      (file) => window.aldus.preview(file),
      file,
    );
    const styles = await app.evaluate(() => global.advancedStyles);
    assert.equal(styles[0].text, "Original lesson");
    assert.equal(styles[0].size, "40px");
    assert.equal(styles[0].color, "rgb(161, 35, 69)");
    for (let level = 1; level <= 6; level++) {
      const style = styles.find((item) => item.text === `Level ${level}`);
      assert.ok(
        Math.abs(parseFloat(style.size) - ((32 - level * 2) * 4) / 3) < 0.01,
      );
      assert.equal(style.color, "rgb(161, 35, 69)");
    }
    const target = await main.evaluate(
      (id) => window.aldus.exportPdf(id),
      result.id,
    );
    const data = await fs.readFile(target);
    assert.deepEqual(data, Buffer.from(result.data));
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loading = pdfjs.getDocument({ data: new Uint8Array(data) });
    const pdf = await loading.promise;
    const pageTexts = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const text = (await page.getTextContent()).items
        .map((item) => item.str)
        .join(" ");
      pageTexts.push(text);
      assert.match(text, /Teaching · Original lesson/);
      assert.match(text, /Course notes · lesson.md/);
      assert.ok(
        text.includes(`Page ${number} of ${pdf.numPages}`),
        text.slice(-150),
      );
    }
    const allText = pageTexts.join("\n");
    for (let number = 1; number <= 100; number++) {
      assert.ok(
        allText.includes(`ROW_${number} `),
        `missing table row ${number}`,
      );
      assert.ok(
        allText.includes(`CODE_${number} `),
        `missing code line ${number}`,
      );
    }
    assert.match(allText, /Physics course · © Alex Tian/);
    assert.match(allText, /END_OF_DOCUMENT/);
    await fs.copyFile(
      target,
      path.join(root, "artifacts", "advanced-layout.pdf"),
    );
    await loading.destroy();
    const longHeader = "教学".repeat(98) + "结束";
    const longSample = await settings.evaluate(
      (options) => window.aldus.samplePreview(options),
      {
        ...config,
        margins: "compact",
        orientation: "portrait",
        headerText: longHeader,
      },
    );
    const longLoading = pdfjs.getDocument({
      data: new Uint8Array(longSample.data),
    });
    const longPdf = await longLoading.promise;
    const longItems = (await (await longPdf.getPage(1)).getTextContent()).items;
    assert.ok(
      longItems
        .map((item) => item.str)
        .join("")
        .includes(longHeader),
      "long Chinese headers must not lose text",
    );
    const headerBottom = Math.min(
      ...longItems
        .filter((item) => /教学|结束/.test(item.str))
        .map((item) => item.transform[5]),
    );
    // Folio can wrap this title at the configured size. Locate its first line,
    // but still require the complete title to survive in the PDF text.
    assert.match(
      longItems
        .map((item) => item.str)
        .join(" ")
        .replace(/\s+/g, " "),
      /A quieter way to publish/,
    );
    const heading = longItems.find(
      (item, index) =>
        item.str.trim() &&
        longItems
          .slice(index)
          .map((part) => part.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
          .startsWith("A quieter way to publish"),
    );
    assert.ok(heading, "sample heading must appear below the long header");
    assert.ok(
      headerBottom > heading.transform[5] + 12,
      "wrapped headers must stay above the body heading",
    );
    await longLoading.destroy();
    assert.equal(await fs.readFile(file, "utf8"), source);
    assert.equal((await fs.stat(file)).mtimeMs, before.mtimeMs);
    const stored = JSON.parse(
      await fs.readFile(path.join(profile, "settings.json"), "utf8"),
    );
    assert.equal(stored.headerText, config.headerText);
    assert.equal(stored.h6Size, 20);
    await settings
      .getByRole("button", { name: "General", exact: true })
      .click();
    await settings.locator("#languagePreference").selectOption("zh");
    await settings.getByRole("button", { name: "排版", exact: true }).click();
    await settings.locator(".advanced-layout > summary").click();
    await expect(settings.locator("#headerText")).toHaveValue(
      "Teaching · {title}",
    );
    await settings.locator("#headerEnabled").scrollIntoViewIfNeeded();
    const png = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().endsWith("?settings"),
      );
      await win.webContents.executeJavaScript(
        "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
      );
      return (
        await win.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        })
      )
        .toPNG()
        .toString("base64");
    });
    await fs.writeFile(
      path.join(root, "artifacts", "advanced-layout-settings.png"),
      Buffer.from(png, "base64"),
    );
    console.log(
      `PASS: six heading levels, draft/save, bilingual advanced UI, copyright-only customization, ${pageTexts.length} real PDF pages with headers/footers/page numbers, all 100 table rows and code lines, exact preview/export bytes, source untouched.`,
    );
  } finally {
    await app.close();
    assert.equal(path.dirname(profile), path.resolve(os.tmpdir()));
    assert.ok(path.basename(profile).startsWith("inkleaf-advanced-"));
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
