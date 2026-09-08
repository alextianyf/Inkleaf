const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { SearchIndex } = require("../search-index.cjs");
const { Library } = require("../library.cjs");
const { SearchClient } = require("../search-client.cjs");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate) {
  const deadline = Date.now() + 10000;
  while (!(await predicate())) {
    if (Date.now() > deadline)
      throw new Error("Timed out waiting for index update");
    await delay(40);
  }
}

test("ranks filename matches before path matches; partial keywords, CJK and Unicode normalize", () => {
  const index = new SearchIndex();
  const root = path.join(os.tmpdir(), "ranking");
  for (const file of [
    "计划/其他.md",
    "项目计划-2026.md",
    "计划.md",
    "计划草稿.md",
    "Notes/ＭＥＥＴＩＮＧ.markdown",
  ])
    index.upsert(path.join(root, file));
  assert.equal(index.search("计划").files[0].name, "计划");
  assert.equal(index.search("计划").files[1].name, "计划.md");
  assert.equal(index.search("计划").files.at(-1).name, "其他.md");
  assert.equal(index.search("2026 项目").files[0].name, "项目计划-2026.md");
  assert.equal(
    index.search("notes meeting").files[0].name,
    "ＭＥＥＴＩＮＧ.markdown",
  );
  assert.equal(index.search("  ").matches, 0);
  assert.equal(index.search("计划 2030").matches, 0);
  index.delete(path.join(root, "计划.md"));
  assert.equal(
    index.search("计划").files[0].name,
    "计划",
    "cached results invalidate on deletion",
  );
  for (let i = 0; i < 1000; i++) index.upsert(path.join(root, `计划-${i}.md`));
  assert.equal(index.search("计划").files.length, 80);
  assert.equal(index.search("计划").matches, 1004);
});

test("cache loads without walking disk, exclusion removes cached results, corrupted cache recovers", async (t) => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "aldus-cache-"));
  const notes = path.join(sandbox, "notes"),
    excluded = path.join(notes, "private");
  await fs.mkdir(excluded, { recursive: true });
  await fs.writeFile(path.join(notes, "visible.md"), "# visible");
  await fs.writeFile(path.join(excluded, "secret.md"), "# private");
  const cacheFile = path.join(sandbox, "index.jsonl");
  const first = new Library({ cacheFile });
  t.after(async () => {
    await first.close();
    await fs.rm(sandbox, { recursive: true, force: true });
  });
  await first.scan([notes]);
  await first.save();
  const second = new Library({ cacheFile });
  second.roots = [notes];
  second.excluded = [excluded];
  await second.load();
  assert.equal(second.search("visible").matches, 1);
  assert.equal(second.search("secret").matches, 0);
  assert.equal(second.busy, false);
  await second.close();
  await fs.writeFile(cacheFile, "broken index\n");
  const third = new Library({ cacheFile });
  await third.configure([notes], [], true);
  await third.scanPromise;
  assert.equal(third.search("visible").matches, 1);
  await third.close();
});

test("worker watches file and directory creation, rename, deletion, and persists metadata", async (t) => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "aldus-worker-"));
  const notes = path.join(sandbox, "notes"),
    cacheFile = path.join(sandbox, "index.jsonl");
  await fs.mkdir(notes);
  const client = new SearchClient();
  t.after(async () => {
    if (!client.failure) await client.close();
    await fs.rm(sandbox, { recursive: true, force: true });
  });
  await client.configure({
    roots: [notes],
    autoSearch: false,
    priorityRoots: [],
    excludedRoots: [],
    cacheFile,
  });
  await until(async () => !(await client.search("new")).busy);
  await fs.writeFile(path.join(notes, "new.md"), "# new");
  await until(async () => (await client.search("new")).matches === 1);
  await fs.rename(path.join(notes, "new.md"), path.join(notes, "renamed.MD"));
  await until(
    async () =>
      (await client.search("renamed")).matches === 1 &&
      (await client.search("new")).matches === 0,
  );
  await fs.mkdir(path.join(notes, "nested"));
  await fs.writeFile(path.join(notes, "nested", "nested-note.md"), "# nested");
  await fs.writeFile(path.join(notes, "nested", "ignored.pdf"), "not markdown");
  await until(async () => (await client.search("nested-note")).matches === 1);
  await fs.rename(path.join(notes, "nested"), path.join(notes, "moved"));
  await until(
    async () =>
      (await client.search("moved nested-note")).matches === 1 &&
      (await client.search("nested/nested-note")).matches === 0,
  );
  await fs.unlink(path.join(notes, "renamed.MD"));
  await until(async () => (await client.search("renamed")).matches === 0);
  assert.equal((await client.search("ignored")).matches, 0);
  await client.close();
  const cached = new Library({ cacheFile });
  cached.roots = [notes];
  await cached.load();
  assert.equal(cached.search("moved nested-note").matches, 1);
  await cached.close();
});
