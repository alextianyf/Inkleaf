const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Library } = require("../../src/search/library.cjs");

test("indexes nested Markdown, distinguishes duplicate names, and refreshes moved files", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "aldus-library-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const folder of ["notes", "work", "node_modules", ".git"])
    await fs.mkdir(path.join(root, folder));
  for (const file of [
    "notes/复习.MD",
    "work/复习.MD",
    "notes/meeting.markdown",
    "notes/ignore.pdf",
    "node_modules/hidden.md",
    ".git/hidden.md",
  ])
    await fs.writeFile(path.join(root, file), "# Test");
  const library = new Library();
  await library.scan([root, path.join(root, "notes")]);
  assert.equal(library.files.length, 3);
  assert.equal(library.search("复习").files.length, 2);
  assert.equal(library.search("MEET").files[0].name, "meeting.markdown");
  await fs.rename(
    path.join(root, "notes/meeting.markdown"),
    path.join(root, "notes/renamed.md"),
  );
  await library.scan([root]);
  assert.equal(library.search("meeting").matches, 0);
  assert.equal(library.search("renamed").matches, 1);
});

test("reports unavailable directories and latest scan wins", async () => {
  const library = new Library();
  const older = library.scan([
    path.join(os.tmpdir(), "aldus-nonexistent-directory"),
  ]);
  await library.scan([]);
  await older;
  assert.deepEqual(library.files, []);
  assert.deepEqual(library.warnings, []);
  assert.equal(library.busy, false);
  await library.scan([path.join(os.tmpdir(), "aldus-nonexistent-directory")]);
  assert.equal(library.warnings.length, 1);
});
