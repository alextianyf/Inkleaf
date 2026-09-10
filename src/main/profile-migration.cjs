const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function migrateProfile(legacy, destination) {
  if (!legacy || path.resolve(legacy) === path.resolve(destination))
    return false;
  const source = path.join(legacy, "settings.json");
  const target = path.join(destination, "settings.json");
  if ((await exists(target)) || !(await exists(source))) return false;
  const data = await fs.readFile(source);
  const settings = JSON.parse(data.toString("utf8"));
  if (!settings || typeof settings !== "object" || Array.isArray(settings))
    throw new Error("Legacy settings are not a settings object");
  await fs.mkdir(destination, { recursive: true });
  const temporary = path.join(destination, `.migration-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, data, { flag: "wx" });
    // A hard link publishes the complete file atomically and refuses to replace
    // settings created in the meantime. The original Aldus folder stays intact.
    try {
      await fs.link(temporary, target);
    } catch (error) {
      if (error.code === "EEXIST") return false;
      throw error;
    }
  } finally {
    await fs.rm(temporary, { force: true });
  }
  // Indexes and Chromium caches are disposable. Rebuild them in the new profile
  // instead of importing potentially stale files from a running older version.
  return true;
}

module.exports = { migrateProfile };
