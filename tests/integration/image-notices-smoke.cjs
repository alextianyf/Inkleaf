const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "inkleaf-notices-"));
  const project = path.join(profile, "lessons");
  await fs.mkdir(path.join(project, ".git"), { recursive: true });
  await fs.writeFile(
    path.join(profile, "outside.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
  );
  await fs.writeFile(
    path.join(project, "broken.png"),
    Buffer.from("89504e470d0a1a0a", "hex"),
  );
  const markdown =
    "# Image check\n\n![Company](../outside.svg)\n\n![Missing](missing.png)\n\n![Damaged](broken.png)\n";
  const source = path.join(project, "Warnings.md");
  await fs.writeFile(source, markdown);
  await fs.writeFile(
    path.join(project, "Clean.md"),
    "# Clean\n\nEverything is present.",
  );
  await fs.writeFile(
    path.join(project, "Repaired.md"),
    "# Repaired\n\nSolution:\n-xxxx\n-xxx\n",
  );
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      roots: [project],
      autoSearch: false,
      languagePreference: "en",
      appearance: "light",
      shortcut: "Control+Alt+F7",
      askExportLocation: true,
    }),
  );
  const env = { ...process.env, ALDUS_TEST_DIR: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    ...(process.env.ALDUS_EXECUTABLE
      ? { executablePath: process.env.ALDUS_EXECUTABLE, args: [] }
      : { args: [root] }),
    env,
  });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const input = page.getByRole("combobox");
    await input.waitFor();
    async function open(name) {
      await input.fill(name);
      await page.getByRole("option").first().click();
      await expect(page.locator(".pdf-page canvas").first()).toBeVisible();
      await expect(page.locator(".preview-progress")).toHaveCount(0);
    }
    async function capture(name) {
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const png = await app.evaluate(
        async ({ BrowserWindow }, url) =>
          (
            await BrowserWindow.getAllWindows()
              .find((win) => win.webContents.getURL() === url)
              .webContents.capturePage(undefined, {
                stayHidden: true,
                stayAwake: true,
              })
          )
            .toPNG()
            .toString("base64"),
        page.url(),
      );
      const folder = path.join(root, "artifacts/tests");
      await fs.mkdir(folder, { recursive: true });
      await fs.writeFile(path.join(folder, name), Buffer.from(png, "base64"));
    }
    await open("Warnings");
    const notice = page.locator(".preview-issue-notice");
    await expect(notice).toContainText("Found 3 issues");
    const before = await page.locator(".pdf-page").first().boundingBox();
    await page
      .getByRole("button", { name: "Dismiss issue notification" })
      .click();
    await expect(notice).toHaveCount(0);
    assert.equal(
      (await page.locator(".pdf-page").first().boundingBox()).y,
      before.y,
    );
    await expect(page.locator(".preview-warnings summary")).toBeVisible();
    await page.keyboard.press("Escape");
    await open("Warnings");
    await page
      .getByRole("button", { name: "View details", exact: true })
      .click();
    const details = page.locator(".preview-warnings");
    await expect(details).toHaveAttribute("open", "");
    await expect(details).toContainText("Image blocked outside the project");
    await expect(details).toContainText("../outside.svg");
    await expect(details).toContainText("Image not found");
    await expect(details).toContainText("could not be decoded");
    await capture("image-notices-en.png");
    await details.locator("summary").click();
    const target = path.join(profile, "Warnings.pdf");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, target);
    await page.getByRole("button", { name: "Export PDF", exact: true }).click();
    await expect(page.locator(".export-notice")).toBeVisible();
    await expect(notice).toBeVisible();
    const warningBox = await notice.boundingBox();
    const successBox = await page.locator(".export-notice").boundingBox();
    assert.ok(
      successBox.y >= warningBox.y + warningBox.height,
      "notices must not overlap",
    );
    const state = await page.evaluate(() =>
      window.aldus.settings({ languagePreference: "zh", appearance: "dark" }),
    );
    await app.evaluate(
      ({ BrowserWindow }, { state, url }) => {
        BrowserWindow.getAllWindows()
          .find((win) => win.webContents.getURL() === url)
          .webContents.send("aldus:preferences-changed", state);
      },
      { state, url: page.url() },
    );
    await expect(notice).toContainText("发现 3 项问题");
    await page.getByRole("button", { name: "查看详情", exact: true }).click();
    await expect(details).toContainText("图片在项目外，已阻止读取");
    await capture("image-notices-zh-dark.png");
    await page.keyboard.press("Escape");
    await open("Clean");
    await expect(notice).toHaveCount(0);
    await expect(details).toHaveCount(0);
    await page.keyboard.press("Escape");
    await open("Repaired");
    await expect(details).toBeVisible();
    await expect(notice).toHaveCount(0); // Successful repairs are informational.
    assert.equal(await fs.readFile(source, "utf8"), markdown);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: blocked/missing/undecodable images, reasons, details, dismissal, export stacking, English/light, Chinese/dark, clean previews and repaired-only notices.",
    );
  } finally {
    await app.close();
    assert.equal(path.dirname(profile), path.resolve(os.tmpdir()));
    assert.ok(path.basename(profile).startsWith("inkleaf-notices-"));
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
