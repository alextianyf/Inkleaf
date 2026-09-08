import { useState } from "react";
import { getErrorMessage } from "../lib/errors.js";

const api = window.aldus;

export default function UpdateControls({ update, t }) {
  const [error, setError] = useState("");
  const labels = {
    idle: "updateIdle",
    checking: "checking",
    available: "updateAvailable",
    current: "updateCurrent",
    unpublished: "updateUnpublished",
    offline: "updateOffline",
    downloading: "updateDownloading",
    downloaded: "updateReady",
    waiting: "updateWaiting",
    installing: "updateInstalling",
    unsupported: "updateUnsupported",
  };
  let label = t(labels[update.status] || "updateIdle");
  if (update.status === "downloading") label += ` ${update.percent || 0}%`;
  if (update.status === "error") {
    label = t(
      update.phase === "install"
        ? "updateInstallFailed"
        : "updateDownloadFailed",
    );
  }
  const disabled = [
    "checking",
    "downloading",
    "waiting",
    "installing",
    "unsupported",
  ].includes(update.status);

  async function act(cancel = false) {
    setError("");
    try {
      if (cancel) await api.cancelUpdateInstall();
      else if (update.downloaded) await api.installUpdate();
      else if (update.status === "available" || update.phase === "download")
        await api.downloadUpdate();
      else await api.checkUpdates();
    } catch (error) {
      setError(getErrorMessage(error));
    }
  }

  return (
    <div className="update-controls">
      <div className="update-actions">
        <button
          className="text-button"
          disabled={disabled}
          onClick={() => act()}
        >
          {label}
        </button>
        {update.status === "waiting" && (
          <button className="text-button" onClick={() => act(true)}>
            {t("updateCancelWait")}
          </button>
        )}
      </div>
      {update.status === "downloading" && (
        <progress
          aria-label={t("updateDownloading")}
          max="100"
          value={update.percent || 0}
        />
      )}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
