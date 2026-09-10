const path = require("node:path");
const { layoutOptions, pageMargins } = require("./layout.cjs");

function escape(text) {
  return String(text).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

function printDecoration(options, file, title) {
  const layout = layoutOptions(options);
  const chinese = options.language === "zh";
  const page = '<span class="pageNumber"></span>';
  const pages = '<span class="totalPages"></span>';
  const values = {
    title: escape(title),
    file: escape(path.basename(file)),
    date: escape(new Date().toLocaleDateString(chinese ? "zh-CN" : "en-CA")),
    page,
    pages,
  };
  function text(value) {
    return escape(value || "").replace(
      /\{(title|file|date|page|pages)\}/g,
      (_, key) => values[key],
    );
  }
  const numbers =
    layout.pageNumberFormat === "number"
      ? page
      : layout.pageNumberFormat === "label"
        ? chinese
          ? `第 ${page} 页，共 ${pages} 页`
          : `Page ${page} of ${pages}`
        : `${page} / ${pages}`;
  const margins = pageMargins(layout, { title, file: path.basename(file) });
  function template(area) {
    const cells = { left: [], center: [], right: [] };
    if (layout[`${area}Enabled`]) {
      const position = layout[`${area}Position`];
      (cells[position] || cells.left).push(text(layout[`${area}Text`]));
    }
    if (layout.pageNumbers && layout.pageNumberArea === area)
      (cells[layout.pageNumberPosition] || cells.center).push(numbers);
    const populated = Object.keys(cells).filter((position) =>
      cells[position].some(Boolean),
    );
    if (!populated.length) return "<span></span>";
    const positions = populated.length === 1 ? populated : Object.keys(cells);
    return `<div style="display:flex;width:100%;box-sizing:border-box;padding:0 ${margins.side}mm;font:9px/1.3 'Segoe UI',sans-serif;color:#777;">${positions
      .map(
        (position) =>
          `<div style="flex:1;min-width:0;text-align:${position};overflow-wrap:anywhere;">${cells[position].filter(Boolean).join(" · ")}</div>`,
      )
      .join("")}</div>`;
  }
  return {
    displayHeaderFooter:
      layout.pageNumbers || layout.headerEnabled || layout.footerEnabled,
    headerTemplate: template("header"),
    footerTemplate: template("footer"),
    margins: {
      top: margins.top / 25.4,
      bottom: margins.bottom / 25.4,
      left: margins.side / 25.4,
      right: margins.side / 25.4,
    },
  };
}

module.exports = { printDecoration };
