import icon from "../../../resources/icons/inkleaf-small.svg";

export default function Brand({ name, caption, showIcon = true }) {
  return (
    <div className="brand">
      {showIcon && (
        <img
          className="brand-icon"
          src={icon}
          alt=""
          width="24"
          height="24"
          draggable="false"
        />
      )}
      <span>{name}</span>
      {caption && <span className="brand-caption">{caption}</span>}
    </div>
  );
}
