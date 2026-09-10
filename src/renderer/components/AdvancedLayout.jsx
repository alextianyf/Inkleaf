import { useState } from "react";
import { Group, Row, Select, Toggle } from "./SettingControls.jsx";

function HeadingNumber({ name, label, config, change, t, minimum }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  return (
    <Row name={name} label={label}>
      <input
        id={name}
        type="number"
        min={minimum}
        max={80}
        step={0.5}
        placeholder={t("themeDefault")}
        value={editing ? draft : (config[name] ?? "")}
        onFocus={(event) => {
          setDraft(event.target.value);
          setEditing(true);
        }}
        onBlur={() => setEditing(false)}
        onChange={(event) => {
          const value = event.target.value;
          setDraft(value);
          if (value === "") change({ [name]: null });
          else if (Number(value) >= minimum && Number(value) <= 80)
            change({ [name]: Number(value) });
        }}
      />
    </Row>
  );
}

export default function AdvancedLayout({ config, change, t, viewChange }) {
  const [level, setLevel] = useState("h1");
  const positions = ["left", "center", "right"];
  function changeAndView(patch, target) {
    change(patch);
    viewChange(target);
  }
  return (
    <details className="advanced-layout">
      <summary>{t("advancedLayout")}</summary>
      <p className="muted">{t("advancedHint")}</p>
      <Group title={t("headingStyles")}>
        <Row name="headingLevel" label={t("headingLevel")}>
          <select
            id="headingLevel"
            value={level}
            onChange={(event) => {
              setLevel(event.target.value);
            }}
          >
            {[1, 2, 3, 4, 5, 6].map((number) => (
              <option key={number} value={`h${number}`}>
                H{number}
              </option>
            ))}
          </select>
        </Row>
        <HeadingNumber
          name={`${level}Size`}
          label={t("headingSize")}
          minimum={8}
          config={config}
          change={change}
          t={t}
        />
        <Row name={`${level}Color`} label={t("headingColor")}>
          <div className="heading-color-control">
            <input
              id={`${level}Color`}
              type="color"
              value={config[`${level}Color`] || "#30343b"}
              aria-label={t("headingColor")}
              onChange={(event) =>
                change({ [`${level}Color`]: event.target.value })
              }
            />
            <span>{config[`${level}Color`] || t("themeDefault")}</span>
          </div>
        </Row>
        <HeadingNumber
          name={`${level}Before`}
          label={t("headingBefore")}
          minimum={0}
          config={config}
          change={change}
          t={t}
        />
        <HeadingNumber
          name={`${level}After`}
          label={t("headingAfter")}
          minimum={0}
          config={config}
          change={change}
          t={t}
        />
        <p className="muted">{t("headingSpacingHint")}</p>
        <button
          className="text-button"
          onClick={() =>
            change({
              [`${level}Size`]: null,
              [`${level}Color`]: "",
              [`${level}Before`]: null,
              [`${level}After`]: null,
            })
          }
        >
          {t("resetHeading")}
        </button>
      </Group>
      <Group title={t("pagination")}>
        {[
          "keepHeadings",
          "keepTables",
          "keepCodeBlocks",
          "avoidWidows",
          "repeatTableHeaders",
        ].map((name) => (
          <div key={name} className="pagination-option">
            <Toggle
              name={name}
              config={config}
              change={(patch) => changeAndView(patch, name)}
              t={t}
            />
            <button className="text-button" onClick={() => viewChange(name)}>
              {t("comparePagination")}
            </button>
          </div>
        ))}
        <Select
          name="chapterBreak"
          values={["none", "h1", "h2"]}
          config={config}
          change={(patch) => changeAndView(patch, "chapterBreak")}
          t={t}
        />
        <button
          className="text-button"
          onClick={() => viewChange("chapterBreak")}
        >
          {t("comparePagination")}
        </button>
        <p className="muted">{t("paginationHint")}</p>
      </Group>
      {["header", "footer"].map((area) => (
        <Group key={area} title={t(`${area}Group`)}>
          <Toggle
            name={`${area}Enabled`}
            config={config}
            change={change}
            t={t}
          />
          {config[`${area}Enabled`] && (
            <>
              <Row name={`${area}Text`} label={t(`${area}Text`)}>
                <input
                  id={`${area}Text`}
                  maxLength={200}
                  value={config[`${area}Text`]}
                  placeholder="{title}"
                  onChange={(event) =>
                    change({ [`${area}Text`]: event.target.value })
                  }
                />
              </Row>
              <p className="muted">{t("decorationTokens")}</p>
              <Select
                name={`${area}Position`}
                values={positions}
                config={config}
                change={(patch) => changeAndView(patch, area)}
                t={t}
              />
              <button
                className="text-button"
                onClick={() => viewChange(area)}
                disabled={!config[`${area}Text`].trim()}
              >
                {t("viewChange")}
              </button>
            </>
          )}
        </Group>
      ))}
      <Group title={t("pageNumberSettings")}>
        <Select
          name="pageNumberArea"
          values={["header", "footer"]}
          config={config}
          change={(patch) => changeAndView(patch, "pageNumber")}
          t={t}
        />
        <Select
          name="pageNumberPosition"
          values={positions}
          config={config}
          change={(patch) => changeAndView(patch, "pageNumber")}
          t={t}
        />
        <Select
          name="pageNumberFormat"
          values={["number", "fraction", "label"]}
          config={config}
          change={(patch) => changeAndView(patch, "pageNumber")}
          t={t}
        />
        {!config.pageNumbers && (
          <p className="muted">{t("pageNumbersOffHint")}</p>
        )}
        <Select
          name="signaturePosition"
          values={positions}
          config={config}
          change={(patch) => changeAndView(patch, "signature")}
          t={t}
        />
      </Group>
    </details>
  );
}
