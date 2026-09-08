const path = require("node:path");
const normalize = (text) => String(text).normalize("NFKC").toLowerCase();
const keyOf = (file) =>
  process.platform === "win32" ? file.toLowerCase() : file;
const isMarkdown = (file) => /\.(md|markdown)$/i.test(file);
const compareValues = (rankA, a, rankB, b) =>
  rankA - rankB ||
  a.name.length - b.name.length ||
  (a.lower < b.lower
    ? -1
    : a.lower > b.lower
      ? 1
      : a.path < b.path
        ? -1
        : a.path > b.path
          ? 1
          : 0);
const compare = (a, b) => compareValues(a.rank, a.record, b.rank, b.record);

class SearchIndex {
  records = new Map();
  folders = new Map();
  folderEntries = new Map();
  revision = 0;
  cache = new Map();
  upsert(file) {
    const key = keyOf(file);
    if (this.records.get(key)?.path === file) return false;
    if (this.records.has(key)) this.delete(file);
    const name = path.basename(file);
    const lower = normalize(name);
    const folder = path.dirname(file);
    const folderKey = keyOf(folder);
    let directory = this.folders.get(folderKey);
    if (!directory) {
      directory = {
        lower: normalize(folder).replaceAll("\\", "/"),
        count: 0,
        key: folderKey,
      };
      this.folders.set(folderKey, directory);
    }
    directory.count++;
    this.records.set(key, {
      path: file,
      name,
      folder,
      lower,
      stem: lower.replace(/\.(md|markdown)$/, ""),
      directory,
    });
    this.updateFolders(folder, 1);
    this.revision++;
    this.cache.clear();
    return true;
  }
  updateFolders(folder, delta) {
    while (true) {
      const key = keyOf(folder);
      let entry = this.folderEntries.get(key);
      if (!entry) {
        const name = path.basename(folder) || folder;
        entry = {
          kind: "folder",
          path: folder,
          folder: path.dirname(folder),
          name,
          lower: normalize(name),
          stem: normalize(name),
          count: 0,
          parentLower: normalize(path.dirname(folder)).replaceAll("\\", "/"),
        };
        this.folderEntries.set(key, entry);
      }
      entry.count += delta;
      if (!entry.count) this.folderEntries.delete(key);
      const parent = path.dirname(folder);
      if (parent === folder) break;
      folder = parent;
    }
  }
  listFolder(folder, recursive = true, limit = Infinity) {
    if (!this.folderEntries.has(keyOf(folder))) return [];
    const files = [];
    for (const record of this.records.values()) {
      const relative = path.relative(folder, record.path);
      if (
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      )
        continue;
      if (!recursive && path.dirname(relative) !== ".") continue;
      files.push({
        path: record.path,
        name: record.name,
        folder: record.folder,
        relative,
      });
      if (files.length >= limit) break;
    }
    return files.sort((a, b) => a.relative.localeCompare(b.relative));
  }
  delete(file) {
    const record = this.records.get(keyOf(file));
    if (!record) return false;
    this.records.delete(keyOf(file));
    this.updateFolders(record.folder, -1);
    if (--record.directory.count === 0)
      this.folders.delete(record.directory.key);
    this.revision++;
    this.cache.clear();
    return true;
  }
  search(query) {
    const text = normalize(query)
      .trim()
      .replaceAll("\\", "/")
      .replace(/\s+/g, " ");
    if (!text) return { files: [], matches: 0 };
    if (this.cache.has(text)) return this.cache.get(text);
    const terms = text.split(" ").sort((a, b) => b.length - a.length);
    for (const folder of this.folders.values())
      folder.matches = terms.map((term) => folder.lower.includes(term));
    const heap = [];
    let matches = 0;
    // Share the bounded result heap, while keeping the hot file loop monomorphic.
    const retain = (record, rank) => {
      if (
        heap.length === 80 &&
        compareValues(rank, record, heap[0].rank, heap[0].record) >= 0
      )
        return;
      const item = { record, rank };
      if (heap.length < 80) {
        heap.push(item);
        let i = heap.length - 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (compare(heap[p], heap[i]) >= 0) break;
          [heap[p], heap[i]] = [heap[i], heap[p]];
          i = p;
        }
      } else if (compare(item, heap[0]) < 0) {
        heap[0] = item;
        let i = 0;
        while (true) {
          let child = i * 2 + 1;
          if (child >= heap.length) break;
          if (
            child + 1 < heap.length &&
            compare(heap[child + 1], heap[child]) > 0
          )
            child++;
          if (compare(heap[i], heap[child]) >= 0) break;
          [heap[i], heap[child]] = [heap[child], heap[i]];
          i = child;
        }
      }
    };
    for (const record of this.folderEntries.values()) {
      let nameOnly = true,
        found = true;
      for (const term of terms) {
        if (record.lower.includes(term)) continue;
        nameOnly = false;
        if (
          !record.parentLower.includes(term) &&
          !(
            term.includes("/") &&
            `${record.parentLower}/${record.lower}`.includes(term)
          )
        ) {
          found = false;
          break;
        }
      }
      if (!found) continue;
      matches++;
      retain(
        record,
        record.lower === text
          ? 0
          : record.lower.startsWith(text)
            ? 1
            : nameOnly
              ? 2
              : 3,
      );
    }
    for (const record of this.records.values()) {
      let nameOnly = true,
        found = true;
      for (let i = 0; i < terms.length; i++) {
        const term = terms[i];
        if (!record.lower.includes(term)) {
          nameOnly = false;
          if (
            !record.directory.matches[i] &&
            !(
              term.includes("/") &&
              `${record.directory.lower}/${record.lower}`.includes(term)
            )
          ) {
            found = false;
            break;
          }
        }
      }
      if (!found) continue;
      matches++;
      const rank =
        record.stem === text || record.lower === text
          ? 0
          : record.stem.startsWith(text)
            ? 1
            : nameOnly
              ? 2
              : 3;
      retain(record, rank);
    }
    const result = {
      files: heap
        .sort(compare)
        .map(({ record: { path, name, folder, kind = "file", count } }) => ({
          path,
          name,
          folder,
          kind,
          ...(kind === "folder" ? { count } : {}),
        })),
      matches,
    };
    if (this.cache.size >= 32)
      this.cache.delete(this.cache.keys().next().value);
    this.cache.set(text, result);
    return result;
  }
}
module.exports = { SearchIndex, normalize, keyOf, isMarkdown };
