const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { inspectPdf } = require("../quality/lib/inspect.cjs");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "inkleaf-cjk-ui-"));
  const source = path.join(root, "tests/fixtures/cjk-fonts.md");
  const original = await fs.readFile(source);
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      roots: [path.dirname(source)],
      autoSearch: false,
      languagePreference: "zh",
      shortcut: "Control+Alt+Shift+F9",
      theme: "modern",
      author: "张三",
      pageNumbers: false,
    }),
  );
  const env = { ...process.env, ALDUS_TEST_DIR: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const desktop = await electron.launch({
    ...(process.env.ALDUS_EXECUTABLE
      ? { executablePath: process.env.ALDUS_EXECUTABLE, args: [] }
      : { args: [root] }),
    env,
  });
  try {
    const page = await desktop.firstWindow();
    await page.getByRole("combobox").waitFor();
    await desktop.evaluate(({ app, session }) => {
      global.cjkChecks = [];
      global.externalRequests = [];
      session.defaultSession.webRequest.onBeforeRequest(
        { urls: ["http://*/*", "https://*/*"] },
        (details, callback) => {
          global.externalRequests.push(details.url);
          callback({ cancel: true });
        },
      );
      app.on("web-contents-created", (_, contents) => {
        const print = contents.printToPDF.bind(contents);
        contents.printToPDF = async (options) => {
          const debuggerApi = contents.debugger;
          debuggerApi.attach("1.3");
          await debuggerApi.sendCommand("DOM.enable");
          await debuggerApi.sendCommand("CSS.enable");
          const dom = await debuggerApi.sendCommand("DOM.getDocument");
          const fonts = {};
          for (const selector of [
            "#cjk-title",
            "#cjk-body",
            "#latin-body",
            "#cjk-code",
            ".hljs-comment",
            ".aldus-footer",
          ]) {
            const { nodeId } = await debuggerApi.sendCommand(
              "DOM.querySelector",
              { nodeId: dom.root.nodeId, selector },
            );
            fonts[selector] = (
              await debuggerApi.sendCommand("CSS.getPlatformFontsForNode", {
                nodeId,
              })
            ).fonts;
          }
          debuggerApi.detach();
          global.cjkChecks.push(fonts);
          return print(options);
        };
      });
    });
    const start = Date.now();
    const result = await page.evaluate(async (file) => {
      const preview = await window.aldus.preview(file);
      return { ...preview, data: Array.from(preview.data) };
    }, source);
    const elapsed = Date.now() - start;
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.layoutWarnings, []);
    const fonts = (await desktop.evaluate(() => global.cjkChecks))[0];
    for (const selector of [
      "#cjk-title",
      "#cjk-body",
      "#cjk-code",
      ".hljs-comment",
      ".aldus-footer",
    ]) {
      assert.ok(
        fonts[selector].some(
          (font) =>
            font.familyName.includes("Noto Sans SC") && font.isCustomFont,
        ),
        selector,
      );
      assert.ok(
        fonts[selector].every((font) => font.isCustomFont),
        `${selector}: no system-font fallback`,
      );
    }
    assert.ok(
      fonts["#latin-body"].every(
        (font) => font.familyName === "Inter" && font.isCustomFont,
      ),
    );
    assert.deepEqual(await desktop.evaluate(() => global.externalRequests), []);
    const bytes = Uint8Array.from(result.data);
    const pages = await inspectPdf(bytes);
    assert.ok(pages.every((page) => page.outside === 0));
    const text = pages
      .map((page) => page.text)
      .join("")
      .replace(/\s/g, "");
    for (const marker of ["波与光", "频率保持不变", "张三", "波动练习"])
      assert.ok(text.includes(marker), marker);
    const out = path.join(root, "artifacts/tests");
    await fs.mkdir(out, { recursive: true });
    await fs.writeFile(path.join(out, "bundled-cjk.pdf"), bytes);
    await fs.writeFile(
      path.join(out, "bundled-cjk-report.json"),
      JSON.stringify(
        {
          fonts,
          elapsedMs: elapsed,
          pdfBytes: bytes.length,
          pages: pages.length,
        },
        null,
        2,
      ),
    );
    assert.deepEqual(await fs.readFile(source), original);
    console.log(
      `PASS: actual embedded Chinese headings/body/code/signature, preserved Inter, offline render, extracted text and margins. ${elapsed} ms, ${bytes.length} PDF bytes.`,
    );
  } finally {
    await desktop.close();
    assert.equal(path.dirname(profile), path.resolve(os.tmpdir()));
    assert.ok(path.basename(profile).startsWith("inkleaf-cjk-ui-"));
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
