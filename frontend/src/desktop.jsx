import DocumentWarnings from "./DocumentWarnings.jsx";
import { useEffect, useRef, useState } from "react";
import { Icon, PdfPreview } from "./DesktopPreview.jsx";
import BatchPreview from "./BatchPreview.jsx";
import strings from "../../desktop/strings.json";
import "./desktop.css";

const api = window.aldus;
const message = (error) =>
  error.message.replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    "",
  );

export default function DesktopApp() {
  const [config, setConfig] = useState(null);
  const [draft, setDraft] = useState(null);
  const [mode, setMode] = useState("search");
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pages, setPages] = useState(0);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(false);
  const [update, setUpdate] = useState({ status: "idle" });
  const [checking, setChecking] = useState(false);
  const input = useRef(null);
  const settingsPanel = useRef(null);
  const busyRef = useRef(false);
  const uiRef = useRef({ mode, settingsOpen });
  const previewId = useRef(null);
  const language =
    config?.language || (navigator.language.startsWith("zh") ? "zh" : "en");
  const t = (key) => strings[language][key];
  const hasQuery = Boolean(query.trim());
  const files = hasQuery && result.query === query ? result.files : [];
  const selectedIndex = Math.min(selected, Math.max(files.length - 1, 0));

  useEffect(() => {
    if (!api) return;
    api
      .state()
      .then((state) => {
        setConfig(state);
        setDraft(state);
        setUpdate(state.update);
        if (state.shortcutError) setError(state.shortcutError);
      })
      .catch((e) => setError(message(e)));
    const removeFocus = api.onFocus(() => {
      if (uiRef.current.mode === "search" && !uiRef.current.settingsOpen) {
        input.current?.focus();
        input.current?.select();
      }
    });
    const removeSettings = api.onSettings(() => {
      if (uiRef.current.settingsOpen) {
        settingsPanel.current?.querySelector("select")?.focus();
        return;
      }
      api
        .state()
        .then((state) => {
          setConfig(state);
          setDraft(state);
          setNotice(false);
          setError("");
          setSettingsOpen(true);
        })
        .catch((e) => setError(message(e)));
    });
    return () => {
      removeFocus();
      removeSettings();
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);
  useEffect(() => {
    uiRef.current = { mode, settingsOpen };
    if (settingsOpen) settingsPanel.current?.querySelector("select")?.focus();
    else if (mode === "search") input.current?.focus();
  }, [mode, settingsOpen]);
  useEffect(() => {
    api
      ?.resize({
        mode,
        settings: settingsOpen,
        hasQuery,
        rows: files.length,
        hasMessage: Boolean(error) || update.status === "available",
      })
      .catch((e) => setError(message(e)));
  }, [mode, settingsOpen, hasQuery, files.length, error, update.status]);
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
        if (active && id === request) setError(message(e));
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
    const timer = setInterval(
      () =>
        api
          .state()
          .then((state) => setUpdate(state.update))
          .catch(() => {}),
      10000,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    document
      .getElementById(`file-${selectedIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  function closeSettings() {
    setDraft(config);
    setSettingsOpen(false);
    setNotice(false);
    input.current?.focus();
  }
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
      setError(message(e));
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
      setError(message(e));
    }
  }
  async function addFolder() {
    try {
      const roots = await api.addFolder();
      setConfig((c) => ({ ...c, roots }));
      setDraft((c) => ({ ...c, roots }));
    } catch (e) {
      setError(message(e));
    }
  }
  async function removeFolder(root) {
    try {
      const roots = await api.removeFolder(root);
      setConfig((c) => ({ ...c, roots }));
      setDraft((c) => ({ ...c, roots }));
    } catch (e) {
      setError(message(e));
    }
  }
  async function changeLanguage(value) {
    try {
      const next = await api.language(value);
      setConfig(next);
      setDraft((c) => ({ ...c, language: value }));
      setError("");
    } catch (e) {
      setError(message(e));
    }
  }
  async function changeScope(action) {
    try {
      const next = await action();
      setConfig((current) => ({ ...current, ...next }));
      setDraft((current) => ({
        ...current,
        autoSearch: next.autoSearch,
        excludedRoots: next.excludedRoots,
      }));
    } catch (e) {
      setError(message(e));
    }
  }
  async function applySettings(event) {
    event.preventDefault();
    if (saving || busyRef.current) return;
    setSaving(true);
    setError("");
    setNotice(false);
    try {
      const styleChanged = ["theme", "author", "pageNumbers"].some(
        (key) => draft[key] !== config[key],
      );
      const next = await api.settings(draft);
      setConfig(next);
      setDraft(next);
      setNotice(true);
      if (file && mode === "preview" && styleChanged)
        await openPreview(file, true);
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(false);
    }
  }
  async function exportPdf() {
    if (!preview || exporting || busy || !pages) return;
    setExporting(true);
    setError("");
    try {
      const target = await api.exportPdf(preview.id);
      if (target) setSaved(target);
    } catch (e) {
      setError(message(e));
    } finally {
      setExporting(false);
    }
  }
  async function checkUpdates() {
    setChecking(true);
    try {
      setUpdate(await api.checkUpdates());
    } catch (e) {
      setError(message(e));
    } finally {
      setChecking(false);
    }
  }
  function shortcutKey(event) {
    if (event.key === "Tab" || event.key === "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.ctrlKey && !event.metaKey && !event.altKey) return;
    const key =
      event.code === "Space"
        ? "Space"
        : /^(Key[A-Z]|Digit[0-9])$/.test(event.code)
          ? event.code.replace(/^(Key|Digit)/, "")
          : /^F([1-9]|1[0-9]|2[0-4])$/.test(event.code)
            ? event.code
            : null;
    if (key)
      setDraft((c) => ({
        ...c,
        shortcut: [
          event.ctrlKey && "Control",
          event.metaKey && "Super",
          event.altKey && "Alt",
          event.shiftKey && "Shift",
          key,
        ]
          .filter(Boolean)
          .join("+"),
      }));
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
  const shortcutText = (draft?.shortcut || "")
    .replace(
      "CommandOrControl",
      navigator.platform.includes("Mac") ? "⌘" : "Ctrl",
    )
    .replace("Control", "Ctrl")
    .replace("Super", "⌘")
    .split("+")
    .join(" + ");
  const updateText = t(
    {
      idle: "updateIdle",
      available: "updateAvailable",
      current: "updateCurrent",
      unpublished: "updateUnpublished",
      offline: "updateOffline",
    }[update.status] || "updateIdle",
  );
  const tool = (name, label, action, disabled = false) => (
    <button
      type="button"
      className="icon-button"
      title={t(label)}
      aria-label={t(label)}
      onClick={action}
      disabled={disabled}
    >
      <Icon name={name} size={16} />
    </button>
  );

  if (!api) return <p className="desktop-required">{t("desktopRequired")}</p>;
  return (
    <main
      className={`desktop-app mode-${mode} ${settingsOpen ? "with-settings" : ""}`}
      onKeyDown={onKeyDown}
    >
      <header className="titlebar">
        <div className="brand">
          <span className="monogram">A</span>
          <span>Aldus</span>
          {mode === "preview" && (
            <span className="brand-caption">{t("subtitle")}</span>
          )}
        </div>
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
          {tool("refresh", "refresh", () =>
            api.refresh().catch((e) => setError(message(e))),
          )}
          {tool("folderAdd", "addFolder", addFolder)}
          {tool(
            "open",
            "openFile",
            chooseFile,
            busy || exporting || batchWorking,
          )}
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
                <div className="search-results">
                  <div className="result-heading">
                    <span>{t("results")}</span>
                    <span>
                      {result.busy
                        ? `${t("indexing")} · ${result.total || 0}`
                        : files.length
                          ? `${result.matches}`
                          : ""}
                    </span>
                  </div>
                  <div
                    className="results"
                    role="listbox"
                    id="file-results"
                    aria-label={t("results")}
                  >
                    {files.map((entry, index) => (
                      <div
                        key={entry.path}
                        id={`file-${index}`}
                        className={`file-result ${index === selectedIndex ? "selected" : ""}`}
                        role="option"
                        data-kind={entry.kind || "file"}
                        aria-selected={index === selectedIndex}
                        onClick={() => {
                          setSelected(index);
                          input.current?.focus();
                        }}
                        onDoubleClick={() => openPreview(entry)}
                      >
                        <Icon
                          name={entry.kind === "folder" ? "folder" : "file"}
                          size={19}
                        />
                        <div className="file-info">
                          <strong>{entry.name}</strong>
                          <span title={entry.path}>{entry.folder}</span>
                        </div>
                        {entry.kind === "folder" && (
                          <span className="folder-count">
                            {entry.count} Markdown
                          </span>
                        )}
                        {index === selectedIndex && <kbd>↵</kbd>}
                      </div>
                    ))}
                  </div>
                  {!files.length && (
                    <div className="empty-result" role="status">
                      <span>
                        {result.query !== query || result.busy
                          ? t("searching")
                          : t("noMatch")}
                      </span>
                      <p>
                        {result.busy
                          ? t("indexingHint")
                          : config?.roots.length || config?.autoSearch
                            ? t("moreKeywords")
                            : t("noFolders")}
                      </p>
                    </div>
                  )}
                  {!!result.warnings.length && (
                    <div className="inline-note">
                      {t(result.warnings[0].key)}
                      {result.warnings[0].path}
                    </div>
                  )}
                  {result.matches > 80 && (
                    <div className="inline-note">{t("fewerResults")}</div>
                  )}
                  {!!files.length && (
                    <div className="search-help">
                      <span>
                        <kbd>↑</kbd>
                        <kbd>↓</kbd> {t("select")}
                      </span>
                      <span>
                        <kbd>↵</kbd> {t("preview")}
                      </span>
                    </div>
                  )}
                </div>
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
                {tool("back", "back", back, busy || exporting)}
                <div className="preview-title">
                  <strong>{file?.name}</strong>
                  <span>
                    {pages
                      ? `${pages} ${t("page")} · A4 · ${t(preview?.theme || "default")}`
                      : t("preview")}
                    {!saved && ` · ${t("unsaved")}`}
                  </span>
                </div>
                <button
                  className="primary-button"
                  onClick={exportPdf}
                  disabled={busy || exporting || !pages}
                >
                  <Icon name="download" size={15} />
                  {t(exporting ? "exporting" : "export")}
                </button>
              </div>
              <div className="preview-content" aria-busy={busy}>
                {busy && (
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
                      api.openPdf(preview.id).catch((e) => setError(message(e)))
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
          {!settingsOpen && update.status === "available" && (
            <button
              className="update-strip"
              onClick={() =>
                api.downloadUpdate().catch((e) => setError(message(e)))
              }
            >
              {updateText}
            </button>
          )}
        </section>
        {settingsOpen && draft && (
          <aside
            ref={settingsPanel}
            className="settings-panel"
            id="settings-panel"
            aria-label={t("settings")}
          >
            <div className="settings-heading">
              <h1>{t("settings")}</h1>
              {tool("close", "closeSettings", closeSettings)}
            </div>
            <form className="settings-form" onSubmit={applySettings}>
              <div className="settings-scroll">
                <section>
                  <label className="setting-row" htmlFor="language">
                    <span>{t("language")}</span>
                    <select
                      id="language"
                      aria-label={t("language")}
                      value={language}
                      onChange={(e) => changeLanguage(e.target.value)}
                    >
                      <option value="zh">中文</option>
                      <option value="en">English</option>
                    </select>
                  </label>
                </section>
                <section>
                  <label className="setting-row" htmlFor="auto-search">
                    <span>{t("autoSearch")}</span>
                    <input
                      id="auto-search"
                      type="checkbox"
                      checked={config.autoSearch ?? true}
                      onChange={(e) =>
                        changeScope(() => api.searchScope(e.target.checked))
                      }
                    />
                  </label>
                  <p className="muted">{t("autoSearchHint")}</p>
                  <div className="section-heading">
                    <h2>{t("folders")}</h2>
                    {tool("folderAdd", "addFolder", addFolder)}
                  </div>
                  <div className="folder-list">
                    {config.roots.length ? (
                      config.roots.map((root) => (
                        <div className="folder-row" key={root}>
                          <span title={root}>{root}</span>
                          <button
                            type="button"
                            className="icon-button"
                            title={`${t("remove")} ${root}`}
                            aria-label={`${t("remove")} ${root}`}
                            onClick={() => removeFolder(root)}
                          >
                            <Icon name="close" size={13} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="muted">{t("noFolderSettings")}</p>
                    )}
                  </div>
                </section>
                <section>
                  <div className="section-heading">
                    <h2>{t("excludedFolders")}</h2>
                    {tool("folderAdd", "excludeFolder", () =>
                      changeScope(api.excludeFolder),
                    )}
                  </div>
                  <div className="folder-list">
                    {(config.excludedRoots || []).map((root) => (
                      <div className="folder-row" key={root}>
                        <span title={root}>{root}</span>
                        <button
                          type="button"
                          className="icon-button"
                          title={`${t("remove")} ${root}`}
                          aria-label={`${t("remove")} ${root}`}
                          onClick={() =>
                            changeScope(() => api.removeExclusion(root))
                          }
                        >
                          <Icon name="close" size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <label className="setting-row" htmlFor="theme">
                    <span>{t("theme")}</span>
                    <select
                      id="theme"
                      aria-label={t("theme")}
                      value={draft.theme}
                      onChange={(e) => {
                        setDraft({ ...draft, theme: e.target.value });
                        setNotice(false);
                      }}
                    >
                      {["default", "minimal", "dark"].map((theme) => (
                        <option key={theme} value={theme}>
                          {t(theme)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="setting-row" htmlFor="author">
                    <span>{t("author")}</span>
                    <input
                      id="author"
                      value={draft.author}
                      placeholder={t("optional")}
                      maxLength={200}
                      onChange={(e) => {
                        setDraft({ ...draft, author: e.target.value });
                        setNotice(false);
                      }}
                    />
                  </label>
                  <label className="setting-row" htmlFor="page-numbers">
                    <span>{t("pageNumbers")}</span>
                    <input
                      id="page-numbers"
                      type="checkbox"
                      checked={draft.pageNumbers}
                      onChange={(e) => {
                        setDraft({ ...draft, pageNumbers: e.target.checked });
                        setNotice(false);
                      }}
                    />
                  </label>
                </section>
                <section>
                  <label className="block-label" htmlFor="shortcut">
                    {t("shortcut")}
                  </label>
                  <input
                    id="shortcut"
                    className="shortcut-input"
                    value={shortcutText}
                    readOnly
                    onKeyDown={shortcutKey}
                  />
                  <p className="muted">{t("shortcutHint")}</p>
                </section>
              </div>
              <div className="settings-apply">
                <p className="muted" role="status">
                  {notice
                    ? t("settingsSaved")
                    : t(mode === "preview" ? "changesPreview" : "changesNext")}
                </p>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={saving || busy || exporting || batchWorking}
                >
                  {t("saveSettings")}
                </button>
              </div>
            </form>
            <div className="settings-about">
              <span>Aldus {config.version || "0.2.0"}</span>
              <button
                className="text-button"
                disabled={checking}
                onClick={
                  update.status === "available"
                    ? () =>
                        api.downloadUpdate().catch((e) => setError(message(e)))
                    : checkUpdates
                }
              >
                {checking ? t("checking") : updateText}
              </button>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
