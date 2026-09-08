const { Worker } = require("node:worker_threads");
const { EventEmitter } = require("node:events");
const path = require("node:path");

class SearchClient extends EventEmitter {
  pending = new Map();
  nextId = 0;
  constructor() {
    super();
    this.worker = new Worker(path.join(__dirname, "search-worker.cjs"));
    this.worker.on("message", ({ id, event, result, error }) => {
      if (event) {
        this.emit(event);
        return;
      }
      const request = this.pending.get(id);
      if (!request) return;
      this.pending.delete(id);
      error ? request.reject(new Error(error)) : request.resolve(result);
    });
    this.worker.on("error", (error) => this.fail(error));
    this.worker.on("exit", () => this.fail(new Error("Search worker stopped")));
  }
  fail(error) {
    this.failure = error;
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
  call(method, ...args) {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, method, args });
    });
  }
  search(query) {
    return this.call("search", query);
  }
  has(file) {
    return this.call("has", file);
  }
  folder(folder, recursive = true) {
    return this.call("folder", folder, recursive);
  }
  configure(options) {
    return this.call("configure", options);
  }
  refresh() {
    return this.call("refresh");
  }
  async close() {
    let timer;
    try {
      await Promise.race([
        this.call("close"),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Search shutdown timed out")),
            5000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      await this.worker.terminate();
    }
  }
}
module.exports = { SearchClient };
