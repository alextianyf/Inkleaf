const { layout: defaults } = require("../shared/preferences.json");

function layoutOptions(options = {}) {
  const result = {};
  for (const key of Object.keys(defaults))
    result[key] = options[key] ?? defaults[key];
  return result;
}

function layoutKey(options) {
  return JSON.stringify(layoutOptions(options));
}

function layoutCss(options) {
  const layout = layoutOptions(options);
  const paper = layout.paperSize === "Letter" ? "Letter" : "A4";
  const orientation =
    layout.orientation === "landscape" ? "landscape" : "portrait";
  const margin =
    {
      compact: "12mm 12mm 18mm",
      standard: "20mm 20mm 25mm",
      wide: "28mm 28mm 30mm",
    }[layout.margins] || "20mm 20mm 25mm";
  const fontSize = Math.max(8, Math.min(18, Number(layout.fontSize) || 10.5));
  const lineHeight = Math.max(
    1.2,
    Math.min(2, Number(layout.lineHeight) || 1.6),
  );
  return `@page { size: ${paper} ${orientation}; margin: ${margin}; }
    body { font-size: ${fontSize}pt; line-height: ${lineHeight}; }`;
}

module.exports = { layoutOptions, layoutKey, layoutCss };
