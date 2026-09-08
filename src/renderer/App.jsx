import IconButton from "./components/IconButton.jsx";
import Brand from "./components/Brand.jsx";
import SearchResults from "./components/SearchResults.jsx";
import DocumentWarnings from "./components/DocumentWarnings.jsx";
import { useEffect, useRef, useState } from "react";
import { PdfPreview } from "./components/PdfPreview.jsx";
import { Icon } from "./components/Icon.jsx";
import BatchPreview from "./components/BatchPreview.jsx";
import UpdateControls from "./components/UpdateControls.jsx";
import { getErrorMessage } from "./lib/errors.js";
import preferenceDefaults from "../shared/preferences.json";
import strings from "../shared/strings.json";
import "./styles.css";

const api = window.aldus;

export default function DesktopApp() {
  const [config, setConfig] = useState(null);
  const [mode, setMode] = useState("search");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState({
    query: "",
    files: [],
    matches: 0,
    busy: false,
    warnings: [],
  });
  const [selected, setSelected] = useState(0);
  const [batchFolder, setBatchFolder] = useState(null);
  const [batchWorking, setBatchWorking] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pages, setPages] = useState(0);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [update, setUpdate] = useState({ status: "idle" });
  const input = useRef(null);
  const busyRef = useRef(false);
  const uiRef = useRef({ mode });
  const previewId = useRef(null);
  const previewQueue = useRef(Promise.resolve());
  const language =
    config?.language || (navigator.language.startsWith("zh") ? "zh" : "en");
  const t = (key) => strings[language][key];
  const hasQuery = Boolean(query.trim());
  const showUpdate = [
    "available",
    "downloading",
    "downloaded",
    "waiting",
    "installing",
    "error",
  ].includes(update.status);
  const files = hasQuery && result.query === query ? result.files : [];
  const selectedIndex = Math.min(selected, Math.max(files.length - 1, 0));

  useEffect(() => {
    if (!api) return;
    api
      .state()
      .then((state) => {
        setConfig(state);
        setUpdate(state.update);
        if (state.shortcutError) setError(state.shortcutError);
      })
      .catch((e) => setError(getErrorMessage(e)));
    const removeFocus = api.onFocus(() => {
      if (uiRef.current.mode === "search") {
        input.current?.focus();
        input.current?.select();
      }
    });
    const removeSettings = api.onSettings(() => {
      void api.openSettings();
    });
    const removePreferences = api.onPreferencesChanged(setConfig);
    return () => {
      removeFocus();
      removeSettings();
      removePreferences();
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title = strings[language].brandName;
  }, [language]);
  useEffect(() => {
    uiRef.current = { mode };
    if (mode === "search") input.current?.focus();
  }, [mode]);
  useEffect(() => {
    api
      ?.resize({
        mode,
        hasQuery,
        rows: files.length,
        hasMessage: Boolean(error) || showUpdate,
      })
      .catch((e) => setError(getErrorMessage(e)));
  }, [mode, hasQuery, files.length, error, showUpdate]);
  useEffect(() => {
    if (!api || mode !== "search" || !hasQuery) return;
    let active = true;
    // Query immediately. Disk discovery pushes updates instead of polling.
    let request = 0;
    async function latestSearch() {
      const id = ++request;
      try {
        const next = await api.search(query);
        if (active && id === request) setResult({ ...next, query });
      } catch (e) {
        if (active && id === request) setError(getErrorMessage(e));
      }
    }
    void latestSearch();
    const removeListener = api.onIndexChanged(latestSearch);
    return () => {
      active = false;
      removeListener();
    };
  }, [
    query,
    hasQuery,
    mode,
    config?.roots,
    config?.autoSearch,
    config?.excludedRoots,
  ]);
  useEffect(() => {
    if (!api) return;
    return api.onUpdate(setUpdate);
  }, []);
  useEffect(() => {
    document
      .getElementById(`file-${selectedIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  function back() {
    if (busyRef.current || exporting) return;
    if (previewId.current) void api.discard(previewId.current);
    previewId.current = null;
    setPreview(null);
    setPages(0);
    setSaved("");
    setError("");
    setBatchFolder(null);
    setMode("search");
  }
  async function openPreview(entry, keepExisting = false) {
    if (!entry || busyRef.current || batchWorking) return;
    if (entry.kind === "folder") {
      if (previewId.current) void api.discard(previewId.current);
      previewId.current = null;
      setPreview(null);
      setFile(null);
      setError("");
      setBatchFolder(entry);
      setMode("preview");
      return;
    }
    setBatchFolder(null);
    busyRef.current = true;
    setBusy(true);
    setError("");
    setFile(entry);
    setMode("preview");
    if (!keepExisting) {
      setPreview(null);
      setPages(0);
      setSaved("");
    }
    try {
      const next = await api.preview(entry.path);
      previewId.current = next.id;
      setPreview(next);
      setPages(0);
      setSaved("");
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function chooseFile() {
    try {
      const entry = await api.chooseFile();
      if (entry) await openPreview(entry);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }
  async function addFolder() {
    try {
      const roots = await api.addFolder();
      setConfig((c) => ({ ...c, roots }));
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }
  const currentLayoutKey = JSON.stringify(
    Object.fromEntries(
      Object.keys(preferenceDefaults.layout).map((key) => [
        key,
        config?.[key] ?? preferenceDefaults.layout[key],
      ]),
    ),
  );
  const stalePreview =
    Boolean(preview) && preview.layoutKey !== currentLayoutKey;
  useEffect(() => {
    if (!stalePreview || busy || !file || batchFolder) return;
    let active = true;
    // Reopening settings during a render queues only the latest layout.
    previewQueue.current = previewQueue.current
      .catch(() => {})
      .then(async () => {
        if (!active) return;
        busyRef.current = true;
        try {
          const next = await api.preview(file.path);
          if (active) {
            previewId.current = next.id;
            setPreview(next);
            setPages(0);
            setSaved("");
            setError("");
          }
        } catch (e) {
          if (active) setError(getErrorMessage(e));
        } finally {
          busyRef.current = false;
        }
      });
    return () => {
      active = false;
    };
  }, [currentLayoutKey, stalePreview, busy, file, batchFolder]);

  async function exportPdf() {
    if (!preview || exporting || busy || stalePreview || !pages) return;
    setExporting(true);
    setError("");
    try {
      const target = await api.exportPdf(preview.id);
      if (target) setSaved(target);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setExporting(false);
    }
  }
  function onKeyDown(event) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      void api.hide();
    }
    if (mode === "search" && event.target === input.current) {
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        setSelected(
          Math.max(
            0,
            Math.min(
              files.length - 1,
              selectedIndex + (event.key === "ArrowDown" ? 1 : -1),
            ),
          ),
        );
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void openPreview(files[selectedIndex]);
      }
    }
  }

  if (!api) return <p className="desktop-required">{t("desktopRequired")}</p>;
  return (
    <main className={`desktop-app mode-${mode}`} onKeyDown={onKeyDown}>
      <header className="titlebar">
        <Brand
          name="Inkleaf"
          showIcon={mode !== "search"}
          caption={mode === "preview" ? t("subtitle") : null}
        />
        {mode === "search" && (
          <div className="search-field">
            <input
              ref={input}
              role="combobox"
              aria-label={t("searchLabel")}
              aria-expanded={hasQuery}
              aria-controls="file-results"
              aria-activedescendant={
                files.length ? `file-${selectedIndex}` : undefined
              }
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(0);
              }}
              placeholder={t("search")}
              autoComplete="off"
              spellCheck="false"
            />
          </div>
        )}
        <div className="window-actions">
          <IconButton
            name={"refresh"}
            label={t("refresh")}
            onClick={() =>
              api.refresh().catch((e) => setError(getErrorMessage(e)))
            }
            disabled={false}
          />
          <IconButton
            name={"folderAdd"}
            label={t("addFolder")}
            onClick={addFolder}
            disabled={false}
          />
          <IconButton
            name={"open"}
            label={t("openFile")}
            onClick={chooseFile}
            disabled={busy || exporting || batchWorking}
          />
        </div>
      </header>
      <div className="workspace">
        <section
          className="document-pane"
          aria-label={mode === "search" ? t("searchLabel") : t("preview")}
        >
          {mode === "search" ? (
            <>
              {hasQuery && (
                <SearchResults
                  t={t}
                  result={result}
                  files={files}
                  selectedIndex={selectedIndex}
                  query={query}
                  config={config}
                  input={input}
                  setSelected={setSelected}
                  openPreview={openPreview}
                />
              )}
            </>
          ) : batchFolder ? (
            <BatchPreview
              folder={batchFolder}
              config={config}
              t={t}
              onBack={back}
              onWorking={setBatchWorking}
            />
          ) : (
            <>
              <div className="preview-topbar">
                <IconButton
                  name={"back"}
                  label={t("back")}
                  onClick={back}
                  disabled={busy || exporting}
                />
                <div className="preview-title">
                  <strong>{file?.name}</strong>
                  <span>
                    {pages
                      ? `${pages} ${t("page")} · ${preview?.paperSize || "A4"} · ${t(preview?.theme || "default")}`
                      : t("preview")}
                    {!saved && ` · ${t("unsaved")}`}
                  </span>
                </div>
                <button
                  className="primary-button"
                  onClick={exportPdf}
                  disabled={busy || stalePreview || exporting || !pages}
                >
                  <Icon name="download" size={15} />
                  {t(exporting ? "exporting" : "export")}
                </button>
              </div>
              <div className="preview-content" aria-busy={busy || stalePreview}>
                {(busy || stalePreview) && (
                  <div
                    className={preview ? "render-indicator" : "loading-state"}
                  >
                    <span className="spinner" />
                    {t("rendering")}
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
                {!busy && !preview && (
                  <div className="loading-state">
                    <span>{t("previewFailed")}</span>
                    <button
                      className="text-button"
                      onClick={() => openPreview(file)}
                    >
                      {t("retry")}
                    </button>
                  </div>
                )}
              </div>
              <DocumentWarnings preview={preview} t={t} />
              {saved && (
                <div className="saved-row">
                  <span title={saved}>
                    {t("saved")}
                    {saved}
                  </span>
                  <button
                    className="text-button"
                    onClick={() =>
                      api
                        .openPdf(preview.id)
                        .catch((e) => setError(getErrorMessage(e)))
                    }
                  >
                    {t("openPdf")}
                  </button>
                </div>
              )}
            </>
          )}
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
          {showUpdate && (
            <div className="update-strip">
              <UpdateControls update={update} t={t} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
