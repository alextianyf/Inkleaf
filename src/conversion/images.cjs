const fs = require("node:fs/promises");
const path = require("node:path");
const https = require("node:https");
const dns = require("node:dns").promises;
const { BlockList } = require("node:net");
const sanitize = require("sanitize-html");

const MAX_BYTES = 15 * 1024 * 1024;
const cache = new Map();
let cacheBytes = 0;
const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["224.0.0.0", 3],
])
  blocked.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
])
  blocked.addSubnet(network, prefix, "ipv6");

async function download(url, signal, redirects = 0) {
  const target = new URL(url);
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    (target.port && target.port !== "443")
  )
    throw new Error("Only public HTTPS images are supported");
  signal.throwIfAborted();
  let abort;
  let addresses;
  try {
    addresses = await Promise.race([
      dns.lookup(target.hostname.replace(/^\[|\]$/g, ""), { all: true }),
      new Promise((_, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
  if (
    !addresses.length ||
    addresses.some(({ address, family }) =>
      blocked.check(address, family === 6 ? "ipv6" : "ipv4"),
    )
  )
    throw new Error("Private image address");
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    // Pin the checked address to this request, including every redirect.
    const request = https.get(
      target,
      {
        signal,
        headers: { Accept: "image/svg+xml,image/*", "User-Agent": "Aldus" },
        lookup: (_host, options, callback) =>
          options.all
            ? callback(null, addresses)
            : callback(null, addresses[0].address, addresses[0].family),
      },
      (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          response.destroy();
          if (redirects >= 4 || !response.headers.location)
            return reject(new Error("Too many redirects"));
          try {
            resolve(
              download(
                new URL(response.headers.location, target),
                signal,
                redirects + 1,
              ),
            );
          } catch (error) {
            reject(error);
          }
          return;
        }
        if (
          response.statusCode !== 200 ||
          Number(response.headers["content-length"]) > MAX_BYTES
        ) {
          response.destroy();
          reject(new Error("Image unavailable or too large"));
          return;
        }
        const chunks = [];
        let bytes = 0;
        response.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > MAX_BYTES) response.destroy(new Error("Image too large"));
          else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => resolve(Buffer.concat(chunks)));
      },
    );
    request.on("error", reject);
  });
}

async function remoteImage(url) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.time < 300000) return cached.data;
  const data = await download(url, AbortSignal.timeout(10000));
  if (cached) {
    cacheBytes -= cached.data.length;
    cache.delete(url);
  }
  cache.set(url, { data, time: Date.now() });
  cacheBytes += data.length;
  while (cache.size > 128 || cacheBytes > 32 * 1024 * 1024) {
    const key = cache.keys().next().value;
    cacheBytes -= cache.get(key).data.length;
    cache.delete(key);
  }
  return data;
}

function embedImage(buffer, depth = 0) {
  if (depth > 3) throw new Error("Nested image limit");
  if (buffer.length > MAX_BYTES) throw new Error("Image too large");
  let mime,
    badge = false;
  if (buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
    mime = "png";
  else if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
    mime = "jpeg";
  else if (/^GIF8[79]a/.test(buffer.subarray(0, 6).toString())) mime = "gif";
  else if (
    buffer.subarray(0, 4).toString() === "RIFF" &&
    buffer.subarray(8, 12).toString() === "WEBP"
  )
    mime = "webp";
  else if (/<svg[\s>]/i.test(buffer.toString("utf8", 0, 4096))) {
    mime = "svg+xml";
    const source = buffer.toString("utf8");
    const svg = sanitize(source, {
      allowedTags: [
        "svg",
        "g",
        "path",
        "rect",
        "circle",
        "ellipse",
        "line",
        "polyline",
        "polygon",
        "text",
        "tspan",
        "defs",
        "linearGradient",
        "radialGradient",
        "stop",
        "clipPath",
        "mask",
        "title",
        "desc",
        "use",
        "image",
      ],
      allowedAttributes: {
        "*": [
          "id",
          "xmlns",
          "xmlns:xlink",
          "width",
          "height",
          "viewBox",
          "preserveAspectRatio",
          "x",
          "y",
          "x1",
          "x2",
          "y1",
          "y2",
          "cx",
          "cy",
          "r",
          "rx",
          "ry",
          "d",
          "points",
          "fill",
          "fill-opacity",
          "fill-rule",
          "stroke",
          "stroke-width",
          "stroke-opacity",
          "stroke-linecap",
          "stroke-linejoin",
          "opacity",
          "transform",
          "clip-path",
          "mask",
          "offset",
          "stop-color",
          "stop-opacity",
          "gradientUnits",
          "gradientTransform",
          "font-family",
          "font-size",
          "font-weight",
          "text-anchor",
          "dominant-baseline",
          "textLength",
          "lengthAdjust",
          "dx",
          "dy",
          "href",
          "xlink:href",
        ],
      },
      allowedSchemesByTag: { image: ["data"] },
      parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
      transformTags: {
        "*": (tagName, attrs) => {
          for (const [key, value] of Object.entries(attrs)) {
            if (
              (key === "href" || key === "xlink:href") &&
              !/^#[\w:.-]+$/.test(value)
            ) {
              if (
                tagName === "image" &&
                /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/i.test(value)
              ) {
                try {
                  attrs[key] = embedImage(
                    Buffer.from(value.slice(value.indexOf(",") + 1), "base64"),
                    depth + 1,
                  ).src;
                } catch {
                  delete attrs[key];
                }
              } else delete attrs[key];
            }
            if (/url\s*\(/i.test(value) && !/^url\(#[\w:.-]+\)$/.test(value))
              delete attrs[key];
          }
          return { tagName, attribs: attrs };
        },
      },
    });
    const opening = svg.match(/<svg\b[^>]*>/)?.[0] || "";
    const width = Number(opening.match(/\bwidth="([\d.]+)(?:px)?"/)?.[1]);
    const height = Number(opening.match(/\bheight="([\d.]+)(?:px)?"/)?.[1]);
    badge = height > 0 && height <= 40 && width >= height * 2;
    buffer = Buffer.from(svg);
  } else throw new Error("Unsupported image");
  return {
    src: `data:image/${mime};base64,${buffer.toString("base64")}`,
    badge,
  };
}

async function resolveImages(sources, base, loader = remoteImage) {
  const result = new Map();
  let position = 0;
  // Bound work per document and keep networking off the renderer.
  const unique = [...new Set(sources)].slice(0, 100);
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (position < unique.length) {
        const src = unique[position++];
        try {
          let data;
          if (/^https:\/\//i.test(src) || src.startsWith("//"))
            data = await loader(src.startsWith("//") ? `https:${src}` : src);
          else if (
            /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/i.test(src)
          )
            data = Buffer.from(src.slice(src.indexOf(",") + 1), "base64");
          else {
            if (/^[a-z]+:/i.test(src)) throw new Error("Unsupported URL");
            const local = await fs.realpath(
              path.resolve(base, decodeURIComponent(src)),
            );
            const relative = path.relative(base, local);
            if (
              relative === ".." ||
              relative.startsWith(`..${path.sep}`) ||
              path.isAbsolute(relative)
            )
              throw new Error("Outside document folder");
            if ((await fs.stat(local)).size > MAX_BYTES)
              throw new Error("Image too large");
            data = await fs.readFile(local);
          }
          result.set(src, embedImage(data));
        } catch {
          result.set(src, null);
        }
      }
    }),
  );
  return result;
}
module.exports = { resolveImages, embedImage, remoteImage };
