import { Group, Row, Toggle, Select } from "./SettingControls.jsx";
import AdvancedLayout from "./AdvancedLayout.jsx";
import IconButton from "./IconButton.jsx";
import UpdateControls from "./UpdateControls.jsx";
const api = window.aldus;

function Folders({ excluded, config, action, t }) {
  const roots = excluded ? config.excludedRoots : config.roots;
  return (
    <Group
      title={t(excluded ? "excludedFolders" : "folders")}
      action={
        <IconButton
          name="folderAdd"
          label={t(excluded ? "excludeFolder" : "addFolder")}
          onClick={() => action(excluded ? api.excludeFolder : api.addFolder)}
        />
      }
    >
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
    </Group>
  );
}

export default function SettingsPanel({
  category,
  config,
  change,
  action,
  t,
  update,
  viewChange,
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
        <Group title={t("groupApp")}>
          <Select
            name="appearance"
            values={["light", "dark", "system"]}
            config={config}
            change={change}
            t={t}
          />
          <Select
            name="languagePreference"
            values={["system", "zh", "en"]}
            config={config}
            change={change}
            t={t}
          />
          <Toggle
            name="launchAtLogin"
            config={config}
            change={change}
            t={t}
            disabled={config.development}
          />
          {config.development && (
            <p className="muted">{t("developmentLoginHint")}</p>
          )}
        </Group>
        <Group title={t("groupActivation")}>
          <Row name="shortcut" label={t("shortcut")} hint={t("shortcutHint")}>
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
          </Row>
        </Group>
        <Group title={t("groupSearchBar")}>
          <Row name="search-width" label={t("searchWidth")}>
            <span>
              {config.searchWidth
                ? config.searchWidth + " px"
                : t("automaticWidth")}
            </span>
          </Row>
          <Row name="search-height" label={t("searchHeight")}>
            <span>
              {config.searchHeight
                ? config.searchHeight + " px"
                : t("automaticHeight")}
            </span>
          </Row>
          <p className="muted">{t("searchWidthHint")}</p>
          <button
            className="text-button"
            onClick={() => change({ searchWidth: null, searchHeight: null })}
          >
            {t("resetSearchWidth")}
          </button>
        </Group>
      </>
    );
  if (category === "search")
    return (
      <>
        <Group title={t("groupSearchScope")}>
          <Toggle name="autoSearch" config={config} change={change} t={t} />
          <p className="muted">{t("autoSearchHint")}</p>
        </Group>
        <Folders config={config} action={action} t={t} />
        <Folders excluded config={config} action={action} t={t} />
        <Group title={t("groupIndex")}>
          <p className="muted">{t("markdownSearchOnly")}</p>
          <button className="text-button" onClick={() => action(api.refresh)}>
            {t("rebuildIndex")}
          </button>
        </Group>
      </>
    );
  if (category === "layout")
    return (
      <>
        <Group title={t("groupPage")}>
          <Select
            name="theme"
            values={["default", "minimal"]}
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
        </Group>
        <Group title={t("groupTypography")}>
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
        </Group>
        <Group title={t("groupCopyright")}>
          <Toggle name="authorEnabled" config={config} change={change} t={t} />
          {config.authorEnabled && (
            <Row name="copyrightLabel" label={t("copyrightLabel")}>
              <input
                id="copyrightLabel"
                value={config.copyrightLabel || ""}
                maxLength={200}
                placeholder={t("originalTitle")}
                onChange={(event) =>
                  change({ copyrightLabel: event.target.value })
                }
              />
            </Row>
          )}
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
          <p className="muted">{t("copyrightHint")}</p>
          <button
            className="text-button"
            onClick={() => viewChange("signature")}
            disabled={!config.authorEnabled || !config.author.trim()}
          >
            {t("viewChange")}
          </button>
        </Group>
        <Group title={t("groupFooter")}>
          <Toggle name="pageNumbers" config={config} change={change} t={t} />
        </Group>
        <AdvancedLayout
          config={config}
          change={change}
          t={t}
          viewChange={viewChange}
        />
      </>
    );
  if (category === "export")
    return (
      <>
        <Group title={t("exportDestination")}>
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
        </Group>
        <Group title={t("groupExportBehavior")}>
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
        </Group>
      </>
    );
  return (
    <section className="preferences-about">
      <strong>{config.development ? "Inkleaf Dev" : "印页 · Inkleaf"}</strong>
      <p>
        {t("version")} {config.version}
      </p>
      {config.development ? (
        <p className="muted">{t("developmentUpdateHint")}</p>
      ) : (
        <UpdateControls update={update} t={t} />
      )}
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
