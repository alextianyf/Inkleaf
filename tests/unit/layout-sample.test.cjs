const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const MarkdownIt = require("markdown-it");
const { layoutSample } = require("../../src/main/layout-sample.cjs");

test("ordinary bilingual samples include all heading levels and label code languages", () => {
  for (const language of ["en", "zh"]) {
    const sample = layoutSample({ language });
    const tokens = new MarkdownIt({ html: true }).parse(
      fs.readFileSync(sample.file, "utf8"),
      {},
    );
    const levels = new Set(
      tokens
        .filter((token) => token.type === "heading_open")
        .map((token) => token.tag),
    );
    assert.deepEqual([...levels].sort(), ["h1", "h2", "h3", "h4", "h5", "h6"]);
    for (const language of ["javascript", "python"]) {
      const index = tokens.findIndex(
        (token) => token.type === "fence" && token.info === language,
      );
      assert.equal(tokens[index - 3].tag, "h3");
      assert.match(
        tokens[index - 2].content.toLowerCase(),
        new RegExp(language),
      );
    }
  }
});

test("chapter comparison never invents a break level when no forced break is selected", () => {
  for (const language of ["en", "zh"]) {
    assert.throws(
      () =>
        layoutSample(
          { language, chapterBreak: "none" },
          { name: "chapterBreak", enabled: true },
        ),
      language === "zh" ? /不强制分页/ : /No forced break/,
    );
    for (const chapterBreak of ["h1", "h2"]) {
      assert.equal(
        layoutSample(
          { language, chapterBreak },
          { name: "chapterBreak", enabled: true },
        ).options.chapterBreak,
        chapterBreak,
      );
      assert.equal(
        layoutSample(
          { language, chapterBreak },
          { name: "chapterBreak", enabled: false },
        ).options.chapterBreak,
        "none",
      );
    }
  }
});
