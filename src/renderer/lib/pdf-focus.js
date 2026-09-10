// Locate preview targets in PDF coordinates, after printing has paginated them.
export async function findPreviewTarget(pdf, request) {
  const { target, margins = { top: 20, bottom: 25 } } = request;
  if (target === "pageBreak") {
    const page = await pdf.getPage(1);
    const y = 0;
    // Point at the actual page boundary in the controlled comparison.
    return {
      index: 0,
      y,
      line: [
        { transform: [1, 0, 0, 1, 40, y], width: page.view[2] - 80, height: 1 },
      ],
    };
  }
  const pages =
    target === "signature"
      ? Array.from({ length: pdf.numPages }, (_, i) => pdf.numPages - i)
      : Array.from({ length: pdf.numPages }, (_, i) => i + 1);
  for (const number of pages) {
    const page = await pdf.getPage(number);
    const { items } = await page.getTextContent();
    const [, , width, height] = page.view;
    const body = items.filter(
      (item) =>
        item.str &&
        item.transform[5] > (margins.bottom * 72) / 25.4 &&
        item.transform[5] < height - (margins.top * 72) / 25.4,
    );
    let selected;
    if (target === "signature")
      selected = body.find((item) => item.str.includes("©"));
    else if (target === "chapterExample")
      selected = body.find((item) => item.str.startsWith(request.text));
    else {
      const area = target === "pageNumber" ? request.area : target;
      const candidates = items.filter(
        (item) =>
          item.str &&
          (area === "header"
            ? item.transform[5] >= height - (margins.top * 72) / 25.4
            : item.transform[5] <= (margins.bottom * 72) / 25.4),
      );
      const anchor =
        { left: 0, center: width / 2, right: width }[request.position] ?? 0;
      candidates.sort(
        (a, b) =>
          Math.abs(a.transform[4] + a.width / 2 - anchor) -
          Math.abs(b.transform[4] + b.width / 2 - anchor),
      );
      selected = candidates[0];
    }
    if (!selected) continue;
    const line = items.filter(
      (item) =>
        item.str && Math.abs(item.transform[5] - selected.transform[5]) < 2,
    );
    const focusedLine = request.separateCells
      ? line.filter((item) => {
          const center = item.transform[4] + item.width / 2;
          const cell = Math.min(2, Math.floor(center / (width / 3)));
          return cell === { left: 0, center: 1, right: 2 }[request.position];
        })
      : line;
    return {
      index: number - 1,
      line: focusedLine.length ? focusedLine : [selected],
      y: selected.transform[5],
    };
  }
  return null;
}
