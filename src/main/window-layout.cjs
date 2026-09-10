const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
const MARGIN = 16;
const MIN_SEARCH_WIDTH = 420;

function searchWidth(area, preference) {
  const available = Math.max(1, area.width - MARGIN * 2);
  const automatic = clamp(Math.round(area.width * 0.3) + 120, 560, 640);
  const preferred = Number.isFinite(preference) && preference > 0;
  return Math.round(
    clamp(
      preferred ? preference : automatic,
      Math.min(MIN_SEARCH_WIDTH, available),
      available,
    ),
  );
}

function searchContentHeight(layout) {
  const rows = clamp(Number(layout.rows) || 0, 0, 6);
  return (
    (layout.hasQuery ? (rows ? 130 + rows * 57 : 166) : 62) +
    (layout.hasMessage ? 48 : 0)
  );
}

function layoutBounds(area, layout, preference, previous, heightPreference) {
  let width = layout.mode === "preview" ? 900 : searchWidth(area, preference);
  let height =
    layout.mode === "preview"
      ? 780
      : searchContentHeight(layout) +
        Math.max(0, (heightPreference || 62) - 62);
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

// Measure only the dragged edges against native bounds. Other dimensions may
// include Windows DPI rounding and must not feed back into our logical size.
function symmetricResize(area, bounds, native, next, edge, minHeight = 62) {
  const horizontal = edge.includes("left") || edge.includes("right");
  const vertical = edge.includes("top") || edge.includes("bottom");
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const dx = edge.includes("left")
    ? native.x - next.x
    : next.x + next.width - native.x - native.width;
  const dy = edge.includes("top")
    ? native.y - next.y
    : next.y + next.height - native.y - native.height;
  const maxWidth =
    2 *
    Math.min(centerX - area.x - MARGIN, area.x + area.width - MARGIN - centerX);
  const maxHeight =
    2 *
    Math.min(
      centerY - area.y - MARGIN,
      area.y + area.height - MARGIN - centerY,
    );
  const width = horizontal
    ? Math.round(
        clamp(
          bounds.width + 2 * dx,
          Math.min(MIN_SEARCH_WIDTH, maxWidth),
          maxWidth,
        ),
      )
    : bounds.width;
  const height = vertical
    ? Math.round(
        clamp(
          bounds.height + 2 * dy,
          Math.min(minHeight, maxHeight),
          maxHeight,
        ),
      )
    : bounds.height;
  return {
    x: Math.round(centerX - width / 2),
    y: Math.round(centerY - height / 2),
    width,
    height,
  };
}

module.exports = {
  searchWidth,
  searchContentHeight,
  symmetricResize,
  layoutBounds,
  MIN_SEARCH_WIDTH,
  MARGIN,
};
