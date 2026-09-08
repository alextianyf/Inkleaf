export async function destinationLocation(pdf, destination) {
  const dest =
    typeof destination === "string"
      ? await pdf.getDestination(destination)
      : destination;
  if (!Array.isArray(dest) || dest.length < 2) return null;
  const index =
    typeof dest[0] === "number" ? dest[0] : await pdf.getPageIndex(dest[0]);
  if (!Number.isInteger(index) || index < 0 || index >= pdf.numPages)
    return null;
  const type = dest[1]?.name;
  const top =
    type === "XYZ"
      ? dest[3]
      : ["FitH", "FitBH"].includes(type)
        ? dest[2]
        : type === "FitR"
          ? dest[5]
          : null;
  return { index, top: Number.isFinite(top) ? top : null };
}

function linkText(annotation, text) {
  if (annotation.contentsObj?.str) return annotation.contentsObj.str;
  const [x1, y1, x2, y2] = annotation.rect;
  return text.items
    .filter((item) => {
      if (!item.str || !item.transform) return false;
      const x = item.transform[4],
        y = item.transform[5];
      return x + item.width > x1 && x < x2 && y + item.height > y1 && y < y2;
    })
    .map((item) => item.str)
    .join("")
    .normalize("NFKC")
    .trim();
}

export async function addLinkLayer({
  page,
  viewport,
  surface,
  navigate,
  labels,
  onError,
  active,
}) {
  const annotations = (await page.getAnnotations({ intent: "display" })).filter(
    (item) =>
      item.subtype === "Link" &&
      Array.isArray(item.rect) &&
      !(item.annotationFlags & 34) &&
      (item.dest != null || /^https?:|^mailto:/i.test(item.url || "")),
  );
  if (!annotations.length || !active()) return;
  const text = await page.getTextContent();
  if (!active()) return;
  const layer = document.createElement("div");
  layer.className = "pdf-link-layer";
  for (const annotation of annotations) {
    const rect = [
      ...viewport.convertToViewportPoint(
        annotation.rect[0],
        annotation.rect[1],
      ),
      ...viewport.convertToViewportPoint(
        annotation.rect[2],
        annotation.rect[3],
      ),
    ];
    const left = Math.max(0, Math.min(rect[0], rect[2]));
    const top = Math.max(0, Math.min(rect[1], rect[3]));
    const right = Math.min(viewport.width, Math.max(rect[0], rect[2]));
    const bottom = Math.min(viewport.height, Math.max(rect[1], rect[3]));
    if (right <= left || bottom <= top) continue;
    const internal = annotation.dest != null;
    const link = document.createElement("a");
    link.className = "pdf-link";
    link.dataset.linkKind = internal ? "internal" : "external";
    const label =
      linkText(annotation, text) ||
      (internal ? labels.internal : labels.external);
    link.setAttribute("aria-label", label);
    link.title = internal ? label : `${label} · ${annotation.url}`;
    link.href = internal ? "#pdf-destination" : annotation.url;
    Object.assign(link.style, {
      left: `${(left / viewport.width) * 100}%`,
      top: `${(top / viewport.height) * 100}%`,
      width: `${((right - left) / viewport.width) * 100}%`,
      height: `${((bottom - top) / viewport.height) * 100}%`,
    });
    link.addEventListener("click", (event) => {
      event.preventDefault();
      if (!active()) return;
      const action = internal
        ? navigate(annotation.dest)
        : window.aldus.openLink(annotation.url);
      void action.catch((error) => {
        if (active()) onError(error.message);
      });
    });
    link.addEventListener("auxclick", (event) => event.preventDefault());
    layer.append(link);
  }
  surface.append(layer);
}
