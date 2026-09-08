import IconButton from "./IconButton.jsx";
import UpdateControls from "./UpdateControls.jsx";
const api = window.aldus;

function Row({ name, label, children }) {
  return (
    <div className="setting-row">
      <label htmlFor={name}>{label}</label>
      {children}
    </div>
  );
}
function Toggle({ name, config, change, t }) {
  return (
    <Row name={name} label={t(name)}>
      <input
        id={name}
        type="checkbox"
        checked={config[name]}
        onChange={(event) => change({ [name]: event.target.checked })}
      />
    </Row>
  );
}
function Select({ name, values, config, change, t, numeric = false }) {
  return (
    <Row name={name} label={t(name)}>
      <select
        id={name}
        value={config[name]}
        onChange={(event) =>
          change({
            [name]: numeric ? Number(event.target.value) : event.target.value,
          })
        }
      >
        {values.map((value) => (
          <option key={value} value={value}>
            {t(String(value))}
          </option>
        ))}
      </select>
    </Row>
  );
}
function Folders({ excluded, config, action, t }) {
  const roots = excluded ? config.excludedRoots : config.roots;
  return (
    <section className="settings-section">
      <div className="section-heading">
        <h2>{t(excluded ? "excludedFolders" : "folders")}</h2>
        <IconButton
          name="folderAdd"
          label={t(excluded ? "excludeFolder" : "addFolder")}
          onClick={() => action(excluded ? api.excludeFolder : api.addFolder)}
        />
      </div>
      <div className="folder-list">
        {roots.map((root) => (
          <div className="folder-row" key={root}>
            <span title={root}>{root}</span>
            <IconButton
              name="close"
              label={t("remove") + " " + root}
              onClick={() =>
                action(() =>
                  excluded ? api.removeExclusion(root) : api.removeFolder(root),
                )
              }
            />
          </div>
        ))}
      </div>
      {!roots.length && <p className="muted">{t("emptyFolders")}</p>}
    </section>
  );
}

export default function SettingsPanel({
  category,
  config,
  change,
  action,
  t,
  update,
}) {
  function shortcutKey(event) {
    if (event.key === "Tab" || event.key === "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.ctrlKey && !event.metaKey && !event.altKey) return;
    let key;
    if (event.code === "Space") key = "Space";
    else if (/^(Key[A-Z]|Digit[0-9])$/.test(event.code))
      key = event.code.replace(/^(Key|Digit)/, "");
    else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(event.code)) key = event.code;
    if (key)
      change({
        shortcut: [
          event.ctrlKey && "Control",
          event.metaKey && "Super",
          event.altKey && "Alt",
          event.shiftKey && "Shift",
          key,
        ]
          .filter(Boolean)
          .join("+"),
      });
  }

  if (category === "general")
    return (
      <>
        <section className="settings-section">
          <Select
            name="languagePreference"
            values={["system", "zh", "en"]}
            config={config}
            change={change}
            t={t}
          />
          <Toggle name="launchAtLogin" config={config} change={change} t={t} />
        </section>
        <section className="settings-section">
          <label className="block-label" htmlFor="shortcut">
            {t("shortcut")}
          </label>
          <input
            id="shortcut"
            className="shortcut-input"
            value={config.shortcut
              .replace(
                "CommandOrControl",
                navigator.platform.includes("Mac") ? "⌘" : "Ctrl",
              )
              .replace("Control", "Ctrl")
              .split("+")
              .join(" + ")}
            readOnly
            onKeyDown={shortcutKey}
          />
          <p className="muted">{t("shortcutHint")}</p>
        </section>
        <section className="settings-section">
          <Row name="search-width" label={t("searchWidth")}>
            <span>
              {config.searchWidth
                ? config.searchWidth + " px"
                : t("automaticWidth")}
            </span>
          </Row>
          <p className="muted">{t("searchWidthHint")}</p>
          <button
            className="text-button"
            onClick={() => change({ searchWidth: null })}
          >
            {t("resetSearchWidth")}
          </button>
        </section>
      </>
    );
  if (category === "search")
    return (
      <>
        <section className="settings-section">
          <Toggle name="autoSearch" config={config} change={change} t={t} />
          <p className="muted">{t("autoSearchHint")}</p>
        </section>
        <Folders config={config} action={action} t={t} />
        <Folders excluded config={config} action={action} t={t} />
        <section className="settings-section">
          <p className="muted">{t("markdownSearchOnly")}</p>
          <button className="text-button" onClick={() => action(api.refresh)}>
            {t("rebuildIndex")}
          </button>
        </section>
      </>
    );
  if (category === "layout")
    return (
      <>
        <section className="settings-section">
          <Select
            name="theme"
            values={["default", "minimal", "dark"]}
            config={config}
            change={change}
            t={t}
          />
          <Select
            name="paperSize"
            values={["A4", "Letter"]}
            config={config}
            change={change}
            t={t}
          />
          <Select
            name="orientation"
            values={["portrait", "landscape"]}
            config={config}
            change={change}
            t={t}
          />
          <Select
            name="margins"
            values={["compact", "standard", "wide"]}
            config={config}
            change={change}
            t={t}
          />
        </section>
        <section className="settings-section">
          <Row name="fontSize" label={t("fontSize")}>
            <input
              id="fontSize"
              type="number"
              min="8"
              max="18"
              step="0.5"
              value={config.fontSize}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (value >= 8 && value <= 18) change({ fontSize: value });
              }}
            />
          </Row>
          <Select
            name="lineHeight"
            values={[1.4, 1.6, 1.8]}
            numeric
            config={config}
            change={change}
            t={t}
          />
        </section>
        <section className="settings-section">
          <Toggle name="authorEnabled" config={config} change={change} t={t} />
          {config.authorEnabled && (
            <Row name="author" label={t("author")}>
              <input
                id="author"
                value={config.author}
                maxLength={200}
                placeholder={t("optional")}
                onChange={(event) => change({ author: event.target.value })}
              />
            </Row>
          )}
          <Toggle name="pageNumbers" config={config} change={change} t={t} />
        </section>
      </>
    );
  if (category === "export")
    return (
      <>
        <section className="settings-section">
          <p className="block-label">{t("exportDestination")}</p>
          <div className="destination-options">
            {["downloads", "source", "custom"].map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="exportDestination"
                  value={value}
                  checked={config.exportDestination === value}
                  onChange={() => {
                    if (value === "custom" && !config.exportFolder)
                      action(async () => {
                        const folder = await api.chooseExportFolder();
                        if (folder)
                          await change({
                            exportDestination: value,
                            exportFolder: folder,
                          });
                      });
                    else change({ exportDestination: value });
                  }}
                />
                {t("destination" + value)}
              </label>
            ))}
          </div>
          {config.exportDestination === "downloads" && (
            <p className="destination-path">{config.downloadsPath}</p>
          )}
          {config.exportDestination === "custom" && (
            <>
              <p className="destination-path">{config.exportFolder}</p>
              <button
                className="text-button"
                onClick={() =>
                  action(async () => {
                    const folder = await api.chooseExportFolder();
                    if (folder) await change({ exportFolder: folder });
                  })
                }
              >
                {t("chooseFolder")}
              </button>
            </>
          )}
        </section>
        <section className="settings-section">
          <Toggle
            name="askExportLocation"
            config={config}
            change={change}
            t={t}
          />
          <Toggle
            name="openAfterExport"
            config={config}
            change={change}
            t={t}
          />
          <Toggle
            name="preserveFolders"
            config={config}
            change={change}
            t={t}
          />
          <p className="muted">{t("batchDestinationHint")}</p>
          <p className="muted">{t("collisionHint")}</p>
        </section>
      </>
    );
  return (
    <section className="preferences-about">
      <strong>印页 · Inkleaf</strong>
      <p>
        {t("version")} {config.version}
      </p>
      <UpdateControls update={update} t={t} />
      <button
        className="text-button"
        onClick={() =>
          action(() =>
            api.openLink("https://github.com/alextianyf/Inkleaf/issues"),
          )
        }
      >
        {t("feedback")}
      </button>
    </section>
  );
}
