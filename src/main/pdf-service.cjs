const { BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const { layoutKey } = require("../conversion/layout.cjs");
const { buildDocument } = require("../conversion/document.cjs");

class PdfService {
  constructor(documents, translate) {
    this.documents = documents;
    this.translate = translate;
    this.cache = new Map();
    this.busy = false;
  }
  async render(file, options) {
    if (this.busy) throw new Error(this.translate("renderBusy"));
    const id = randomUUID();
    let printer;
    this.busy = true;
    try {
      const stat = await fs.stat(file);
      const cacheKey = JSON.stringify([
        file,
        stat.mtimeMs,
        stat.size,
        layoutKey(options),
        options.language,
      ]);
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.created < 60000) return cached;
      const document = await buildDocument(file, options);
      this.documents.set(id, document.html);
      printer = new BrowserWindow({
        show: false,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      printer.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      printer.webContents.on("will-navigate", (event) =>
        event.preventDefault(),
      );
      await printer.loadURL(`aldus://document/${id}`);
      const missing = await printer.webContents.executeJavaScript(
        `async function waitForAssets() {
          await document.fonts.ready;
          return Promise.all(Array.from(document.images, async (image) => {
            try {
              await image.decode();
              return null;
            } catch {
              return image.alt || "image";
            }
          }));
        }
        waitForAssets();`,
      );
      document.warnings.push(...missing.filter(Boolean));
      const data = await printer.webContents.printToPDF({
        pageSize: options.paperSize || "A4",
        landscape: options.orientation === "landscape",
        printBackground: true,
        preferCSSPageSize: true,
        margins: { top: 0.79, bottom: 0.98, left: 0.79, right: 0.79 },
        displayHeaderFooter: options.pageNumbers,
        headerTemplate: "<span></span>",
        footerTemplate:
          '<div style="width:100%;text-align:center;font-size:9px;color:#888"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      });
      const result = {
        id,
        data,
        created: Date.now(),
        warnings: document.warnings,
        layoutWarnings: document.layoutWarnings,
        sourceDiagnostics: document.sourceDiagnostics,
        theme: options.theme,
        paperSize: options.paperSize || "A4",
        layoutKey: layoutKey(options),
      };
      if (!document.warnings.length) {
        this.cache.set(cacheKey, result);
        let bytes = [...this.cache.values()].reduce(
          (sum, item) => sum + item.data.length,
          0,
        );
        while (this.cache.size > 8 || bytes > 64 * 1024 * 1024) {
          const key = this.cache.keys().next().value;
          bytes -= this.cache.get(key).data.length;
          this.cache.delete(key);
        }
      }
      return result;
    } catch (error) {
      if (error.code === "ENOENT")
        throw new Error(this.translate("fileMissing"));
      throw error;
    } finally {
      this.documents.delete(id);
      printer?.destroy();
      this.busy = false;
    }
  }
}
module.exports = { PdfService };
