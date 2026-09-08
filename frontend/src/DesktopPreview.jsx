import { useEffect, useRef } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { addLinkLayer, destinationLocation } from "./pdf-links.js";

GlobalWorkerOptions.workerSrc = workerUrl;

const message = (error) =>
  error.message.replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    "",
  );

export function Icon({ name, size = 20 }) {
  const paths = {
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
    file: (
      <>
        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <path d="M14 3v6h6M8 13h8M8 17h5" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5" />
        <path d="M19 12a7 7 0 1 0-2 5" />
      </>
    ),
    folderAdd: (
      <>
        <path d="M3 7V5h6l2 2h10v13H3z" />
        <path d="M12 11v6m-3-3h6" />
      </>
    ),
    open: (
      <>
        <path d="M14 3H5v18h14v-9M14 3h7v7M21 3l-9 9" />
      </>
    ),
    folder: <path d="M3 7V5h6l2 2h10v13H3z" />,
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" />
        <circle cx="16" cy="17" r="3" />
      </>
    ),
    back: <path d="m14 6-6 6 6 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    arrow: <path d="M7 17 17 7M7 7h10v10" />,
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function PdfPreview({
  data,
  onReady,
  onError,
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
            labels: { internal: internalLinkLabel, external: externalLinkLabel },
            onError,
            active: () => !cancelled,
          });
        } catch (error) {
          if (!cancelled) onError(message(error));
        }
      }
      finishRendering();
      if (!cancelled) onReady(pdf.numPages);
    })().catch((error) => {
      finishRendering();
      if (!cancelled) onError(message(error));
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
