import { Icon } from "./Icon.jsx";

export default function ExportNotice({ detail, t, onDismiss }) {
  return (
    <div className="export-notice" role="status" aria-live="polite">
      <Icon name="check" size={22} />
      <div>
        <strong>{t("exportSuccess")}</strong>
        <span title={detail}>{detail}</span>
      </div>
      {onDismiss && (
        <button
          className="text-button"
          aria-label={t("dismissExportSuccess")}
          onClick={onDismiss}
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
