const stages = [
  "previewReading",
  "previewLayout",
  "previewPrinting",
  "previewPages",
];

export default function PreviewProgress({ progress, t, compact = false }) {
  const step = Math.max(0, stages.indexOf(progress.stage));
  const fraction = progress.total ? progress.completed / progress.total : 0;
  const detail =
    step === 3 && progress.total
      ? t("previewPageProgress")
          .replace("{done}", progress.completed)
          .replace("{total}", progress.total)
      : t(stages[step]);
  return (
    <div
      className={
        compact
          ? "render-indicator preview-progress"
          : "loading-state preview-progress"
      }
    >
      <div className="preview-progress-heading">
        <strong>{t("rendering")}</strong>
        <span>{t("previewStep").replace("{step}", step + 1)}</span>
      </div>
      <progress
        aria-label={t("rendering")}
        aria-valuetext={detail}
        value={step + fraction}
        max={4}
      />
      <span className="preview-progress-detail" role="status">
        {detail}
      </span>
    </div>
  );
}
