// Rasterises the Inkleaf SVG masters into the PNG ladder and packs the .ico and
// .icns containers. Chromium does the drawing, so what ships matches what a
// browser shows. Run from the repo root:
//     npx electron resources/icons/tools/rasterize.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('high-dpi-support', '1');

const OUT = path.resolve(process.env.INKLEAF_ICON_DIR || path.join('resources', 'icons'));
let win = null;

function page(svg, size) {
  const sized = svg.replace(/width="\d+"/, `width="${size}"`).replace(/height="\d+"/, `height="${size}"`);
  return `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}
svg{display:block;width:${size}px;height:${size}px}</style>${sized}`;
}

async function shoot(svg, size, file) {
  const tmp = path.join(os.tmpdir(), `inkleaf-${size}.html`);
  fs.writeFileSync(tmp, page(svg, size), 'utf8');
  // Windows enforces a minimum window size, so small icons are drawn at their
  // true pixel size inside a larger canvas and cropped back out.
  const canvas = Math.max(size, 160);
  win.setContentSize(canvas, canvas);
  await win.loadFile(tmp);
  await new Promise((r) => setTimeout(r, 150));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  const png = img.toPNG();
  fs.writeFileSync(path.join(OUT, file), png);
  fs.unlinkSync(tmp);
  return { size, file };
}

// ICO: 6-byte header, one 16-byte directory entry per image, then PNG payloads.
function buildIco(entries) {
  const imgs = entries.map((e) => ({ size: e.size, data: fs.readFileSync(path.join(OUT, e.file)) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(imgs.length, 4);
  const dir = Buffer.alloc(16 * imgs.length);
  let offset = 6 + 16 * imgs.length;
  imgs.forEach((im, i) => {
    const b = 16 * i;
    const dim = im.size >= 256 ? 0 : im.size;
    dir.writeUInt8(dim, b);
    dir.writeUInt8(dim, b + 1);
    dir.writeUInt16LE(1, b + 4);
    dir.writeUInt16LE(32, b + 6);
    dir.writeUInt32LE(im.data.length, b + 8);
    dir.writeUInt32LE(offset, b + 12);
    offset += im.data.length;
  });
  return Buffer.concat([header, dir, ...imgs.map((im) => im.data)]);
}

// ICNS: 'icns' magic, total length, then a type + length + PNG per entry.
function buildIcns(bySize) {
  const map = [['ic11', 32], ['ic12', 64], ['ic07', 128], ['ic13', 256],
               ['ic08', 256], ['ic14', 512], ['ic09', 512], ['ic10', 1024]];
  const chunks = [];
  for (const [type, size] of map) {
    const data = fs.readFileSync(path.join(OUT, bySize[size]));
    const head = Buffer.alloc(8);
    head.write(type, 0, 4, 'ascii');
    head.writeUInt32BE(data.length + 8, 4);
    chunks.push(head, data);
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}

app.whenReady().then(async () => {
  win = new BrowserWindow({
    width: 1024, height: 1024, useContentSize: true, show: false, frame: false,
    transparent: true, backgroundColor: '#00000000',
    webPreferences: { backgroundThrottling: false },
  });

  const read = (f) => fs.readFileSync(path.join(OUT, f), 'utf8');
  const master = read('inkleaf.svg');
  const small = read('inkleaf-small.svg');
  const tray = read('inkleaf-tray.svg');

  const made = [];
  for (const s of [1024, 512, 256, 128, 64, 48, 32, 24, 16]) {
    made.push(await shoot(s <= 24 ? small : master, s, `inkleaf-${s}.png`));
    console.log('icon', s, s <= 24 ? '(small master)' : '');
  }

  for (const [name, colour] of [['dark', '#30343B'], ['light', '#E8E6E1']]) {
    const svg = tray.replace(/currentColor/g, colour);
    for (const s of [16, 32, 48]) {
      await shoot(svg, s, `tray-${name}-${s}.png`);
      console.log('tray', name, s);
    }
  }

  const icoSizes = new Set([256, 128, 64, 48, 32, 24, 16]);
  fs.writeFileSync(path.join(OUT, 'inkleaf.ico'), buildIco(made.filter((m) => icoSizes.has(m.size))));
  fs.writeFileSync(path.join(OUT, 'inkleaf.icns'),
                   buildIcns(Object.fromEntries(made.map((m) => [m.size, m.file]))));
  console.log('packed inkleaf.ico and inkleaf.icns');

  win.destroy();
  app.quit();
}).catch((e) => { console.error(e); app.exit(1); });
