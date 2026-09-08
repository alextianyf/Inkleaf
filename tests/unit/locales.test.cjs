const { test } = require("node:test");
const assert = require("node:assert/strict");
const strings = require("../../src/shared/strings.json");

test("English and Chinese expose the same complete set of UI and native messages", () => {
  assert.deepEqual(
    Object.keys(strings.en).sort(),
    Object.keys(strings.zh).sort(),
  );
  for (const language of ["en", "zh"]) {
    for (const [key, value] of Object.entries(strings[language])) {
      assert.equal(typeof value, "string", `${language}.${key}`);
      assert.ok(value.trim().length > 0, `${language}.${key} is empty`);
    }
  }
});
