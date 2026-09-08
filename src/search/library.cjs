const fs = require("node:fs/promises");
const { watch, createReadStream } = require("node:fs");
const { createInterface } = require("node:readline");
const path = require("node:path");
const { setImmediate: yieldNow } = require("node:timers/promises");
const { SearchIndex, keyOf, isMarkdown } = require("./index.cjs");

const SKIP = new Set([
  "node_modules",
  ".git",
  ".venv",
  "venv",
  "__pycache__",
  ".cache",
  ".npm",
  ".rustup",
  ".cargo",
  "$recycle.bin",
  "system volume information",
  "windows",
  "program files",
  "program files (x86)",
  "programdata",
  "appdata",
  "recovery",
  "perflogs",
]);
const UNIX_SKIP = [
  "/System",
  "/Library",
  "/private",
  "/dev",
  "/proc",
  "/sys",
  "/run",
  "/tmp",
  "/usr",
  "/bin",
  "/sbin",
  "/lib",
  "/lib64",
  "/snap",
];
const inside = (file, root) => {
  const relative = path.relative(root, file);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
};

class Library {
  index = new SearchIndex();
  roots = [];
  excluded = [];
  busy = false;
  warnings = [];
  generation = 0;
  watchers = [];
  pending = new Set();
  rescanning = false;
  closed = false;
  saving = Promise.resolve();
  savedRevision = -1;
  constructor({ cacheFile, onChange = () => {} } = {}) {
    this.cacheFile = cacheFile;
    this.onChange = onChange;
  }
  get files() {
    return [...this.index.records.values()];
  }
  has(file) {
    return this.index.records.has(keyOf(file));
  }
  async prune(predicate, generation = this.generation) {
    let count = 0;
    for (const record of this.index.records.values()) {
      if (this.closed || generation !== this.generation) return false;
      if (predicate(record.path)) this.index.delete(record.path);
      if (++count % 512 === 0) await yieldNow();
    }
    return true;
  }
  allowed(file) {
    if (this.excluded.some((root) => inside(file, root))) return false;
    return this.roots.some((root) => {
      if (!inside(file, root)) return false;
      if (
        path
          .relative(root, file)
          .split(path.sep)
          .some((part) => SKIP.has(part.toLowerCase()))
      )
        return false;
      return root !== "/" || !UNIX_SKIP.some((dir) => inside(file, dir));
    });
  }
  warn(key, file = "") {
    if (
      this.warnings.length < 20 &&
      !this.warnings.some((w) => w.key === key && w.path === file)
    )
      this.warnings.push({ key, path: file });
  }
  changed() {
    if (this.closed) return;
    if (!this.changeTimer)
      this.changeTimer = setTimeout(() => {
        this.changeTimer = undefined;
        if (!this.closed) this.onChange();
      }, 100);
    if (
      this.cacheFile &&
      this.savedRevision !== this.index.revision &&
      !this.saveTimer
    )
      this.saveTimer = setTimeout(() => {
        this.saveTimer = undefined;
        void this.save().catch(() => {
          this.warn("indexSaveFailed");
        });
      }, 3000);
  }
  search(query = "") {
    const started = performance.now();
    return {
      ...this.index.search(String(query).slice(0, 200)),
      total: this.index.records.size,
      busy: this.busy,
      warnings: this.warnings,
      revision: this.index.revision,
      durationMs: performance.now() - started,
    };
  }
  async load() {
    if (!this.cacheFile) return;
    try {
      const lines = createInterface({
        input: createReadStream(this.cacheFile, { encoding: "utf8" }),
        crlfDelay: Infinity,
      });
      let count = 0;
      for await (const line of lines) {
        if (this.closed) break;
        if (!count++) {
          if (line !== "aldus-index-v1") break;
          continue;
        }
        let file;
        try {
          file = JSON.parse(line);
        } catch {
          continue;
        }
        if (
          typeof file === "string" &&
          path.isAbsolute(file) &&
          isMarkdown(file) &&
          this.allowed(file)
        )
          this.index.upsert(file);
        if (count % 1000 === 0) {
          this.changed();
          await yieldNow();
        }
        if (this.index.records.size >= 500000) {
          this.warn("indexLimit");
          break;
        }
      }
      this.changed();
    } catch (error) {
      if (error.code !== "ENOENT") this.warn("indexCacheFailed");
    }
  }
  save() {
    if (!this.cacheFile) return Promise.resolve();
    this.saving = this.saving
      .catch(() => {})
      .then(async () => {
        const revision = this.index.revision;
        if (revision === this.savedRevision) return;
        await fs.mkdir(path.dirname(this.cacheFile), { recursive: true });
        const output = await fs.open(`${this.cacheFile}.tmp`, "w");
        try {
          await output.write("aldus-index-v1\n");
          let batch = [];
          for (const record of this.index.records.values()) {
            batch.push(JSON.stringify(record.path));
            if (batch.length === 1000) {
              await output.write(batch.join("\n") + "\n");
              batch = [];
              await yieldNow();
            }
          }
          if (batch.length) await output.write(batch.join("\n") + "\n");
        } finally {
          await output.close();
        }
        await fs.rename(`${this.cacheFile}.tmp`, this.cacheFile);
        this.savedRevision = revision;
      });
    return this.saving;
  }
  async scan(roots = this.roots, { partial = false } = {}) {
    const generation = ++this.generation;
    this.busy = true;
    if (!partial) {
      this.roots = [...new Set(roots.map((root) => path.resolve(root)))];
      this.warnings = this.warnings.filter((w) =>
        [
          "watchUnavailable",
          "scopeLimited",
          "indexSaveFailed",
          "indexCacheFailed",
        ].includes(w.key),
      );
      if (!(await this.prune((file) => !this.allowed(file), generation)))
        return;
    }
    this.busy = true;
    this.changed();
    const seen = new Set(),
      visited = new Set();
    let traversalLimited = false;
    const walk = async (folder) => {
      if (
        this.closed ||
        generation !== this.generation ||
        !this.allowed(folder)
      )
        return;
      const key = keyOf(folder);
      if (visited.has(key)) return;
      visited.add(key);
      if (visited.size > 1000000) {
        traversalLimited = true;
        this.warn("indexLimit");
        return;
      }
      try {
        const stat = await fs.lstat(folder);
        if (stat.isSymbolicLink() || !stat.isDirectory()) return;
        const directory = await fs.opendir(folder);
        let count = 0;
        const children = [];
        for await (const entry of directory) {
          if (this.closed || generation !== this.generation) return;
          if (entry.isSymbolicLink()) continue;
          const file = path.join(folder, entry.name);
          if (!this.allowed(file)) continue;
          if (entry.isDirectory()) children.push(file);
          else if (entry.isFile() && isMarkdown(entry.name)) {
            seen.add(keyOf(file));
            if (this.index.records.size < 500000 || this.has(file)) {
              if (this.index.upsert(file)) this.changed();
            } else this.warn("indexLimit");
          }
          if (++count % 128 === 0) await yieldNow();
        }
        return children;
      } catch (error) {
        if (
          generation === this.generation &&
          (error.code !== "ENOENT" || roots.includes(folder))
        )
          this.warn("unreadable", folder);
      }
    };
    // Breadth-first discovery prevents one large tree from delaying other drives.
    const queue = [...roots];
    for (let cursor = 0; cursor < queue.length; ) {
      if (this.closed || generation !== this.generation) return;
      const batch = queue.slice(cursor, cursor + 4);
      cursor += batch.length;
      const children = await Promise.all(batch.map(walk));
      for (const list of children)
        if (list) {
          for (const child of list) {
            if (queue.length >= 1000000) {
              traversalLimited = true;
              this.warn("indexLimit");
              break;
            }
            queue.push(child);
          }
        }
      await yieldNow();
    }
    if (this.closed || generation !== this.generation) return;
    if (
      !traversalLimited &&
      !(await this.prune(
        (file) =>
          roots.some((root) => inside(file, root)) && !seen.has(keyOf(file)),
        generation,
      ))
    )
      return;
    this.busy = false;
    this.changed();
    if (this.pending.size || this.rescanning) this.scheduleChanges();
  }
  async configure(roots, excluded = [], load = false) {
    const generation = ++this.generation;
    this.stopWatching();
    this.warnings = this.warnings.filter(
      (w) => w.key === "indexSaveFailed" || w.key === "indexCacheFailed",
    );
    this.roots = [...new Set(roots.map((root) => path.resolve(root)))];
    this.excluded = excluded.map((root) => path.resolve(root));
    this.busy = true;
    if (!(await this.prune((file) => !this.allowed(file), generation))) return;
    if (load) await this.load();
    if (this.closed || generation !== this.generation) return;
    this.startWatching();
    this.scanPromise = this.scan();
    void this.scanPromise.catch((error) => {
      this.busy = false;
      this.warn("indexFailed", error.message);
      this.changed();
    });
  }
  startWatching() {
    const roots = this.roots.filter(
      (root, i, all) => !all.some((other, j) => i !== j && inside(root, other)),
    );
    for (const root of roots) {
      try {
        const watcher = watch(
          root,
          { recursive: true, persistent: false },
          (event, name) => {
            if (!name) {
              this.rescanning = true;
              this.scheduleChanges();
              return;
            }
            const file = path.join(root, String(name));
            if (
              !this.allowed(file) ||
              (event === "change" && !isMarkdown(file))
            )
              return;
            if (this.pending.size < 2000) this.pending.add(file);
            else this.rescanning = true;
            this.scheduleChanges();
          },
        );
        watcher.on("error", () => {
          this.warn("watchUnavailable", root);
          this.changed();
        });
        this.watchers.push(watcher);
      } catch {
        this.warn("watchUnavailable", root);
      }
    }
    this.reconcileTimer = setInterval(
      () => {
        if (!this.busy) void this.scan();
      },
      10 * 60 * 1000,
    );
    this.reconcileTimer.unref();
  }
  scheduleChanges() {
    if (this.closed || this.watchTimer) return;
    this.watchTimer = setTimeout(async () => {
      this.watchTimer = undefined;
      if (this.busy) {
        this.scheduleChanges();
        return;
      }
      try {
        if (this.rescanning) {
          this.rescanning = false;
          this.pending.clear();
          await this.scan();
          return;
        }
        const pending = [...this.pending];
        this.pending.clear();
        for (const file of pending) {
          if (!this.allowed(file)) continue;
          try {
            const stat = await fs.lstat(file);
            if (this.closed || !this.allowed(file)) continue;
            if (stat.isSymbolicLink()) {
              await this.prune((candidate) => inside(candidate, file));
              continue;
            }
            if (stat.isDirectory()) await this.scan([file], { partial: true });
            else if (stat.isFile() && isMarkdown(file)) this.index.upsert(file);
          } catch (error) {
            if (error.code === "ENOENT")
              await this.prune((candidate) => inside(candidate, file));
          }
        }
        this.changed();
      } catch (error) {
        this.warn("indexFailed", error.message);
        this.changed();
      }
    }, 200);
  }
  stopWatching() {
    for (const watcher of this.watchers) watcher.close();
    this.watchers = [];
    clearInterval(this.reconcileTimer);
    clearTimeout(this.watchTimer);
    this.watchTimer = undefined;
    this.pending.clear();
    this.rescanning = false;
  }
  async close() {
    this.closed = true;
    this.generation++;
    this.stopWatching();
    clearTimeout(this.changeTimer);
    clearTimeout(this.saveTimer);
    await this.scanPromise;
    await this.save();
  }
}
module.exports = { Library, isMarkdown, inside };
