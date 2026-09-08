const { test } = require("node:test");
const assert = require("node:assert/strict");
const { searchWidth, layoutBounds } = require("../window-layout.cjs");

test("default width follows the display and manual width takes precedence", () => {
  assert.equal(searchWidth({ width: 1280 }), 480);
  assert.equal(searchWidth({ width: 1600 }), 520);
  assert.equal(searchWidth({ width: 2560 }), 560);
  assert.equal(searchWidth({ width: 1600 }, 700), 700);
  assert.equal(searchWidth({ width: 2560 }, 700), 700);
  assert.equal(searchWidth({ width: 600 }, 700), 568);
  assert.equal(searchWidth({ width: 1600 }, 100), 420);
  for (const invalid of [null, undefined, NaN, Infinity, -5, "700"])
    assert.equal(searchWidth({ width: 1600 }, invalid), 520);
});

test("search starts near the top of its display, including negative monitor coordinates", () => {
  const area = { x: -1600, y: -200, width: 1600, height: 900 };
  const bounds = layoutBounds(area, { mode: "search" });
  assert.equal(bounds.y, -56);
  assert.equal(bounds.x + bounds.width / 2, -800);
  const results = layoutBounds(
    area,
    { mode: "search", hasQuery: true, rows: 4 },
    undefined,
    bounds,
  );
  assert.equal(
    results.y,
    bounds.y,
    "results grow downward without moving the input",
  );
  assert.equal(results.width, bounds.width);
});

test("preview and settings fit short monitors while search returns to its own width", () => {
  const area = { x: 1920, y: 80, width: 800, height: 600 };
  for (const layout of [
    { mode: "preview" },
    { mode: "preview", settings: true },
    { mode: "search", settings: true },
    { mode: "search", hasQuery: true, rows: 80, hasMessage: true },
  ]) {
    const bounds = layoutBounds(area, layout, 700);
    assert.ok(bounds.x >= area.x && bounds.y >= area.y);
    assert.ok(bounds.x + bounds.width <= area.x + area.width);
    assert.ok(bounds.y + bounds.height <= area.y + area.height);
  }
  assert.equal(layoutBounds(area, { mode: "search" }, 700).width, 700);
});
