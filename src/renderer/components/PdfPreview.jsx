import { useEffect, useRef } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { addLinkLayer, destinationLocation } from "../lib/pdf-links.js";
import { getErrorMessage } from "../lib/errors.js";

GlobalWorkerOptions.workerSrc = workerUrl;

const ignore = () => {};

export function PdfPreview({
  data,
  onReady = ignore,
  onError = ignore,
  internalLinkLabel,
  externalLinkLabel,
  unavailableLinkLabel,
}) {
  const container = useRef(null);
  useEffect(() => {
    let cancelled = false;
    const tasks = [];
    const pageViews = [];
    let finishRendering;
    const rendered = new Promise((resolve) => {
      finishRendering = resolve;
    });
    const loading = getDocument({
      data: new Uint8Array(data),
      isEvalSupported: false,
    });
    const host = container.current;
    host.replaceChildren();
    (async () => {
      const pdf = await loading.promise;
      async function navigate(destination) {
        const location = await destinationLocation(pdf, destination);
        await rendered;
        if (cancelled) return;
        if (!location || !pageViews[location.index])
          throw new Error(unavailableLinkLabel);
        const { surface, viewport } = pageViews[location.index];
        const scroller = host.closest(".preview-content");
        const target = surface.getBoundingClientRect();
        const localY =
          location.top === null
            ? 0
            : viewport.convertToViewportPoint(
                viewport.viewBox[0],
                location.top,
              )[1];
        const offset =
          (Math.max(0, Math.min(viewport.height, localY)) / viewport.height) *
          target.height;
        scroller.scrollTo({
          top:
            scroller.scrollTop +
            target.top -
            scroller.getBoundingClientRect().top +
            offset -
            12,
          behavior: "auto",
        });
        surface.focus({ preventScroll: true });
      }
      for (let number = 1; number <= pdf.numPages; number++) {
        if (cancelled) return;
        const page = await pdf.getPage(number);
        const viewport = page.getViewport({ scale: 1.35 });
        const canvas = document.createElement("canvas");
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = viewport.width * ratio;
        canvas.height = viewport.height * ratio;
        canvas.setAttribute("aria-label", `${number} / ${pdf.numPages}`);
        canvas.setAttribute("role", "img");
        const section = document.createElement("section");
        section.className = "pdf-page";
        section.dataset.pageNumber = number;
        const surface = document.createElement("div");
        surface.className = "pdf-page-surface";
        surface.tabIndex = -1;
        const label = document.createElement("span");
        label.className = "page-number";
        label.textContent = `${number} / ${pdf.numPages}`;
        surface.append(canvas);
        section.append(surface, label);
        host.append(section);
        pageViews.push({ surface, viewport });
        const task = page.render({
          canvasContext: canvas.getContext("2d"),
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0],
        });
        tasks.push(task);
        await task.promise;
        try {
          await addLinkLayer({
            page,
            viewport,
            surface,
            navigate,
            labels: {
              internal: internalLinkLabel,
              external: externalLinkLabel,
            },
            onError,
            active: () => !cancelled,
          });
        } catch (error) {
          if (!cancelled) onError(getErrorMessage(error));
        }
      }
      finishRendering();
      if (!cancelled) onReady(pdf.numPages);
    })().catch((error) => {
      finishRendering();
      if (!cancelled) onError(getErrorMessage(error));
    });
    return () => {
      cancelled = true;
      finishRendering();
      tasks.forEach((task) => task.cancel());
      void loading.destroy();
    };
  }, [
    data,
    onReady,
    onError,
    internalLinkLabel,
    externalLinkLabel,
    unavailableLinkLabel,
  ]);
  return <div className="pdf-pages" ref={container} aria-label="PDF" />;
}
