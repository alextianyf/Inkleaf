const { parentPort } = require("node:worker_threads");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const path = require("node:path");
const fs = require("node:fs/promises");
const { Library } = require("./library.cjs");
const run = promisify(execFile);
const library = new Library({
  onChange: () => parentPort.postMessage({ event: "changed" }),
});
library.busy = true;
let configuration = 0;
let initialized = false;
let options;

async function disks() {
  if (process.platform !== "win32") return ["/"];
  const { stdout } = await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType = 3' | Select-Object -ExpandProperty DeviceID",
    ],
    { windowsHide: true, timeout: 10000, maxBuffer: 65536 },
  );
  const drives = stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => /^[A-Z]:$/i.test(s))
    .map((s) => s + "\\");
  if (!drives.length) throw new Error("No fixed disks found");
  return drives;
}
async function configure(next) {
  options = next;
  const token = ++configuration;
  library.cacheFile = next.cacheFile;
  const priority = next.autoSearch ? next.priorityRoots : [];
  let remembered = [];
  if (next.autoSearch) {
    try {
      const saved = JSON.parse(
        await fs.readFile(`${next.cacheFile}.volumes`, "utf8"),
      );
      if (Array.isArray(saved))
        remembered = saved.filter(
          (root) =>
            typeof root === "string" &&
            path.isAbsolute(root) &&
            path.parse(root).root === root,
        );
    } catch {
      /* The first launch discovers volumes below. */
    }
  }
  if (configuration !== token) return false;
  const roots = [...new Set([...next.roots, ...priority, ...remembered])];
  await library.configure(roots, next.excludedRoots, !initialized);
  initialized = true;
  if (next.autoSearch) {
    // Start with common folders and the saved index while enumerating other disks.
    void disks()
      .then(async (volumes) => {
        if (configuration !== token || library.closed) return;
        await fs.mkdir(path.dirname(next.cacheFile), { recursive: true });
        await fs.writeFile(
          `${next.cacheFile}.volumes`,
          JSON.stringify(volumes),
        );
        if (configuration !== token || library.closed) return;
        if (JSON.stringify(remembered) !== JSON.stringify(volumes))
          await library.configure(
            [...next.roots, ...priority, ...volumes],
            next.excludedRoots,
            true,
          );
      })
      .catch(() => {
        if (configuration !== token || library.closed) return;
        library.warn("scopeLimited");
        library.changed();
      });
  }
  return true;
}
parentPort.on("message", async ({ id, method, args = [] }) => {
  try {
    let result;
    if (method === "configure") result = await configure(args[0]);
    else if (method === "search") result = library.search(args[0]);
    else if (method === "has") result = library.has(args[0]);
    else if (method === "folder")
      result = {
        files: library.index.listFolder(args[0], args[1], 2001),
        busy: library.busy,
        warnings: library.warnings,
      };
    else if (method === "refresh") {
      if (!library.busy) {
        void configure(options).catch(() => {
          library.warn("indexFailed");
          library.changed();
        });
      }
      result = true;
    } else if (method === "close") {
      configuration++;
      await library.close();
      result = true;
    } else throw new Error("Unknown search operation");
    parentPort.postMessage({ id, result });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
