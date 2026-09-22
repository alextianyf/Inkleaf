import { useState } from "react";
import { Icon } from "./Icon.jsx";

export default function PreviewIssues({ preview, error, detailsRef, t }) {
  const [dismissed, setDismissed] = useState(null);
  const count =
    (preview?.warnings?.length || 0) +
    (preview?.layoutWarnings?.length || 0) +
    (preview?.sourceDiagnostics || []).filter(
      (item) => item.status === "warning",
    ).length;

  function showDetails() {
    const details = detailsRef.current;
    if (!details) return;
    details.open = true;
    details.querySelector("summary")?.focus();
  }

  if (error)
    return (
      <div className="preview-issue-notice error-message" role="alert">
        <Icon name="info" size={22} />
        <div>
          <strong>{t("operationFailed")}</strong>
          <p>{error}</p>
        </div>
      </div>
    );
  if (!count || dismissed === preview?.id) return null;
  return (
    <div className="preview-issue-notice" role="status" aria-live="polite">
      <Icon name="info" size={22} />
      <div>
        <strong>{t("previewNeedsReview")}</strong>
        <p>{t("previewIssuesSummary").replace("{count}", count)}</p>
        <button className="text-button" onClick={showDetails}>
          {t("viewIssueDetails")}
        </button>
      </div>
      <button
        className="text-button"
        aria-label={t("dismissIssueNotice")}
        onClick={() => setDismissed(preview.id)}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
