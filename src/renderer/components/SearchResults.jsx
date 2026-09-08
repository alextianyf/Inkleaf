import { Icon } from "./Icon.jsx";

export default function SearchResults({
  t,
  result,
  files,
  selectedIndex,
  query,
  config,
  input,
  setSelected,
  openPreview,
}) {
  let countText = "";
  if (result.busy) countText = `${t("indexing")} · ${result.total || 0}`;
  else if (files.length) countText = `${result.matches}`;

  const searching = result.query !== query || result.busy;
  let emptyHint = t("noFolders");
  if (result.busy) emptyHint = t("indexingHint");
  else if (config?.roots.length || config?.autoSearch)
    emptyHint = t("moreKeywords");

  return (
    <div className="search-results">
      <div className="result-heading">
        <span>{t("results")}</span>
        <span>{countText}</span>
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
              <span className="folder-count">{entry.count} Markdown</span>
            )}
            {index === selectedIndex && <kbd>↵</kbd>}
          </div>
        ))}
      </div>
      {!files.length && (
        <div className="empty-result" role="status">
          <span>{searching ? t("searching") : t("noMatch")}</span>
          <p>{emptyHint}</p>
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
  );
}
