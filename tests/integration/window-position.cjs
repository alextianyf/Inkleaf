const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "aldus-position-"));
  const notes = path.join(sandbox, "notes");
  await fs.mkdir(notes);
  await fs.writeFile(path.join(notes, "alpha.md"), "# Alpha");
  await fs.writeFile(
    path.join(sandbox, "settings.json"),
    JSON.stringify({
      roots: [notes],
      autoSearch: false,
      language: "en",
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
  const bounds = () =>
    desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getBounds(),
    );
  async function cycle(page, count) {
    for (let i = 0; i < count; i++) {
      // These are the layout updates emitted as input and index results change.
      for (const state of [
        { hasQuery: true, rows: 0 },
        { hasQuery: true, rows: 1 },
        { hasQuery: true, rows: 6 },
        { hasQuery: false, rows: 0 },
      ])
        await page.evaluate(
          (state) => window.aldus.resize({ mode: "search", ...state }),
          state,
        );
    }
  }
  try {
    const page = await desktop.firstWindow();
    const input = page.getByRole("combobox");
    await input.waitFor();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.aldus.search("alpha"))).matches,
      )
      .toBe(1);
    const before = await bounds();
    await cycle(page, 20);
    const after = await bounds();
    console.log(
      JSON.stringify({ before, after, horizontalDrift: after.x - before.x }),
    );
    assert.equal(
      after.x,
      before.x,
      "repeated search layout updates must not move the bar horizontally",
    );
    assert.equal(
      after.y,
      before.y,
      "search result heights must not move the top edge",
    );
    // Top/bottom drags resize symmetrically without adopting native width jitter.
    await desktop.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      for (let index = 0; index < 10; index++) {
        for (const delta of [20, -20]) {
          const bounds = window.getBounds();
          window.emit(
            "will-resize",
            { preventDefault() {} },
            {
              ...bounds,
              width: bounds.width + 2,
              height: bounds.height + delta,
            },
            { edge: "bottom" },
          );
        }
      }
    });
    assert.deepEqual(
      await bounds(),
      before,
      "opposite vertical drags restore the original bounds without width drift",
    );
    assert.equal(
      (await page.evaluate(() => window.aldus.state())).searchWidth,
      null,
      "vertical drags must not save a new preferred width",
    );
    // Real input transitions, including empty results and clearing the query.
    for (let i = 0; i < 6; i++) {
      await input.fill("alpha");
      await expect(page.getByRole("option")).toHaveCount(1);
      await input.fill("no-matching-file");
      await expect(page.getByRole("option")).toHaveCount(0);
      await input.fill("");
      await expect(page.locator(".search-results")).toHaveCount(0);
    }
    assert.equal((await bounds()).x, before.x);
    // A genuine move and edge resize must become the new stable position.
    await desktop.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const next = { ...window.getBounds(), x: window.getBounds().x + 60 };
      window.emit("will-move", {}, next);
      window.setBounds(next);
      window.emit(
        "will-resize",
        { preventDefault() {} },
        { ...next, width: 630 },
        { edge: "right" },
      );
    });
    const moved = await bounds();
    assert.equal(
      moved.height,
      before.height,
      "horizontal drags do not accumulate native height rounding",
    );
    await cycle(page, 10);
    assert.equal(
      (await bounds()).x,
      moved.x,
      "manual positioning remains stable while searching",
    );
    const resizeBefore = await bounds();
    await desktop.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      const native = win.getBounds();
      win.emit(
        "will-resize",
        { preventDefault() {} },
        {
          ...native,
          y: native.y - 20,
          height: native.height + 20,
          width: native.width + 2,
        },
        { edge: "top" },
      );
    });
    const resized = await bounds();
    assert.equal(resized.width, resizeBefore.width);
    assert.ok(
      Math.abs(resized.height - resizeBefore.height - 40) <= 2,
      "fractional DPI may round the native border by a pixel",
    );
    assert.ok(
      Math.abs(
        resized.y +
          resized.height / 2 -
          resizeBefore.y -
          resizeBefore.height / 2,
      ) <= 1,
    );
    const preference = await page.evaluate(() => window.aldus.state());
    assert.equal(preference.searchHeight, 102);
    await cycle(page, 5);
    assert.deepEqual(
      await bounds(),
      resized,
      "result changes retain the manual height",
    );
    await desktop.close();
    desktop = await launch();
    const restartedPage = await desktop.firstWindow();
    await restartedPage.getByRole("combobox").waitFor();
    assert.equal(
      (await restartedPage.evaluate(() => window.aldus.state())).searchHeight,
      102,
    );
    assert.ok(Math.abs((await bounds()).height - resized.height) <= 2);
    console.log(
      "PASS: stable position across search, result counts, clearing, manual move and width changes.",
    );
  } finally {
    await desktop.close();
    const resolved = path.resolve(sandbox);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith("aldus-position-"));
    await fs.rm(resolved, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
