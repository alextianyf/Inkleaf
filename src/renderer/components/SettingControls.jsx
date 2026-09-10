export function Group({ title, children, action }) {
  return (
    <section className="settings-group">
      <div className="section-heading">
        <h2>{title}</h2>
        {action}
      </div>
      <div className="settings-section">{children}</div>
    </section>
  );
}
export function Row({ name, label, children, hint }) {
  return (
    <div className={"setting-row setting-" + name}>
      <div className="setting-label">
        <label htmlFor={name}>{label}</label>
        {hint && <p className="muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
export function Toggle({ name, config, change, t, disabled = false }) {
  return (
    <Row name={name} label={t(name)}>
      <input
        id={name}
        type="checkbox"
        checked={config[name]}
        disabled={disabled}
        onChange={(event) => change({ [name]: event.target.checked })}
      />
    </Row>
  );
}
export function Select({ name, values, config, change, t, numeric = false }) {
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
