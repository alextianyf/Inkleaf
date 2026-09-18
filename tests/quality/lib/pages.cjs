// Run the Electron page renderer from plain Node.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function renderPages(job) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "inkleaf-pages-"));
  const file = path.join(folder, "job.json");
  fs.writeFileSync(file, JSON.stringify(job));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    const result = spawnSync(
      require("electron"),
      [path.join(__dirname, "render.cjs"), file],
      { env, encoding: "utf8", windowsHide: true },
    );
    // Chromium writes its own diagnostics to stderr; keep only our lines.
    const lines = `${result.stdout}\n${result.stderr}`
      .split("\n")
      .filter((line) => line.trim() && !/^\[\d+:\d+\//.test(line));
    if (result.status !== 0)
      throw new Error(`Page rendering failed:\n${lines.join("\n")}`);
    return lines;
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

module.exports = { renderPages };
