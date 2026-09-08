const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

async function writeUniquePdf(output, relative, data) {
  const target = relative.replace(/\.(md|markdown)$/i, ".pdf");
  if (
    path.isAbsolute(target) ||
    target.split(/[\\/]/).some((part) => part === "..")
  )
    throw new Error("Invalid output path");
  let directory = await fs.realpath(output);
  for (const part of path
    .dirname(target)
    .split(path.sep)
    .filter((part) => part !== ".")) {
    directory = path.join(directory, part);
    try {
      await fs.mkdir(directory);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Output subfolder is not a regular directory");
  }
  const stem = path.basename(target, ".pdf");
  for (let number = 0; number < 10000; number++) {
    const file = path.join(
      directory,
      `${stem}${number ? ` (${number})` : ""}.pdf`,
    );
    let handle;
    try {
      handle = await fs.open(file, "wx");
    } catch (error) {
      if (error.code === "EEXIST") continue;
      throw error;
    }
    try {
      await handle.writeFile(data);
    } catch (error) {
      await handle.close();
      await fs.unlink(file).catch(() => {});
      throw error;
    }
    await handle.close();
    return file;
  }
  throw new Error("Too many files with the same name");
}

class BatchJob {
  constructor({
    files,
    output,
    render,
    sourceDestination = false,
    preserveFolders = true,
    onChange = () => {},
  }) {
    this.id = randomUUID();
    this.entries = files.map((file) => ({ ...file, status: "waiting" }));
    this.output = output;
    this.sourceDestination = sourceDestination;
    this.preserveFolders = preserveFolders;
    this.render = render;
    this.onChange = onChange;
    this.running = true;
    this.cancelled = false;
    this.completed = 0;
    this.failed = 0;
  }
  snapshot(entries = this.entries) {
    return {
      id: this.id,
      output: this.output,
      running: this.running,
      cancelled: this.cancelled,
      completed: this.completed,
      failed: this.failed,
      total: this.entries.length,
      entries,
    };
  }
  cancel() {
    if (!this.running) return;
    this.cancelled = true;
    this.onChange(this.snapshot([]));
  }
  async run() {
    try {
      for (const entry of this.entries) {
        if (this.cancelled) break;
        entry.status = "converting";
        this.onChange(this.snapshot([entry]));
        try {
          const pdf = await this.render(entry.path);
          entry.output = await writeUniquePdf(
            this.sourceDestination ? path.dirname(entry.path) : this.output,
            this.sourceDestination || !this.preserveFolders
              ? path.basename(entry.path)
              : entry.relative,
            pdf.data,
          );
          entry.warnings = pdf.warnings;
          entry.layoutWarnings = pdf.layoutWarnings || [];
          entry.sourceDiagnostics = pdf.sourceDiagnostics || [];
          entry.status =
            pdf.warnings.length ||
            entry.layoutWarnings.length ||
            entry.sourceDiagnostics.length
              ? "warning"
              : "done";
          this.completed++;
        } catch (error) {
          entry.status = "failed";
          entry.error = error.message;
          this.failed++;
        }
        this.onChange(this.snapshot([entry]));
      }
    } finally {
      this.running = false;
      for (const entry of this.entries)
        if (entry.status === "waiting") entry.status = "cancelled";
      this.onChange(this.snapshot());
    }
    return this.snapshot();
  }
}
module.exports = { BatchJob, writeUniquePdf };
