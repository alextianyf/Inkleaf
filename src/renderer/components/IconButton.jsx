import { Icon } from "./Icon.jsx";

export default function IconButton({ name, label, onClick, disabled = false }) {
  return (
    <button
      type="button"
      className="icon-button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={name} size={16} />
    </button>
  );
}
