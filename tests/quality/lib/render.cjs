// Electron entry point: render PDF pages to PNG with pdf.js, in colour and in
// grayscale, plus an overview sheet per document. No Poppler needed.
//
//   electron tests/quality/lib/render.cjs job.json
//
// job.json: { out, width, sheetColumns,
//   items: [{ name, pdf, pages, grayPages, sheet, graySheet }] }
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");
const pdfjs = `file:///${path.join(root, "node_modules/pdfjs-dist").replace(/\\/g, "/")}/`;
const fileUrl = (file) => `file:///${path.resolve(file).replace(/\\/g, "/")}`;

const viewer = `<!doctype html><html><body><script>
const documents = {};
const tasks = {};
const canvases = {};
window.boot = (async () => {
  window.pdfjs = await import(${JSON.stringify(pdfjs + "build/pdf.min.mjs")});
  pdfjs.GlobalWorkerOptions.workerSrc = ${JSON.stringify(pdfjs + "build/pdf.worker.min.mjs")};
})();
window.load = async (name, url) => {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  tasks[name] = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
  documents[name] = await tasks[name].promise;
  return documents[name].numPages;
};
// Weighted screen grayscale approximation; printer output can differ.
const grayscale = (canvas) => {
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext("2d");
  context.drawImage(canvas, 0, 0);
  const pixels = context.getImageData(0, 0, copy.width, copy.height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const value = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
    data[i] = data[i + 1] = data[i + 2] = value;
  }
  context.putImageData(pixels, 0, 0);
  return copy;
};
window.page = async (name, number, width, gray) => {
  const key = name + ":" + number;
  if (!canvases[key]) {
    const page = await documents[name].getPage(number);
    const unit = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / unit.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    canvases[key] = canvas;
  }
  return (gray ? grayscale(canvases[key]) : canvases[key]).toDataURL("image/png");
};
window.sheet = (name, count, columns, thumb, gray) => {
  const gap = 22, pad = 28;
  const first = canvases[name + ":1"];
  const height = Math.round(first.height * (thumb / first.width));
  const rows = Math.ceil(count / columns);
  const board = document.createElement("canvas");
  board.width = pad * 2 + columns * thumb + (columns - 1) * gap;
  board.height = pad * 2 + rows * height + (rows - 1) * gap;
  const context = board.getContext("2d");
  context.fillStyle = "#e9ecf0";
  context.fillRect(0, 0, board.width, board.height);
  for (let n = 1; n <= count; n++) {
    const source = gray ? grayscale(canvases[name + ":" + n]) : canvases[name + ":" + n];
    const x = pad + ((n - 1) % columns) * (thumb + gap);
    const y = pad + Math.floor((n - 1) / columns) * (height + gap);
    context.drawImage(source, x, y, thumb, height);
    context.strokeStyle = "#cfd5dc";
    context.strokeRect(x + 0.5, y + 0.5, thumb - 1, height - 1);
  }
  return board.toDataURL("image/png");
};
window.release = async (name) => {
  for (const key of Object.keys(canvases)) {
    if (!key.startsWith(name + ":")) continue;
    canvases[key].width = canvases[key].height = 0;
    delete canvases[key];
  }
  await tasks[name].destroy();
  delete tasks[name];
  delete documents[name];
};
</script></body></html>`;

const save = (file, dataUrl) =>
  fs.writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const job = JSON.parse(fs.readFileSync(process.argv.at(-1), "utf8"));
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "inkleaf-render-"));
  const page = path.join(temporary, "viewer.html");
  fs.writeFileSync(page, viewer);
  const reader = new BrowserWindow({
    show: false,
    webPreferences: { webSecurity: false, backgroundThrottling: false },
  });
  const run = (code) => reader.webContents.executeJavaScript(code);
  try {
    await reader.loadFile(page);
    await run("window.boot");
    fs.mkdirSync(job.out, { recursive: true });
    const width = job.width || 1240;
    for (const item of job.items) {
      const name = JSON.stringify(item.name);
      const count = await run(
        `window.load(${name}, ${JSON.stringify(fileUrl(item.pdf))})`,
      );
      for (let number = 1; number <= count; number++) {
        const suffix = String(number).padStart(2, "0");
        const colour = await run(
          `window.page(${name}, ${number}, ${width}, false)`,
        );
        if (item.pages)
          save(path.join(job.out, `${item.name}-${suffix}.png`), colour);
        if (item.grayPages)
          save(
            path.join(job.out, `${item.name}-gray-${suffix}.png`),
            await run(`window.page(${name}, ${number}, ${width}, true)`),
          );
      }
      const columns = job.sheetColumns || 4;
      if (item.sheet)
        save(
          path.join(job.out, `${item.name}-sheet.png`),
          await run(`window.sheet(${name}, ${count}, ${columns}, 360, false)`),
        );
      if (item.graySheet)
        save(
          path.join(job.out, `${item.name}-gray-sheet.png`),
          await run(`window.sheet(${name}, ${count}, ${columns}, 360, true)`),
        );
      console.log(`${item.name}: ${count} pages rendered`);
      await run(`window.release(${name})`);
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    reader.destroy();
    fs.rmSync(temporary, { recursive: true, force: true });
    app.quit();
  }
});
