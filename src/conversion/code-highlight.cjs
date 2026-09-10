const hljs = require("highlight.js");

// Use the fence's language, never guess: prose and ASCII art must stay intact.
function highlightCode(code, language) {
  const name = language.trim().toLowerCase();
  if (!name || !hljs.getLanguage(name) || code.length > 200000) return "";
  return hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
}

module.exports = { highlightCode };
