const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { BatchJob, writeUniquePdf } = require("../../src/conversion/batch.cjs");
const { SearchIndex } = require("../../src/search/index.cjs");
const { remoteImage } = require("../../src/conversion/images.cjs");

test("folder index counts descendants, lists direct children and removes empty ancestors", () => {
  const index = new SearchIndex();
  const folder = path.join(os.tmpdir(), "batch-notes");
  const first = path.join(folder, "intro.md"),
    second = path.join(folder, "中文", "intro.markdown");
  index.upsert(first);
  index.upsert(second);
  index.upsert(second);
  assert.equal(index.search("batch-notes").files[0].count, 2);
  assert.equal(index.listFolder(folder).length, 2);
  assert.equal(index.listFolder(folder, false).length, 1);
  index.delete(second);
  assert.equal(index.search("batch-notes").files[0].count, 1);
  assert.equal(index.search("中文").matches, 0);
  index.delete(first);
  assert.equal(index.search("batch-notes").matches, 0);
});

test("batch preserves subfolders and existing files, continues after failure, and supports cancellation", async (t) => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), "aldus-batch-"));
  t.after(() => fs.rm(output, { recursive: true, force: true }));
  await fs.writeFile(path.join(output, "intro.pdf"), "original");
  const events = [];
  const files = [
    "intro.md",
    "bad.md",
    path.join("nested", "intro.markdown"),
  ].map((relative) => ({ path: relative, relative }));
  const job = new BatchJob({
    files,
    output,
    onChange: (event) => events.push(structuredClone(event)),
    render: async (file) => {
      if (file === "bad.md") throw new Error("Unreadable source");
      return { data: Buffer.from("%PDF-test"), warnings: [] };
    },
  });
  const result = await job.run();
  assert.equal(result.completed, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.running, false);
  assert.equal(
    await fs.readFile(path.join(output, "intro.pdf"), "utf8"),
    "original",
  );
  assert.equal(
    await fs.readFile(path.join(output, "intro (1).pdf"), "utf8"),
    "%PDF-test",
  );
  assert.equal(
    await fs.readFile(path.join(output, "nested", "intro.pdf"), "utf8"),
    "%PDF-test",
  );
  assert.equal(events[0].entries[0].status, "converting");
  let cancelled;
  cancelled = new BatchJob({
    files,
    output,
    render: async () => {
      cancelled.cancel();
      return { data: Buffer.from("%PDF-cancel"), warnings: [] };
    },
  });
  const cancelledResult = await cancelled.run();
  assert.equal(cancelledResult.completed, 1);
  assert.equal(cancelledResult.entries[1].status, "cancelled");
  await assert.rejects(
    writeUniquePdf(output, "../escape.md", Buffer.from("bad")),
    /Invalid output/,
  );
});

test("remote image loading rejects loopback and non-HTTPS addresses", async () => {
  await assert.rejects(remoteImage("http://example.com/badge.svg"), /HTTPS/);
  await assert.rejects(remoteImage("https://127.0.0.1/badge.svg"), /Private/);
  await assert.rejects(
    remoteImage("https://[::ffff:127.0.0.1]/badge.svg"),
    /Private/,
  );
});
