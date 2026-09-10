import { useEffect, useMemo, useState } from "react";
import { PdfPreview } from "./PdfPreview.jsx";
import defaults from "../../shared/preferences.json";
import { getErrorMessage } from "../lib/errors.js";

export default function LayoutSample({ config, t, queue, focusRequest }) {
  const [preview, setPreview] = useState(null);
  const [finished, setFinished] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [zoom, setZoom] = useState("fit");
  const [dismissed, setDismissed] = useState(0);
  const [comparison, setComparison] = useState(null);
  const [chapterNotice, setChapterNotice] = useState(null);
  const target = focusRequest?.id !== dismissed ? focusRequest?.target : null;
  const chapterUnavailable =
    target === "chapterBreak" && config.chapterBreak === "none";
  const pagination = [
    "keepHeadings",
    "keepTables",
    "keepCodeBlocks",
    "avoidWidows",
    "repeatTableHeaders",
    "chapterBreak",
  ].includes(target);
  const enabled = chapterUnavailable
    ? false
    : comparison && comparison.id === focusRequest?.id
      ? comparison.enabled
      : target === "chapterBreak"
        ? config.chapterBreak !== "none"
        : Boolean(config[target]);
  const scenario = pagination ? { name: target, enabled } : null;
  const key = JSON.stringify({
    scenario,
    options: {
      language: config.language,
      ...Object.fromEntries(
        Object.keys(defaults.layout).map((name) => [name, config[name]]),
      ),
    },
  });
  const focus = useMemo(() => {
    if (
      !focusRequest ||
      finished !== key ||
      error ||
      dismissed === focusRequest.id
    )
      return null;
    if (pagination)
      return {
        id: `${focusRequest.id}-${enabled}`,
        target:
          focusRequest.target === "chapterBreak"
            ? "chapterExample"
            : "pageBreak",
        text:
          config.chapterBreak === "h1"
            ? config.language === "zh"
              ? "第二章"
              : "Chapter two"
            : config.language === "zh"
              ? "第二节"
              : "Second section",
        margins: preview?.previewMargins,
      };
    const area =
      focusRequest.target === "pageNumber"
        ? config.pageNumberArea
        : focusRequest.target;
    if (
      area === "signature" &&
      (!config.authorEnabled || !config.author.trim())
    )
      return null;
    if (focusRequest.target === "pageNumber" && !config.pageNumbers)
      return null;
    if (
      ["header", "footer"].includes(focusRequest.target) &&
      (!config[`${area}Enabled`] || !config[`${area}Text`].trim())
    )
      return null;
    return {
      ...focusRequest,
      area,
      position:
        focusRequest.target === "pageNumber"
          ? config.pageNumberPosition
          : config[`${area}Position`],
      margins: preview?.previewMargins,
      separateCells:
        config[`${area}Enabled`] &&
        config[`${area}Text`]?.trim() &&
        config.pageNumbers &&
        config.pageNumberArea === area &&
        config.pageNumberPosition !== config[`${area}Position`],
    };
  }, [
    focusRequest,
    pagination,
    finished,
    key,
    error,
    dismissed,
    config,
    preview,
    enabled,
  ]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      // One sample render at a time. Superseded inputs never enter the renderer.
      queue.current = queue.current
        .catch(() => {})
        .then(async () => {
          if (!active) return;
          try {
            const request = JSON.parse(key);
            const result = await window.aldus.samplePreview(
              request.options,
              request.scenario,
            );
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
        <strong>{pagination ? t(target) : t("sampleDocument")}</strong>
        <span>{finished !== key ? t("rendering") : t("sampleHint")}</span>
      </div>
      {scenario && (
        <div className="sample-comparison">
          {pagination && (
            <>
              <p>{t("comparisonHint")}</p>
              <div
                className="comparison-tabs"
                role="group"
                aria-label={t("comparePagination")}
              >
                {[false, true].map((value) => (
                  <button
                    key={String(value)}
                    aria-pressed={enabled === value}
                    onClick={() => {
                      if (value && chapterUnavailable) {
                        setChapterNotice(focusRequest.id);
                        return;
                      }
                      setChapterNotice(null);
                      setComparison({ id: focusRequest.id, enabled: value });
                    }}
                  >
                    {t(value ? "ruleOn" : "ruleOff")}
                  </button>
                ))}
              </div>
              {chapterUnavailable && chapterNotice === focusRequest.id && (
                <p className="comparison-notice" role="alert">
                  {t("chapterRuleUnavailable")}
                </p>
              )}
            </>
          )}
          <button
            className="text-button"
            onClick={() => setDismissed(focusRequest.id)}
          >
            {t("backToSample")}
          </button>
        </div>
      )}
      <div className="sample-toolbar">
        <label htmlFor="sample-zoom">{t("previewZoom")}</label>
        <select
          id="sample-zoom"
          value={zoom}
          onChange={(event) => setZoom(event.target.value)}
        >
          <option value="fit">{t("fitWidth")}</option>
          <option value="100">100%</option>
          <option value="125">125%</option>
          <option value="150">150%</option>
        </select>
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
            zoom={zoom}
            focusRequest={focus}
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
