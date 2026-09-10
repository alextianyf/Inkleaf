const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  searchWidth,
  layoutBounds,
  symmetricResize,
} = require("../../src/main/window-layout.cjs");

test("default width follows the display and manual width takes precedence", () => {
  assert.equal(searchWidth({ width: 1280 }), 560);
  assert.equal(searchWidth({ width: 1600 }), 600);
  assert.equal(searchWidth({ width: 2560 }), 640);
  assert.equal(searchWidth({ width: 1600 }, 700), 700);
  assert.equal(searchWidth({ width: 2560 }, 700), 700);
  assert.equal(searchWidth({ width: 600 }, 700), 568);
  assert.equal(searchWidth({ width: 1600 }, 100), 420);
  for (const invalid of [null, undefined, NaN, Infinity, -5, "700"])
    assert.equal(searchWidth({ width: 1600 }, invalid), 600);
});

test("manual edge and corner resizing preserves the center and ignores unrelated DPI rounding", () => {
  const area = { x: -1600, y: -200, width: 1600, height: 1000 };
  const bounds = { x: -1100, y: 100, width: 500, height: 100 };
  for (const edge of [
    "left",
    "right",
    "top",
    "bottom",
    "top-left",
    "bottom-right",
  ]) {
    const horizontal = /left|right/.test(edge);
    const vertical = /top|bottom/.test(edge);
    const native = { ...bounds, width: 502, height: 102 };
    const next = {
      ...native,
      x: native.x - (edge.includes("left") ? 20 : 0),
      y: native.y - (edge.includes("top") ? 15 : 0),
      width: native.width + (horizontal ? 20 : 2),
      height: native.height + (vertical ? 15 : 2),
    };
    const resized = symmetricResize(area, bounds, native, next, edge);
    assert.equal(resized.width, horizontal ? 540 : 500, edge);
    assert.equal(resized.height, vertical ? 130 : 100, edge);
    assert.equal(resized.x + resized.width / 2, -850, edge);
    assert.equal(resized.y + resized.height / 2, 150, edge);
  }
});

test("resizing stops at screen edges without shifting the center; height preference survives result changes", () => {
  const area = { x: 0, y: 0, width: 1200, height: 800 };
  const bounds = { x: 350, y: 80, width: 500, height: 80 };
  const resized = symmetricResize(
    area,
    bounds,
    bounds,
    { ...bounds, width: 2000, height: 2000 },
    "bottom-right",
  );
  assert.equal(resized.width, 1168);
  assert.equal(resized.height, 208);
  assert.equal(resized.y, 16);
  assert.equal(resized.y + resized.height / 2, 120);
  const compact = layoutBounds(area, { mode: "search" }, 560, undefined, 110);
  const results = layoutBounds(
    area,
    { mode: "search", hasQuery: true, rows: 3 },
    560,
    compact,
    110,
  );
  assert.equal(results.height, 130 + 3 * 57 + 48);
  assert.equal(results.y, compact.y);
  assert.deepEqual(
    layoutBounds(area, { mode: "search" }, 560, results, 110),
    compact,
  );
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
