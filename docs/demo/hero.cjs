// The paper in this banner is a rasterized Inkleaf PDF, not a mock document.
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { _electron: electron, chromium } = require("@playwright/test");
const { banner, themes } = require("./banner.cjs");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const output = path.join(root, "docs/media");
  const scratch = path.join(root, "artifacts/readme-hero");
  await fs.mkdir(scratch, { recursive: true });
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "inkleaf-hero-"));
  const file = path.join(__dirname, "hero.md");
  const source = await fs.readFile(file, "utf8");
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      autoSearch: false,
      roots: [__dirname],
      language: "en",
      theme: "minimal",
      pageNumbers: false,
      authorEnabled: false,
      shortcut: "Control+Alt+F8",
    }),
  );
  const env = { ...process.env, ALDUS_TEST_DIR: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root], env });
  try {
    const page = await app.firstWindow();
    await page.getByRole("combobox").waitFor();
    const data = await page.evaluate(
      async (file) => Array.from((await window.aldus.preview(file)).data),
      file,
    );
    await fs.writeFile(
      path.join(output, "hero-document.pdf"),
      new Uint8Array(data),
    );
    assert.equal(await fs.readFile(file, "utf8"), source);
  } finally {
    await app.close();
    assert.equal(path.dirname(profile), path.resolve(os.tmpdir()));
    assert.ok(path.basename(profile).startsWith("inkleaf-hero-"));
    await fs.rm(profile, { recursive: true, force: true });
  }
  await promisify(execFile)(
    "pdftoppm",
    [
      "-scale-to-x",
      "1200",
      "-scale-to-y",
      "-1",
      "-singlefile",
      "-png",
      path.join(output, "hero-document.pdf"),
      path.join(scratch, "paper"),
    ],
    { windowsHide: true },
  );
  const paper = (await fs.readFile(path.join(scratch, "paper.png"))).toString(
    "base64",
  );
  const logo = (
    await fs.readFile(path.join(root, "resources/icons/inkleaf-128.png"))
  ).toString("base64");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    for (const language of ["en", "zh"]) {
      for (const theme of Object.keys(themes)) {
        const page = await browser.newPage({
          viewport: { width: 1500, height: 500 },
          deviceScaleFactor: 1,
        });
        await page.setContent(banner({ language, theme, logo, paper }));
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all(
            [...document.images].map((image) => image.decode()),
          );
        });
        const suffix = theme === "light" ? "" : `-${theme}`;
        await page.screenshot({
          path: path.join(output, `hero-${language}${suffix}.png`),
        });
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(
    "Generated bilingual light and dark banners with actual Inkleaf PDF pages.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
