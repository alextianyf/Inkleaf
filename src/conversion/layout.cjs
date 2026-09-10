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

function layoutCss(options, metadata = {}) {
  const layout = layoutOptions(options);
  const paper = layout.paperSize === "Letter" ? "Letter" : "A4";
  const orientation =
    layout.orientation === "landscape" ? "landscape" : "portrait";
  const margins = pageMargins(layout, metadata);
  const margin = `${margins.top}mm ${margins.side}mm ${margins.bottom}mm`;
  const fontSize = Math.max(8, Math.min(18, Number(layout.fontSize) || 10.5));
  const lineHeight = Math.max(
    1.2,
    Math.min(2, Number(layout.lineHeight) || 1.6),
  );
  const rules = [
    `@page { size: ${paper} ${orientation}; margin: ${margin}; }`,
    `body { font-size: ${fontSize}pt; line-height: ${lineHeight}; }`,
    `h1,h2,h3,h4,h5,h6 { break-after: ${layout.keepHeadings ? "avoid" : "auto"}; }`,
    `table { break-inside: ${layout.keepTables ? "avoid" : "auto"}; }`,
    `pre { break-inside: ${layout.keepCodeBlocks ? "avoid" : "auto"}; }`,
    `p,li { orphans: ${layout.avoidWidows ? 3 : 1}; widows: ${layout.avoidWidows ? 3 : 1}; }`,
    `thead { display: ${layout.repeatTableHeaders ? "table-header-group" : "table-row-group"}; }`,
    `.aldus-footer { text-align: ${["left", "center", "right"].includes(layout.signaturePosition) ? layout.signaturePosition : "center"}; break-inside: avoid; }`,
  ];
  if (["h1", "h2"].includes(layout.chapterBreak))
    rules.push(
      `${layout.chapterBreak}:not(:first-child) { break-before: page; }`,
    );
  for (let level = 1; level <= 6; level++) {
    const declarations = [];
    for (const [suffix, property] of [
      ["Size", "font-size"],
      ["Before", "margin-top"],
      ["After", "margin-bottom"],
    ]) {
      const value = layout[`h${level}${suffix}`];
      if (Number.isFinite(value))
        declarations.push(
          `${property}: ${Math.max(suffix === "Size" ? 8 : 0, Math.min(80, value))}pt`,
        );
    }
    const color = layout[`h${level}Color`];
    if (/^#[0-9a-f]{6}$/i.test(color))
      declarations.push(`color: ${color}`, `border-color: ${color}`);
    if (declarations.length)
      rules.push(`h${level} { ${declarations.join(";")}; }`);
    // An explicit heading gap owns the space on that side. Otherwise a larger
    // paragraph/list margin wins CSS margin collapsing and masks the control.
    if (Number.isFinite(layout[`h${level}Before`]))
      rules.push(
        `:is(p,ul,ol,pre,blockquote,table,div,h1,h2,h3,h4,h5,h6):has(+ h${level}) { margin-bottom: 0; }`,
      );
    if (Number.isFinite(layout[`h${level}After`]))
      rules.push(
        `h${level} + :is(p,ul,ol,pre,blockquote,table,div) { margin-top: 0; }`,
      );
  }
  return rules.join("\n");
}

function pageMargins(options, metadata = {}) {
  const [top, side, bottom] = {
    compact: [12, 12, 18],
    standard: [20, 20, 25],
    wide: [28, 28, 30],
  }[options.margins] || [20, 20, 25];
  let paperWidth = options.paperSize === "Letter" ? 216 : 210;
  if (options.orientation === "landscape")
    paperWidth = options.paperSize === "Letter" ? 279 : 297;
  function textSpace(area) {
    if (!options[`${area}Enabled`]) return 0;
    const values = {
      title: metadata.title || "",
      file: metadata.file || "",
      date: "2000-12-31",
      page: "999",
      pages: "999",
    };
    const text = (options[`${area}Text`] || "").replace(
      /\{(title|file|date|page|pages)\}/g,
      (_, key) => values[key],
    );
    const sharesRow =
      options.pageNumbers &&
      options.pageNumberArea === area &&
      options.pageNumberPosition !== options[`${area}Position`];
    const width = ((paperWidth - side * 2) * 96) / 25.4 / (sharesRow ? 3 : 1);
    // Nine pixels per character also accommodates Chinese text. This modest
    // overestimate reserves space for wrapped text before pagination begins.
    const lines = Math.max(1, Math.ceil((Array.from(text).length * 9) / width));
    return Math.ceil((lines * 12 * 25.4) / 96 + 8);
  }
  // Leave room for user text in the repeating print margins.
  return {
    top: Math.max(top, options.headerEnabled ? 18 : 0, textSpace("header")),
    side,
    bottom: Math.max(
      bottom,
      options.footerEnabled ? 20 : 0,
      textSpace("footer"),
    ),
  };
}

module.exports = { layoutOptions, layoutKey, layoutCss, pageMargins };
