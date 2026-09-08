const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
const MARGIN = 16;
const MIN_SEARCH_WIDTH = 420;

function searchWidth(area, preference) {
  const available = Math.max(1, area.width - MARGIN * 2);
  const automatic = clamp(Math.round(area.width * 0.3) + 40, 480, 560);
  const preferred = Number.isFinite(preference) && preference > 0;
  return Math.round(
    clamp(
      preferred ? preference : automatic,
      Math.min(MIN_SEARCH_WIDTH, available),
      available,
    ),
  );
}

function layoutBounds(area, layout, preference, previous) {
  const rows = clamp(Number(layout.rows) || 0, 0, 6);
  const searchHeight = layout.hasQuery ? (rows ? 130 + rows * 57 : 166) : 62;
  let width = layout.mode === "preview" ? 900 : searchWidth(area, preference);
  let height =
    layout.mode === "preview"
      ? 780
      : searchHeight + (layout.hasMessage ? 48 : 0);
  if (layout.settings) {
    width += 300;
    height = Math.max(height, 620);
  }
  width = Math.min(width, Math.max(1, area.width - MARGIN * 2));
  height = Math.min(height, Math.max(1, area.height - MARGIN * 2));
  const center = previous
    ? previous.x + previous.width / 2
    : area.x + area.width / 2;
  const top = previous ? previous.y : area.y + Math.round(area.height * 0.16);
  return {
    x: Math.round(
      clamp(
        center - width / 2,
        area.x + MARGIN,
        area.x + area.width - width - MARGIN,
      ),
    ),
    y: Math.round(
      clamp(top, area.y + MARGIN, area.y + area.height - height - MARGIN),
    ),
    width,
    height,
  };
}

module.exports = { searchWidth, layoutBounds, MIN_SEARCH_WIDTH, MARGIN };
