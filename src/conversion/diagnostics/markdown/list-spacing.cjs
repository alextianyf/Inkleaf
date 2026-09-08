// A deliberately narrow recovery rule, not a general prose-to-list converter.
const label = /^[\p{L}\p{N}][\p{L}\p{N} _()（）-]{0,100}[:：]\s*$/u;
const malformed = /^( {0,3})-(?=[\p{L}])(.+)$/u;
const valid = /^( {0,3})-\s+\S/;

module.exports = {
  id: "markdown/list-spacing",
  *check({ lines, paragraphs }) {
    for (const [start, end] of paragraphs) {
      const first = lines[start].replace(/^\uFEFF/, "");
      if (!label.test(first)) {
        // One physical line cannot be safely split on hyphens (negative numbers,
        // options, prose and inline code can all contain them).
        if (/^[\p{L}][^:\n]{0,100}[:：]\s*-\s+.+\s+-\s+\S/u.test(first))
          yield {
            key: "sourceInlineList",
            line: start + 1,
            endLine: start + 1,
          };
        continue;
      }
      const candidates = lines.slice(start + 1, end);
      if (
        candidates.length &&
        candidates.every((line) => /^(?: {4,}|\t)-\s+\S/.test(line))
      ) {
        yield { key: "sourceIndentedList", line: start + 2, endLine: end };
        continue;
      }
      const matches = candidates.map((line) => malformed.exec(line));
      if (!matches.some(Boolean)) continue;
      const allItems = candidates.every(
        (line, i) => matches[i] || valid.test(line),
      );
      const sameIndent =
        new Set(candidates.map((line) => /^ */.exec(line)[0].length)).size ===
        1;
      // Command option lists and isolated hyphenated lines remain ambiguous.
      const optionLabel =
        /(?:options?|flags?|arguments?|command|参数|选项|命令)/i.test(first);
      const optionItems = candidates.some((line) =>
        /^ *-(?:[A-Za-z]$|-|\S+[=/])/.test(line),
      );
      const canRepair =
        candidates.length >= 2 &&
        allItems &&
        sameIndent &&
        !optionLabel &&
        !optionItems;
      yield {
        key: canRepair ? "sourceListSpaceRepaired" : "sourceListSpaceUncertain",
        line: start + 2,
        endLine: end,
        edits: canRepair
          ? matches.flatMap((match, i) =>
              match
                ? [{ line: start + i + 2, text: `${match[1]}- ${match[2]}` }]
                : [],
            )
          : [],
      };
    }
  },
};
