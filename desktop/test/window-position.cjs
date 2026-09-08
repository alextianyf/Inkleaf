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
  const desktop = await electron.launch({
    ...(process.env.ALDUS_EXECUTABLE
      ? { executablePath: process.env.ALDUS_EXECUTABLE, args: [] }
      : { args: [root] }),
    env,
  });
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
    await cycle(page, 10);
    assert.equal(
      (await bounds()).x,
      moved.x,
      "manual positioning remains stable while searching",
    );
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
