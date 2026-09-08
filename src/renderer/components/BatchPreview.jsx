import preferenceDefaults from "../../shared/preferences.json";
import DocumentWarnings from "./DocumentWarnings.jsx";
import { useEffect, useRef, useState } from "react";
import { PdfPreview } from "./PdfPreview.jsx";
import { Icon } from "./Icon.jsx";
import { getErrorMessage } from "../lib/errors.js";

const api = window.aldus;

export default function BatchPreview({ folder, config, t, onBack, onWorking }) {
  const [recursive, setRecursive] = useState(true);
  const [revision, setRevision] = useState(0);
  const [listing, setListing] = useState({ files: [], busy: false });
  const [checked, setChecked] = useState(new Set());
  const [current, setCurrent] = useState(null);
  const [preview, setPreview] = useState(null);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [finishedKey, setFinishedKey] = useState("");
  const previewId = useRef(null);
  const renderKey = JSON.stringify([
    current?.path,
    ...Object.keys(preferenceDefaults.layout).map((key) => config[key]),
  ]);
  const previewPending = Boolean(current) && finishedKey !== renderKey;
  const locked =
    loading || rendering || previewPending || starting || Boolean(job?.running);
  useEffect(() => {
    onWorking(locked);
  }, [locked, onWorking]);
  useEffect(
    () => () => {
      onWorking(false);
      if (previewId.current) void api.discard(previewId.current);
    },
    [onWorking],
  );

  useEffect(() => {
    let active = true;
    api
      .folder(folder.path, recursive)
      .then((next) => {
        if (!active) return;
        setListing(next);
        setChecked(new Set(next.files.map((file) => file.path)));
        setCurrent(next.files[0] || null);
        setRendering(next.files.length > 0);
        setLoading(false);
      })
      .catch((e) => {
        if (active) {
          setError(getErrorMessage(e));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [folder.path, recursive, revision]);

  useEffect(() => {
    if (!current || job?.running) return;
    let active = true;
    // Selection is disabled while rendering, so a new preview cannot race this one.
    api
      .preview(current.path)
      .then((next) => {
        if (!active) {
          void api.discard(next.id);
          return;
        }
        previewId.current = next.id;
        setPreview(next);
        setPages(0);
      })
      .catch((e) => {
        if (active) setError(getErrorMessage(e));
      })
      .finally(() => {
        if (active) {
          setRendering(false);
          setFinishedKey(renderKey);
        }
      });
    return () => {
      active = false;
    };
  }, [current, renderKey, job?.running]);

  useEffect(
    () =>
      api.onBatchProgress((next) =>
        setJob((previous) => {
          const entries = new Map(
            (previous?.id === next.id ? previous.entries : []).map((entry) => [
              entry.path,
              entry,
            ]),
          );
          for (const entry of next.entries) entries.set(entry.path, entry);
          return { ...next, entries: [...entries.values()] };
        }),
      ),
    [],
  );

  function select(file) {
    if (locked) return;
    setRendering(true);
    setPreview(null);
    setPages(0);
    setError("");
    setCurrent({ ...file });
  }
  function reload(value = recursive) {
    setLoading(true);
    setRendering(false);
    setPreview(null);
    setCurrent(null);
    setJob(null);
    setError("");
    setRecursive(value);
    setRevision((value) => value + 1);
  }
  async function start(paths = [...checked]) {
    if (locked || !paths.length) return;
    setStarting(true);
    setError("");
    try {
      const next = await api.batchStart(folder.path, paths, recursive);
      if (next)
        setJob((previous) => (previous?.id === next.id ? previous : next));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setStarting(false);
    }
  }
  const statuses = new Map(
    (job?.entries || []).map((entry) => [entry.path, entry]),
  );
  const failed = (job?.entries || []).filter(
    (entry) => entry.status === "failed",
  );
  return (
    <>
      <div className="preview-topbar">
        <button
          className="icon-button"
          aria-label={t("back")}
          title={t("back")}
          onClick={onBack}
          disabled={locked}
        >
          <Icon name="back" size={16} />
        </button>
        <Icon name="folder" size={20} />
        <div className="preview-title">
          <strong title={folder.path}>{folder.name}</strong>
          <span>
            {listing.files.length} {t("markdownCount")} · {t("batchPreview")}
          </span>
        </div>
      </div>
      <div className="batch-workspace">
        <aside className="batch-files" aria-label={t("batchFiles")}>
          <div className="batch-options">
            <label>
              <input
                type="checkbox"
                checked={recursive}
                disabled={locked}
                onChange={(e) => reload(e.target.checked)}
              />
              {t("includeSubfolders")}
            </label>
            <div className="batch-selection">
              <label>
                <input
                  type="checkbox"
                  aria-label={t("selectAll")}
                  checked={
                    listing.files.length > 0 &&
                    checked.size === listing.files.length
                  }
                  disabled={locked}
                  onChange={(e) =>
                    setChecked(
                      new Set(
                        e.target.checked
                          ? listing.files.map((file) => file.path)
                          : [],
                      ),
                    )
                  }
                />
                {t("selectAll")}
              </label>
              <button
                className="icon-button"
                title={t("refreshList")}
                aria-label={t("refreshList")}
                disabled={locked}
                onClick={() => reload()}
              >
                <Icon name="refresh" size={14} />
              </button>
            </div>
          </div>
          <div className="batch-list">
            {listing.files.map((entry) => {
              const state = statuses.get(entry.path);
              return (
                <div
                  key={entry.path}
                  className={`batch-file ${current?.path === entry.path ? "selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    aria-label={`${t("select")} ${entry.relative}`}
                    checked={checked.has(entry.path)}
                    disabled={locked}
                    onChange={(e) =>
                      setChecked((previous) => {
                        const next = new Set(previous);
                        if (e.target.checked) next.add(entry.path);
                        else next.delete(entry.path);
                        return next;
                      })
                    }
                  />
                  <button
                    className="batch-file-button"
                    disabled={locked}
                    onClick={() => select(entry)}
                    title={state?.error || entry.relative}
                  >
                    <span>{entry.name}</span>
                    <small>{entry.relative}</small>
                    {state && (
                      <small className={`batch-status status-${state.status}`}>
                        {t(`batch_${state.status}`)}
                        {state.error ? ` · ${state.error}` : ""}
                      </small>
                    )}
                  </button>
                </div>
              );
            })}
            {!loading && !listing.files.length && (
              <p className="muted batch-empty">{t("noMatch")}</p>
            )}
          </div>
          <p className="muted batch-scope">
            {t(listing.busy ? "batchIndexing" : "batchScope")}
          </p>
        </aside>
        <div className="batch-document">
          <div className="batch-document-title">
            <strong>{current?.name || t("batchChooseFile")}</strong>
            {pages > 0 && (
              <span>
                {pages} {t("page")}
              </span>
            )}
          </div>
          <div
            className="preview-content"
            aria-busy={loading || rendering || previewPending}
          >
            {(loading || rendering || previewPending) && (
              <div className={preview ? "render-indicator" : "loading-state"}>
                <span className="spinner" />
                {t(loading ? "searching" : "rendering")}
              </div>
            )}
            {preview && (
              <PdfPreview
                data={preview.data}
                internalLinkLabel={t("previewJumpLink")}
                externalLinkLabel={t("previewOpenLink")}
                unavailableLinkLabel={t("previewLinkUnavailable")}
                onReady={setPages}
                onError={setError}
              />
            )}
            {!loading && !rendering && !preview && current && (
              <div className="loading-state">
                <button className="text-button" onClick={() => select(current)}>
                  {t("retry")}
                </button>
              </div>
            )}
          </div>
          <DocumentWarnings preview={preview} t={t} />
        </div>
      </div>
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      <footer className="batch-footer">
        <div className="batch-summary" role="status">
          {job ? (
            <>
              <span>
                {job.completed} / {job.total} {t("batch_done")}
                {job.failed > 0 && ` · ${job.failed} ${t("batch_failed")}`}
                {job.cancelled && ` · ${t("batch_cancelled")}`}
              </span>
              {job.running && (
                <progress value={job.completed + job.failed} max={job.total} />
              )}
            </>
          ) : (
            <>
              <span>
                {checked.size} {t("batchSelected")}
              </span>
              <small>{t("batchOutputHint")}</small>
            </>
          )}
        </div>
        {job?.running ? (
          <button
            className="text-button"
            disabled={job.cancelled}
            onClick={() =>
              api.batchCancel(job.id).catch((e) => setError(getErrorMessage(e)))
            }
          >
            {t("cancelBatch")}
          </button>
        ) : (
          <>
            {job && (
              <button
                className="text-button"
                onClick={() =>
                  api
                    .batchOpenOutput(job.id)
                    .catch((e) => setError(getErrorMessage(e)))
                }
              >
                {t("openOutput")}
              </button>
            )}
            {failed.length > 0 && (
              <button
                className="text-button"
                disabled={locked}
                onClick={() => start(failed.map((entry) => entry.path))}
              >
                {t("retryFailed")}
              </button>
            )}
            <button
              className="primary-button"
              disabled={locked || !checked.size}
              onClick={() => start()}
            >
              <Icon name="download" size={15} />
              {t("batchExport")} {checked.size} PDF
            </button>
          </>
        )}
      </footer>
    </>
  );
}
