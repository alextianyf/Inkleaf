const listSpacing = require("./markdown/list-spacing.cjs");
const mathDelimiters = require("./markdown/math-delimiters.cjs");

// Rules operate on source lines in memory. Line numbers always refer to the
// original document; no rule in this stage may insert/delete a line.
function checkMarkdown(source, parser, rules = [listSpacing, mathDelimiters]) {
  const pieces = source.split(/(\r\n|\n|\r)/);
  const lines = Object.freeze(pieces.filter((_, index) => index % 2 === 0));
  const tokens = parser.parse(source, {});
  const paragraphs = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== "paragraph_open" || tokens[i].level !== 0) continue;
    const inline = tokens[i + 1];
    if (
      !inline?.map ||
      inline.children?.some((token) =>
        /^(?:code_|html_|math_)/.test(token.type),
      )
    )
      continue;
    paragraphs.push(inline.map);
  }
  const diagnostics = [],
    edited = new Set();
  let total = 0;
  for (const rule of rules) {
    for (const finding of rule.check({ lines, paragraphs })) {
      const edits = finding.edits || [];
      for (const edit of edits) {
        if (
          !Number.isInteger(edit.line) ||
          edit.line < 1 ||
          edit.line > lines.length ||
          /[\r\n]/.test(edit.text) ||
          edited.has(edit.line)
        )
          throw new Error(`Invalid or overlapping edit from ${rule.id}`);
        pieces[(edit.line - 1) * 2] = edit.text;
        edited.add(edit.line);
      }
      total++;
      if (diagnostics.length < 100)
        diagnostics.push({
          ruleId: rule.id,
          key: finding.key,
          status: edits.length ? "repaired" : "warning",
          line: finding.line,
          endLine: finding.endLine,
        });
    }
  }
  if (total > diagnostics.length)
    diagnostics.push({
      ruleId: "diagnostic-limit",
      key: "sourceMoreIssues",
      status: "warning",
    });
  return { source: edited.size ? pieces.join("") : source, diagnostics };
}

module.exports = { checkMarkdown };
