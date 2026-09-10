const path = require("node:path");

function runtimeOptions({ packaged, appData, env = process.env }) {
  const testing = Boolean(env.ALDUS_TEST_DIR);
  // Test overrides are ignored entirely outside an isolated test profile.
  let mode = packaged ? "production" : "development";
  if (testing) {
    mode = "test";
    if (["development", "production"].includes(env.INKLEAF_TEST_MODE)) {
      mode = env.INKLEAF_TEST_MODE;
    }
  }
  const development = mode === "development";
  const userData = testing
    ? path.resolve(env.ALDUS_TEST_DIR)
    : path.join(appData, development ? "Inkleaf-Dev" : "Inkleaf");
  return {
    mode,
    testing,
    development,
    userData,
    name: development ? "Inkleaf Dev" : "Inkleaf",
    appId: development ? "com.alextian.inkleaf.dev" : "com.alextian.aldus",
    sessionData: path.join(userData, "chromium"),
    legacyData:
      mode === "production" && !testing ? path.join(appData, "Aldus") : null,
    defaultShortcut: development
      ? "Control+Alt+Shift+Space"
      : "CommandOrControl+Shift+Space",
    updatesAllowed: !development && (packaged || testing),
  };
}

module.exports = { runtimeOptions };
