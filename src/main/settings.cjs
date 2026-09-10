const fs = require("node:fs/promises");
const path = require("node:path");
const groups = require("../shared/preferences.json");
const DEFAULTS = Object.assign({}, ...Object.values(groups));

function validatePreferences(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw new Error("Invalid settings");
  const result = {};
  const choices = {
    appearance: ["light", "dark", "system"],
    languagePreference: ["system", "zh", "en"],
    theme: ["default", "minimal", "folio"],
    paperSize: ["A4", "Letter"],
    orientation: ["portrait", "landscape"],
    margins: ["compact", "standard", "wide"],
    exportDestination: ["downloads", "source", "custom"],
    signaturePosition: ["left", "center", "right"],
    headerPosition: ["left", "center", "right"],
    footerPosition: ["left", "center", "right"],
    pageNumberPosition: ["left", "center", "right"],
    pageNumberArea: ["header", "footer"],
    pageNumberFormat: ["number", "fraction", "label"],
    chapterBreak: ["none", "h1", "h2"],
  };
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(DEFAULTS, key)) continue;
    let valid = true;
    if (choices[key]) valid = choices[key].includes(value);
    else if (key === "searchWidth")
      valid =
        value === null ||
        (Number.isFinite(value) && value >= 420 && value <= 10000);
    else if (key === "fontSize")
      valid = Number.isFinite(value) && value >= 8 && value <= 18;
    else if (key === "searchHeight")
      valid =
        value === null ||
        (Number.isFinite(value) && value >= 62 && value <= 10000);
    else if (key === "lineHeight")
      valid = Number.isFinite(value) && value >= 1.2 && value <= 2;
    else if (["roots", "excludedRoots"].includes(key))
      valid =
        Array.isArray(value) &&
        value.every(
          (root) => typeof root === "string" && path.isAbsolute(root),
        );
    else if (typeof DEFAULTS[key] === "boolean")
      valid = typeof value === "boolean";
    else if (/^h[1-6]Color$/.test(key))
      valid =
        typeof value === "string" &&
        (value === "" || /^#[0-9a-f]{6}$/i.test(value));
    else if (/^h[1-6](Size|Before|After)$/.test(key))
      valid =
        value === null ||
        (Number.isFinite(value) &&
          value >= (key.endsWith("Size") ? 8 : 0) &&
          value <= 80);
    else if (
      ["author", "copyrightLabel", "headerText", "footerText"].includes(key)
    )
      valid = typeof value === "string" && value.length <= 200;
    else if (key === "shortcut")
      valid =
        typeof value === "string" && value.length > 0 && value.length <= 100;
    else if (key === "exportFolder")
      valid =
        typeof value === "string" && (value === "" || path.isAbsolute(value));
    if (!valid) throw new Error("Invalid settings");
    result[key] = value;
  }
  return result;
}
function resolveLanguage(preference, locale) {
  if (preference !== "system") return preference;
  if (locale.startsWith("zh")) return "zh";
  return "en";
}
async function loadSettings(file, locale, overrides = {}) {
  const defaults = {
    ...DEFAULTS,
    ...overrides,
    language: locale.startsWith("zh") ? "zh" : "en",
  };
  let config;
  try {
    const saved = JSON.parse(await fs.readFile(file, "utf8"));
    // Earlier development builds used this field for the wrong purpose.
    // Keep that text in the copyright line, never in the document heading.
    if (
      saved.copyrightLabel === undefined &&
      typeof saved.documentTitle === "string"
    )
      saved.copyrightLabel = saved.documentTitle;
    delete saved.documentTitle;
    config = {
      ...defaults,
      ...Object.fromEntries(
        Object.entries(saved).filter(([key, value]) => {
          try {
            validatePreferences({ [key]: value });
            return true;
          } catch {
            return false;
          }
        }),
      ),
      languagePreference:
        saved.languagePreference || saved.language || "system",
      roots: Array.isArray(saved.roots)
        ? saved.roots.filter(
            (root) => typeof root === "string" && path.isAbsolute(root),
          )
        : [],
    };
  } catch {
    config = { ...defaults };
  }
  if (!["zh", "en"].includes(config.language))
    config.language = defaults.language;
  config.autoSearch =
    typeof config.autoSearch === "boolean" ? config.autoSearch : true;
  config.excludedRoots = Array.isArray(config.excludedRoots)
    ? config.excludedRoots.filter(
        (root) => typeof root === "string" && path.isAbsolute(root),
      )
    : [];

  if (!["system", "zh", "en"].includes(config.languagePreference))
    config.languagePreference = "system";
  config.language = resolveLanguage(config.languagePreference, locale);
  return config;
}

// Serialize disk writes: an older save must not overwrite a newer preference.
function createSettingsWriter(file) {
  let savingSettings = Promise.resolve();
  function save(config) {
    const snapshot = JSON.stringify(config, null, 2);
    savingSettings = savingSettings
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(`${file}.tmp`, snapshot);
        await fs.rename(`${file}.tmp`, file);
      });
    return savingSettings;
  }

  return save;
}
module.exports = {
  loadSettings,
  createSettingsWriter,
  validatePreferences,
  resolveLanguage,
};
