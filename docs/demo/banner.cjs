// Shared markup and palettes for the README banner, used by hero.cjs.
// The paper in the banner is a rasterized Inkleaf PDF, not a mock document.
const themes = {
  light: {
    ink: "#303b3b",
    canvas: "linear-gradient(115deg,#f5f1e8 0%,#f1f2ed 55%,#dfe9e3 100%)",
    lede: "#64736d",
    eyebrow: "#456158",
    rule: "#8da99a",
    sourceBorder: "#d2ddd5",
    sourceFill: "#eef3ef",
    sourceInk: "#70847a",
    sourceShadow: "0 12px 35px #3c574313",
    paperBorder: "#e3e7e3",
    paperShadow: "0 18px 50px #314a3e26",
  },
  dark: {
    ink: "#e7ede9",
    canvas: "linear-gradient(115deg,#151b19 0%,#182120 55%,#101a17 100%)",
    lede: "#93a69e",
    eyebrow: "#9cc0ae",
    rule: "#4d6d5f",
    sourceBorder: "#454d56",
    sourceFill: "#262b31",
    sourceInk: "#aeb9c5",
    sourceShadow: "0 14px 38px #0000006b",
    paperBorder: "#39413c",
    paperShadow: "0 18px 50px #00000059",
  },
};

const copy = {
  en: {
    lede: "Give your Markdown a page of its own.<br>Search. Preview. Publish.",
    eyebrow: "A tool for Markdown lovers",
  },
  zh: {
    lede: "让文字成页。<br>搜索 Markdown，预览，再导出。",
    eyebrow: "献给 Markdown 爱好者",
  },
};

const sample = `# Notes worth sharing

## Write once.

\`\`\`python
def publish(notes):
    for note in notes:
        export_pdf(note)
\`\`\`

$$ \int_0^1 x^2 dx $$`;

// logo and paper are base64-encoded PNG payloads.
const banner = ({ language, theme, logo, paper }) => {
  const palette = themes[theme];
  const text = copy[language];
  return `<style>
        *{box-sizing:border-box}body{margin:0;font-family:'Segoe UI','Microsoft YaHei',sans-serif;color:${palette.ink}}
        main{width:1500px;height:500px;overflow:hidden;position:relative;background:${palette.canvas}}
        .identity{position:absolute;left:78px;top:70px}.logo{width:76px;height:76px;margin-bottom:26px}
        h1{font-size:58px;letter-spacing:-2px;font-weight:600;margin:0 0 16px}p{font-size:23px;line-height:1.6;color:${palette.lede};margin:0}
        .eyebrow{position:absolute;left:82px;bottom:53px;font-family:Georgia,'SimSun',serif;font-size:32px;font-weight:500;line-height:1.3;letter-spacing:.2px;color:${palette.eyebrow}}
        .eyebrow::before{content:'';display:block;width:38px;height:2px;margin-bottom:16px;background:${palette.rule}}
        .source{position:absolute;left:730px;top:100px;width:450px;height:390px;border:1px solid ${palette.sourceBorder};background:${palette.sourceFill};border-radius:10px;transform:rotate(-7deg);padding:29px 30px;color:${palette.sourceInk};font:15px/1.9 Consolas,monospace;white-space:pre;box-shadow:${palette.sourceShadow}}
        .paper{position:absolute;left:935px;top:40px;width:435px;transform:rotate(5deg);box-shadow:${palette.paperShadow};border:1px solid ${palette.paperBorder};border-radius:3px}
      </style><main><div class="identity"><img class="logo" src="data:image/png;base64,${logo}"><h1>印页 · Inkleaf</h1><p>${text.lede}</p></div><div class="eyebrow">${text.eyebrow}</div><div class="source">${sample}</div><img class="paper" src="data:image/png;base64,${paper}"></main>`;
};

module.exports = { banner, themes, copy };
