const path = require("node:path");
const { layout: defaults } = require("../shared/preferences.json");

const paginationRules = [
  "keepHeadings",
  "keepTables",
  "keepCodeBlocks",
  "avoidWidows",
  "repeatTableHeaders",
  "chapterBreak",
];

function layoutSample(options, scenario = null) {
  const language = options.language === "zh" ? "zh" : "en";
  let name = "layout";
  let settings = options;
  if (scenario) {
    if (
      !paginationRules.includes(scenario.name) ||
      typeof scenario.enabled !== "boolean"
    )
      throw new Error("Invalid sample scenario");
    if (
      scenario.name === "chapterBreak" &&
      scenario.enabled &&
      !["h1", "h2"].includes(options.chapterBreak)
    )
      throw new Error(
        require("../shared/strings.json")[language].chapterRuleUnavailable,
      );
    name = "pagination-" + scenario.name;
    // A controlled page boundary isolates this rule from the other settings.
    // These fixtures were calibrated in Classic; isolate the pagination rule
    // from the selected theme and future changes to the application default.
    settings = { ...defaults, theme: "default", language, authorEnabled: false };
    for (const rule of paginationRules)
      settings[rule] = rule === "chapterBreak" ? "none" : false;
    settings[scenario.name] =
      scenario.name === "chapterBreak"
        ? scenario.enabled
          ? options.chapterBreak
          : "none"
        : scenario.enabled;
  }
  return {
    file: path.join(
      __dirname,
      "../../resources/samples",
      `${name}-${language}.md`,
    ),
    options: settings,
  };
}

module.exports = { layoutSample };
