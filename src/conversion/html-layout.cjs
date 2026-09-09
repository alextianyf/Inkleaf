// Normalize legacy HTML presentation hints into CSS so an Aldus theme cannot
// override explicit source layout. Document CSS retains priority over these hints.
const dimension = (value) =>
  /^\d+(?:\.\d+)?%?$/.test(value || "")
    ? value.endsWith("%")
      ? value
      : `${value}px`
    : null;
const pixels = (value) => (/^\d{1,4}$/.test(value || "") ? `${value}px` : null);
const color = (value) =>
  /^(?:#[a-f\d]{3,8}|[a-z]+)$/i.test(value || "") ? value : null;
const cells = new Set(["th", "td"]);
const sized = new Set(["img", "table", "th", "td", "col", "colgroup", "hr"]);
const aligned = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "th",
  "td",
  "tr",
  "thead",
  "tbody",
  "tfoot",
]);

function layoutHints(tag, attrs, table = {}) {
  const hints = [];
  const add = (name, value) => {
    if (value) hints.push(`${name}:${value}`);
  };
  if (sized.has(tag)) {
    add("width", dimension(attrs.width));
    add("height", dimension(attrs.height));
  }
  const align = attrs.align?.toLowerCase();
  if (
    aligned.has(tag) &&
    ["left", "center", "right", "justify"].includes(align)
  )
    add("text-align", align);
  if (tag === "table") {
    // Themes stretch tables to the page width. An explicitly aligned HTML
    // table without a width should fit its contents so alignment can take effect.
    // Authored CSS still wins over these presentation hints.
    if (["left", "center", "right"].includes(align) && !dimension(attrs.width))
      add("width", "auto");
    if (align === "center") {
      add("margin-left", "auto");
      add("margin-right", "auto");
    }
    if (align === "left") {
      add("margin-left", "0");
      add("margin-right", "auto");
    }
    if (align === "right") {
      add("margin-left", "auto");
      add("margin-right", "0");
    }
    if (pixels(attrs.cellspacing)) {
      add("border-spacing", pixels(attrs.cellspacing));
      add("border-collapse", "separate");
    }
  }
  if (tag === "img") {
    if (["left", "right"].includes(align)) add("float", align);
    if (["top", "middle", "bottom", "baseline"].includes(align))
      add("vertical-align", align);
    if (pixels(attrs.hspace)) {
      add("margin-left", pixels(attrs.hspace));
      add("margin-right", pixels(attrs.hspace));
    }
    if (pixels(attrs.vspace)) {
      add("margin-top", pixels(attrs.vspace));
      add("margin-bottom", pixels(attrs.vspace));
    }
  }
  if (["table", "th", "td", "tr", "thead", "tbody", "tfoot"].includes(tag)) {
    add("background-color", color(attrs.bgcolor));
    if (["top", "middle", "bottom", "baseline"].includes(attrs.valign))
      add("vertical-align", attrs.valign);
  }
  if (cells.has(tag)) add("padding", pixels(table.cellpadding));
  const border = cells.has(tag) ? table.border : attrs.border;
  if (["table", "img", "th", "td"].includes(tag) && pixels(border)) {
    add("border-width", pixels(border));
    add("border-style", Number(border) ? "solid" : "none");
  }
  return hints.join(";");
}

const layoutAllowedAttributes = {
  input: ["type", "checked", "disabled"],
  details: ["open"],
  "*": ["class", "id", "style", "aria-hidden", "title", "dir", "lang"],
  a: ["href", "title", "name"],
  p: ["align"],
  div: ["align"],
  h1: ["align"],
  h2: ["align"],
  h3: ["align"],
  h4: ["align"],
  h5: ["align"],
  h6: ["align"],
  img: ["src", "alt", "width", "height", "align", "border", "hspace", "vspace"],
  table: [
    "align",
    "width",
    "height",
    "border",
    "cellpadding",
    "cellspacing",
    "bgcolor",
  ],
  th: [
    "colspan",
    "rowspan",
    "align",
    "valign",
    "width",
    "height",
    "bgcolor",
    "scope",
  ],
  td: ["colspan", "rowspan", "align", "valign", "width", "height", "bgcolor"],
  tr: ["align", "valign", "bgcolor"],
  thead: ["align", "valign"],
  tbody: ["align", "valign"],
  tfoot: ["align", "valign"],
  col: ["span", "width"],
  colgroup: ["span", "width"],
  ol: ["start", "reversed", "type"],
  li: ["value"],
  hr: ["width", "align"],
  svg: ["xmlns", "width", "height", "viewBox", "preserveAspectRatio"],
  path: ["d", "fill"],
  line: ["x1", "x2", "y1", "y2", "stroke-width"],
};
module.exports = { layoutHints, layoutAllowedAttributes };
