import { useEffect, useRef, useState } from "react";
import SettingsPanel from "./components/SettingsPanel.jsx";
import LayoutSample from "./components/LayoutSample.jsx";
import IconButton from "./components/IconButton.jsx";
import Brand from "./components/Brand.jsx";
import { Icon } from "./components/Icon.jsx";
import defaults from "../shared/preferences.json";
import strings from "../shared/strings.json";
import { getErrorMessage } from "./lib/errors.js";
import "./styles.css";
import "./settings.css";

const api = window.aldus;

export default function SettingsApp() {
  const [config, setConfig] = useState(null);
  const [draft, setDraft] = useState(null);
  const [layoutSaved, setLayoutSaved] = useState(false);
  const [pendingLeave, setPendingLeave] = useState(null);
  const [category, setCategory] = useState("general");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewFocus, setPreviewFocus] = useState(null);
  const previewSequence = useRef(0);
  function viewChange(target) {
    setPreviewFocus({ id: ++previewSequence.current, target });
  }
  const [update, setUpdate] = useState({ status: "idle" });
  const revision = useRef(0);
  const sampleQueue = useRef(Promise.resolve());
  const closeDialog = useRef(null);
  const t = (key) =>
    key === "brandName" && config?.development
      ? "Inkleaf Dev"
      : strings[config?.language || "en"][key] || key;
  const dirty =
    config &&
    draft &&
    Object.keys(defaults.layout).some((key) => draft[key] !== config[key]);

  function layoutValues(values) {
    return Object.fromEntries(
      Object.keys(defaults.layout).map((key) => [key, values[key]]),
    );
  }

  useEffect(() => {
    api
      .state()
      .then((next) => {
        setConfig(next);
        setDraft(layoutValues(next));
        setUpdate(next.update);
      })
      .catch((e) => setError(getErrorMessage(e)));
    return api.onUpdate(setUpdate);
  }, []);
  useEffect(
    () =>
      api.onSettingsClose(() => {
        if (saving) return;
        if (dirty) setPendingLeave("close");
        else void api.closeSettings();
      }),
    [dirty, saving],
  );
  useEffect(() => {
    if (pendingLeave) closeDialog.current?.showModal();
  }, [pendingLeave]);
  useEffect(() => {
    void api.settingsLayout(category === "layout");
  }, [category]);
  useEffect(() => {
    document.documentElement.lang = config?.language === "zh" ? "zh-CN" : "en";
    document.title = `${config?.development ? "Inkleaf Dev" : strings[config?.language || "en"].brandName} · ${strings[config?.language || "en"].settings}`;
  }, [config?.language, config?.development]);

  async function change(patch) {
    const current = ++revision.current;
    setConfig((previous) => ({ ...previous, ...patch }));
    setSaving(true);
    setError("");
    try {
      const next = await api.settings(patch);
      if (revision.current === current) setConfig(next);
    } catch (e) {
      if (revision.current === current) {
        setError(getErrorMessage(e));
        // Restore the saved value, including a shortcut that failed registration.
        const saved = await api.state();
        if (revision.current === current) setConfig(saved);
      }
    } finally {
      if (revision.current === current) setSaving(false);
    }
  }
  async function action(run) {
    setError("");
    try {
      await run();
      setConfig(await api.state());
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }
  function editLayout(patch) {
    if (
      ["author", "copyrightLabel", "headerText", "footerText"].some((key) =>
        Object.hasOwn(patch, key),
      )
    )
      setPreviewFocus(null);
    setDraft((previous) => ({ ...previous, ...patch }));
    setLayoutSaved(false);
    setError("");
  }
  function leave(destination) {
    setPendingLeave(null);
    if (destination === "close") void api.closeSettings();
    else if (destination) setCategory(destination);
  }
  function selectCategory(next) {
    if (saving || next === category) return;
    if (dirty && category === "layout") setPendingLeave(next);
    else setCategory(next);
  }
  async function saveLayout(destination = null) {
    setSaving(true);
    setError("");
    try {
      const next = await api.settings(draft);
      setConfig(next);
      setDraft(layoutValues(next));
      setLayoutSaved(true);
      leave(destination);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  function close() {
    if (saving) return;
    if (dirty) setPendingLeave("close");
    else void api.closeSettings();
  }
  return (
    <main
      className={"preferences " + (category === "layout" ? "has-sample" : "")}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !saving) {
          if (pendingLeave) setPendingLeave(null);
          else close();
        }
      }}
    >
      <header className="preferences-titlebar">
        <Brand name={t("brandName")} caption={t("settings")} />
        <IconButton
          name="close"
          label={t("closeSettings")}
          onClick={close}
          disabled={saving}
        />
      </header>
      <div className="preferences-body">
        <nav className="preferences-nav" aria-label={t("settingsCategories")}>
          {["general", "search", "layout", "export", "about"].map((key) => (
            <button
              key={key}
              type="button"
              aria-current={category === key ? "page" : undefined}
              onClick={() => selectCategory(key)}
              disabled={saving}
            >
              <Icon
                name={
                  {
                    general: "settings",
                    search: "search",
                    layout: "file",
                    export: "download",
                    about: "info",
                  }[key]
                }
                size={17}
              />
              {t("category" + key)}
            </button>
          ))}
        </nav>
        <div className="preferences-content">
          <div className="preferences-heading">
            <div>
              <h1>{t("category" + category)}</h1>
              <p className="category-description">
                {t("description" + category)}
              </p>
            </div>
            {category !== "about" && (
              <span role="status">
                {saving
                  ? t("savingPreferences")
                  : error
                    ? t("preferencesError")
                    : category === "layout"
                      ? t(
                          dirty
                            ? "unsavedLayout"
                            : layoutSaved
                              ? "layoutSaved"
                              : "layoutReady",
                        )
                      : t("autoSaved")}
              </span>
            )}
          </div>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {config && (
            <fieldset
              className="preferences-fields"
              disabled={saving && category === "layout"}
            >
              <SettingsPanel
                config={
                  category === "layout" ? { ...config, ...draft } : config
                }
                viewChange={viewChange}
                category={category}
                change={category === "layout" ? editLayout : change}
                action={action}
                t={t}
                update={update}
              />
            </fieldset>
          )}
          {config && category !== "about" && (
            <footer className="preferences-reset">
              <button
                className="text-button"
                disabled={saving}
                onClick={() =>
                  category === "layout"
                    ? editLayout(defaults.layout)
                    : change(
                        category === "general"
                          ? {
                              ...defaults.general,
                              shortcut:
                                config.defaultShortcut ||
                                defaults.general.shortcut,
                            }
                          : defaults[category],
                      )
                }
              >
                {t("resetCategory")}
              </button>
            </footer>
          )}
        </div>
        {config && category === "layout" && (
          <LayoutSample
            config={{ ...config, ...draft }}
            t={t}
            queue={sampleQueue}
            focusRequest={previewFocus}
          />
        )}
      </div>
      {config && (category === "layout" || dirty) && (
        <footer className="layout-savebar">
          <span role="status">
            {t(
              saving
                ? "savingPreferences"
                : dirty
                  ? "unsavedLayout"
                  : layoutSaved
                    ? "layoutSaved"
                    : "layoutReady",
            )}
          </span>
          <button
            className="text-button"
            disabled={!dirty || saving}
            onClick={() => {
              setDraft(layoutValues(config));
              setLayoutSaved(false);
              setError("");
            }}
          >
            {t("discardChanges")}
          </button>
          <button disabled={!dirty || saving} onClick={() => saveLayout()}>
            {t("saveLayout")}
          </button>
        </footer>
      )}
      {pendingLeave && (
        <dialog
          ref={closeDialog}
          className="preferences-dialog"
          aria-labelledby="unsaved-title"
          onCancel={(event) => {
            event.preventDefault();
            setPendingLeave(null);
          }}
        >
          <h2 id="unsaved-title">{t("unsavedLayout")}</h2>
          <p>
            {t(
              pendingLeave === "close" ? "unsavedCloseHint" : "unsavedTabHint",
            )}
          </p>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <div>
            <button
              autoFocus
              className="text-button"
              disabled={saving}
              onClick={() => setPendingLeave(null)}
            >
              {t("keepEditing")}
            </button>
            <button
              className="text-button"
              disabled={saving}
              onClick={() => {
                setDraft(layoutValues(config));
                setLayoutSaved(false);
                setError("");
                leave(pendingLeave);
              }}
            >
              {t(
                pendingLeave === "close"
                  ? "discardAndClose"
                  : "discardAndLeave",
              )}
            </button>
            <button disabled={saving} onClick={() => saveLayout(pendingLeave)}>
              {t(pendingLeave === "close" ? "saveAndClose" : "saveAndLeave")}
            </button>
          </div>
        </dialog>
      )}
    </main>
  );
}
