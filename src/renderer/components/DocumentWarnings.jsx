export default function DocumentWarnings({ preview, t, detailsRef }) {
  const images = preview?.warnings || [];
  const layout = preview?.layoutWarnings || [];
  const source = preview?.sourceDiagnostics || [];
  if (!images.length && !layout.length && !source.length) return null;
  return (
    <details className="preview-warnings" ref={detailsRef}>
      <summary>
        {images.length + layout.length + source.length}{" "}
        {t(
          layout.length || source.length ? "documentWarnings" : "imageWarnings",
        )}
      </summary>
      {source.map(({ ruleId, key, line, endLine, status }) => (
        <p key={`${ruleId}-${line}`} data-source-status={status}>
          {line
            ? `${t("sourceLine")} ${line}${endLine > line ? `–${endLine}` : ""} · `
            : ""}
          {t(key)}
        </p>
      ))}
      {layout.map(({ key }) => (
        <p key={key}>{t(key)}</p>
      ))}
      {images.map((image) => (
        <p key={image}>
          <strong>
            {t(
              preview.imageWarnings?.find((issue) => issue.source === image)
                ?.key || "imageLoadFailed",
            )}
          </strong>
          <br />
          {image.startsWith("data:") ? t("embeddedImage") : image}
        </p>
      ))}
    </details>
  );
}
