const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { runtimeOptions } = require("../../src/main/runtime.cjs");
const { migrateProfile } = require("../../src/main/profile-migration.cjs");
const { loadSettings } = require("../../src/main/settings.cjs");

test("source, installed and test runtimes choose independent identities before startup", () => {
  const appData = path.join(os.tmpdir(), "example-appdata");
  const dev = runtimeOptions({ packaged: false, appData, env: {} });
  const prod = runtimeOptions({ packaged: true, appData, env: {} });
  assert.equal(dev.userData, path.join(appData, "Inkleaf-Dev"));
  assert.equal(prod.userData, path.join(appData, "Inkleaf"));
  assert.notEqual(dev.appId, prod.appId);
  assert.notEqual(dev.defaultShortcut, prod.defaultShortcut);
  assert.equal(dev.defaultShortcut, "Control+Alt+Shift+Space");
  assert.equal(prod.defaultShortcut, "CommandOrControl+Shift+Space");
  assert.equal(dev.updatesAllowed, false);
  assert.equal(dev.legacyData, null);
  assert.equal(prod.legacyData, path.join(appData, "Aldus"));
  assert.equal(prod.appId, "com.alextian.aldus");
  assert.equal(
    runtimeOptions({
      packaged: true,
      appData,
      env: { INKLEAF_TEST_MODE: "development" },
    }).mode,
    "production",
  );
  const testing = runtimeOptions({
    packaged: false,
    appData,
    env: { ALDUS_TEST_DIR: appData },
  });
  assert.equal(testing.mode, "test");
  assert.equal(testing.userData, appData);
  assert.equal(testing.legacyData, null);
});

test("profile migration preserves settings, retains original files and never overwrites a new profile", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "inkleaf-migration-"));
  try {
    const old = path.join(folder, "Aldus"),
      next = path.join(folder, "Inkleaf");
    await fs.mkdir(old);
    const settings = JSON.stringify({
      author: "Alex",
      languagePreference: "zh",
      roots: [folder],
      searchWidth: 720,
    });
    await fs.writeFile(path.join(old, "settings.json"), settings);
    await fs.writeFile(path.join(old, "markdown-index.jsonl"), "old cache");
    assert.equal(await migrateProfile(old, next), true);
    assert.equal(
      await fs.readFile(path.join(old, "settings.json"), "utf8"),
      settings,
    );
    assert.equal(
      await fs.readFile(path.join(next, "settings.json"), "utf8"),
      settings,
    );
    assert.equal(
      (await loadSettings(path.join(next, "settings.json"), "en")).author,
      "Alex",
    );
    assert.equal(
      await fs.readFile(path.join(old, "markdown-index.jsonl"), "utf8"),
      "old cache",
    );
    assert.deepEqual(await fs.readdir(next), ["settings.json"]);
    await fs.writeFile(path.join(next, "settings.json"), '{"author":"New"}');
    assert.equal(await migrateProfile(old, next), false);
    assert.equal(
      (await loadSettings(path.join(next, "settings.json"), "en")).author,
      "New",
    );
    const concurrent = path.join(folder, "Concurrent");
    const results = await Promise.all([
      migrateProfile(old, concurrent),
      migrateProfile(old, concurrent),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(
      await fs.readFile(path.join(concurrent, "settings.json"), "utf8"),
      settings,
    );
    assert.deepEqual(await fs.readdir(concurrent), ["settings.json"]);
    await fs.writeFile(path.join(old, "settings.json"), "broken json");
    const failed = path.join(folder, "Failed");
    await assert.rejects(migrateProfile(old, failed));
    await assert.rejects(fs.access(path.join(failed, "settings.json")));
    assert.equal(
      await migrateProfile(path.join(folder, "Missing"), next),
      false,
    );
    const devSettings = await loadSettings(
      path.join(folder, "dev.json"),
      "en",
      { shortcut: "Control+Alt+Shift+Space" },
    );
    assert.equal(devSettings.shortcut, "Control+Alt+Shift+Space");
  } finally {
    assert.equal(path.dirname(folder), path.resolve(os.tmpdir()));
    assert.ok(path.basename(folder).startsWith("inkleaf-migration-"));
    await fs.rm(folder, { recursive: true, force: true });
  }
});
