const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const {
  loadSettings,
  validatePreferences,
  createSettingsWriter,
} = require("../../src/main/settings.cjs");
const { BatchJob } = require("../../src/conversion/batch.cjs");

test("old preferences migrate without losing language, author or width; invalid values use safe defaults", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "aldus-preferences-"),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "settings.json");
  await fs.writeFile(
    file,
    JSON.stringify({
      language: "zh",
      author: "Existing author",
      searchWidth: 480,
      fontSize: 999,
      paperSize: "invalid",
    }),
  );
  const config = await loadSettings(file, "en-US");
  assert.equal(config.language, "zh");
  assert.equal(config.languagePreference, "zh");
  assert.equal(config.author, "Existing author");
  assert.equal(config.searchWidth, 480);
  assert.equal(config.fontSize, 10.5);
  assert.equal(config.paperSize, "A4");
  assert.equal(config.exportDestination, "downloads");
  const save = createSettingsWriter(file);
  await Promise.all([
    save({ ...config, author: "First" }),
    save({ ...config, author: "Latest", languagePreference: "system" }),
  ]);
  const latest = await loadSettings(file, "en-US");
  assert.equal(latest.author, "Latest");
  assert.equal(latest.language, "en");
  assert.throws(() => validatePreferences({ fontSize: "12; color:red" }));
  assert.throws(() => validatePreferences({ exportFolder: "../outside" }));
});

test("batch same-folder and flattened exports preserve existing files with duplicate names", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "aldus-destinations-"),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const nested = path.join(directory, "nested");
  const flat = path.join(directory, "flat");
  await fs.mkdir(nested);
  await fs.mkdir(flat);
  const files = ["note.md", path.join("nested", "note.markdown")].map(
    (relative) => ({ relative, path: path.join(directory, relative) }),
  );
  const render = async () => ({ data: Buffer.from("%PDF-test"), warnings: [] });
  await fs.writeFile(path.join(nested, "note.pdf"), "Keep this file");
  const siblings = await new BatchJob({
    files,
    output: directory,
    sourceDestination: true,
    render,
  }).run();
  assert.equal(siblings.failed, 0);
  assert.equal(siblings.entries[1].output, path.join(nested, "note (1).pdf"));
  assert.equal(
    await fs.readFile(path.join(nested, "note.pdf"), "utf8"),
    "Keep this file",
  );
  const flattened = await new BatchJob({
    files,
    output: flat,
    preserveFolders: false,
    render,
  }).run();
  assert.equal(flattened.failed, 0);
  assert.deepEqual((await fs.readdir(flat)).sort(), [
    "note (1).pdf",
    "note.pdf",
  ]);
});
