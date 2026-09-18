const hljs = require("highlight.js");

// Use the fence's language, never guess: prose and ASCII art must stay intact.
function highlightCode(code, language) {
  const name = language.trim().toLowerCase();
  if (!name || !hljs.getLanguage(name) || code.length > 200000) return "";
  return hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
}

// Split highlighted HTML into one string per source line. A comment or string
// span can cross a line break, so every open span is closed at the break and
// reopened on the next line; otherwise the markup would not nest.
function codeLines(html) {
  const lines = [];
  const open = [];
  let current = "";
  const addText = (text) => {
    const parts = text.split("\n");
    for (let index = 0; index < parts.length; index++) {
      if (index > 0) {
        current += "</span>".repeat(open.length);
        lines.push(current);
        current = open.map((attributes) => `<span${attributes}>`).join("");
      }
      current += parts[index];
    }
  };
  const tags = /<(\/?)span([^>]*)>/g;
  let last = 0;
  for (let tag; (tag = tags.exec(html)); last = tags.lastIndex) {
    addText(html.slice(last, tag.index));
    if (tag[1]) open.pop();
    else open.push(tag[2]);
    current += tag[0];
  }
  addText(html.slice(last));
  lines.push(current);
  return lines;
}

// The name printed on a code block. Plain text carries no label; a few
// highlight.js names are shortened to what an author would write.
const LABELS = { html: "HTML", xml: "XML", shell: "Shell", console: "Shell" };
function languageLabel(language) {
  const name = language.trim().toLowerCase();
  const found = name && hljs.getLanguage(name);
  if (!found || found.name === "Plain text") return "";
  return LABELS[name] || found.name;
}

module.exports = { highlightCode, codeLines, languageLabel };
