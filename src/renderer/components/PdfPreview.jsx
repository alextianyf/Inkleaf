import { useEffect, useRef } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { addLinkLayer, destinationLocation } from "../lib/pdf-links.js";
import { findPreviewTarget } from "../lib/pdf-focus.js";
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
  zoom = "fit",
  focusRequest = null,
}) {
  const container = useRef(null);
  const focusTarget = useRef(null);
  const requestedFocus = useRef(0);
  const appliedFocus = useRef(0);
  useEffect(() => {
    requestedFocus.current = focusRequest;
    if (!focusRequest) return;
    void focusTarget.current?.();
  }, [focusRequest]);
  useEffect(() => {
    let cancelled = false;
    appliedFocus.current = 0;
    let highlightTimer;
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
        if (zoom !== "fit") {
          section.style.width = `${page.getViewport({ scale: ((Number(zoom) / 100) * 96) / 72 }).width}px`;
          section.style.maxWidth = "none";
        }
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
      focusTarget.current = async () => {
        const request = requestedFocus.current;
        if (cancelled || !request || request.id === appliedFocus.current)
          return;
        try {
          const location = await findPreviewTarget(pdf, request);
          if (location && !cancelled && request === requestedFocus.current) {
            appliedFocus.current = request.id;
            const { surface, viewport } = pageViews[location.index];
            const scroller = host.closest(".preview-content");
            const y = viewport.convertToViewportPoint(0, location.y)[1];
            if (window.matchMedia("(max-width: 950px)").matches)
              host
                .closest(".layout-sample")
                ?.scrollIntoView({ block: "nearest" });
            const rect = surface.getBoundingClientRect();
            scroller.scrollTop +=
              rect.top -
              scroller.getBoundingClientRect().top +
              (y / viewport.height) * rect.height -
              scroller.clientHeight *
                (request.target === "pageBreak" ? 0.22 : 0.5);
            host.querySelector(".pdf-change-highlight")?.remove();
            clearTimeout(highlightTimer);
            if (request.target === "pageBreak") return;
            // A preview-only overlay: PDF pixels and exported bytes stay intact.
            const line = location.line;
            const left = Math.min(...line.map((item) => item.transform[4]));
            const right = Math.max(
              ...line.map((item) => item.transform[4] + item.width),
            );
            const x = viewport.convertToViewportPoint(left, location.y)[0];
            const height =
              Math.max(...line.map((item) => item.height)) * viewport.scale;
            const highlight = document.createElement("div");
            highlight.className = "pdf-change-highlight";
            highlight.setAttribute("aria-hidden", "true");
            highlight.style.left = `${(100 * (x - 6)) / viewport.width}%`;
            highlight.style.top = `${(100 * (y - height - 4)) / viewport.height}%`;
            highlight.style.width = `${(100 * ((right - left) * viewport.scale + 12)) / viewport.width}%`;
            highlight.style.height = `${(100 * (height + 10)) / viewport.height}%`;
            surface.append(highlight);
            highlightTimer = setTimeout(() => highlight.remove(), 3200);
          }
        } catch (error) {
          if (!cancelled) onError(getErrorMessage(error));
        }
      };
      if (!cancelled) void focusTarget.current();
      if (!cancelled) onReady(pdf.numPages);
    })().catch((error) => {
      finishRendering();
      if (!cancelled) onError(getErrorMessage(error));
    });
    return () => {
      cancelled = true;
      focusTarget.current = null;
      clearTimeout(highlightTimer);
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
    zoom,
  ]);
  return <div className="pdf-pages" ref={container} aria-label="PDF" />;
}
