// GitHub-style callouts: a blockquote whose first line is [!NOTE], [!TIP],
// [!IMPORTANT], [!WARNING] or [!CAUTION] becomes a labelled block. The label
// follows the document language; a plain blockquote is left untouched.
const TYPES = ["note", "tip", "important", "warning", "caution"];
const MARKER = new RegExp(`^\\[!(${TYPES.join("|")})\\][ \\t]*`, "i");

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

function callouts(md, labels = {}) {
  md.core.ruler.push("aldus_callouts", (state) => {
    const tokens = state.tokens;
    for (let index = 0; index < tokens.length; index++) {
      if (
        tokens[index].type !== "blockquote_open" ||
        tokens[index + 1]?.type !== "paragraph_open" ||
        tokens[index + 2]?.type !== "inline"
      )
        continue;
      const inline = tokens[index + 2];
      const match = MARKER.exec(inline.content);
      if (!match) continue;
      const type = match[1].toLowerCase();
      inline.content = inline.content.slice(match[0].length).replace(/^\n/, "");
      const children = inline.children || [];
      if (children[0]?.type === "text") {
        children[0].content = children[0].content.replace(MARKER, "");
        if (!children[0].content) {
          children.shift();
          if (children[0]?.type === "softbreak") children.shift();
        }
      }
      tokens[index].attrJoin("class", `aldus-callout aldus-callout-${type}`);
      const label = new state.Token("html_block", "", 0);
      label.content = `<p class="aldus-callout-label">${escape(labels[type] || type)}</p>\n`;
      tokens.splice(index + 1, 0, label);
      index++;
    }
  });
}

module.exports = { callouts, calloutTypes: TYPES };
