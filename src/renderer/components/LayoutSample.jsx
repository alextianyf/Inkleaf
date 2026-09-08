import { useEffect, useState } from "react";
import { PdfPreview } from "./PdfPreview.jsx";
import defaults from "../../shared/preferences.json";
import { getErrorMessage } from "../lib/errors.js";

export default function LayoutSample({ config, t, queue }) {
  const [preview, setPreview] = useState(null);
  const [finished, setFinished] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify({
    language: config.language,
    ...Object.fromEntries(
      Object.keys(defaults.layout).map((name) => [name, config[name]]),
    ),
  });
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      // One sample render at a time. Superseded inputs never enter the renderer.
      queue.current = queue.current
        .catch(() => {})
        .then(async () => {
          if (!active) return;
          try {
            const result = await window.aldus.samplePreview(JSON.parse(key));
            if (active) {
              setPreview(result);
              setFinished(key);
              setError("");
            }
          } catch (e) {
            if (active) {
              setError(getErrorMessage(e));
              setFinished(key);
            }
          }
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, queue, retry]);
  return (
    <aside className="layout-sample" aria-label={t("sampleDocument")}>
      <div className="sample-heading">
        <strong>{t("sampleDocument")}</strong>
        <span>{finished !== key ? t("rendering") : t("sampleHint")}</span>
      </div>
      {error && (
        <div className="error-message" role="alert">
          {error}{" "}
          <button
            className="text-button"
            onClick={() => setRetry((value) => value + 1)}
          >
            {t("retryPreview")}
          </button>
        </div>
      )}
      <div className="preview-content" aria-busy={finished !== key}>
        {preview ? (
          <PdfPreview
            data={preview.data}
            internalLinkLabel={t("previewJumpLink")}
            externalLinkLabel={t("previewOpenLink")}
            unavailableLinkLabel={t("previewLinkUnavailable")}
            onError={setError}
          />
        ) : (
          <div className="loading-state">
            <span className="spinner" />
            {t("rendering")}
          </div>
        )}
      </div>
    </aside>
  );
}
