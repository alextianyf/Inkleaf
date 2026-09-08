import { useEffect, useRef, useState } from "react";
import SettingsPanel from "./components/SettingsPanel.jsx";
import LayoutSample from "./components/LayoutSample.jsx";
import IconButton from "./components/IconButton.jsx";
import Brand from "./components/Brand.jsx";
import defaults from "../shared/preferences.json";
import strings from "../shared/strings.json";
import { getErrorMessage } from "./lib/errors.js";
import "./styles.css";
import "./settings.css";

const api = window.aldus;

export default function SettingsApp() {
  const [config, setConfig] = useState(null);
  const [category, setCategory] = useState("general");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [update, setUpdate] = useState({ status: "idle" });
  const revision = useRef(0);
  const sampleQueue = useRef(Promise.resolve());
  const t = (key) => strings[config?.language || "en"][key] || key;

  useEffect(() => {
    api
      .state()
      .then((next) => {
        setConfig(next);
        setUpdate(next.update);
      })
      .catch((e) => setError(getErrorMessage(e)));
    return api.onUpdate(setUpdate);
  }, []);
  useEffect(() => {
    void api.settingsLayout(category === "layout");
  }, [category]);
  useEffect(() => {
    document.documentElement.lang = config?.language === "zh" ? "zh-CN" : "en";
    document.title = `${strings[config?.language || "en"].brandName} · ${strings[config?.language || "en"].settings}`;
  }, [config?.language]);

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
  return (
    <main
      className={"preferences " + (category === "layout" ? "has-sample" : "")}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !saving) void api.closeSettings();
      }}
    >
      <header className="preferences-titlebar">
        <Brand name={t("brandName")} caption={t("settings")} />
        <IconButton
          name="close"
          label={t("closeSettings")}
          onClick={() => api.closeSettings()}
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
              onClick={() => setCategory(key)}
            >
              {t("category" + key)}
            </button>
          ))}
        </nav>
        <div className="preferences-content">
          <div className="preferences-heading">
            <h1>{t("category" + category)}</h1>
            <span role="status">
              {saving
                ? t("savingPreferences")
                : error
                  ? t("preferencesError")
                  : t("autoSaved")}
            </span>
          </div>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {config && (
            <SettingsPanel
              config={config}
              category={category}
              change={change}
              action={action}
              t={t}
              update={update}
            />
          )}
          {config && category !== "about" && (
            <footer className="preferences-reset">
              <button
                className="text-button"
                disabled={saving}
                onClick={() => change(defaults[category])}
              >
                {t("resetCategory")}
              </button>
            </footer>
          )}
        </div>
        {config && category === "layout" && (
          <LayoutSample config={config} t={t} queue={sampleQueue} />
        )}
      </div>
    </main>
  );
}
