import { createRoot } from "react-dom/client";
import SettingsApp from "./SettingsApp.jsx";
import DesktopApp from "./App.jsx";

createRoot(document.getElementById("root")).render(
  location.search === "?settings" ? <SettingsApp /> : <DesktopApp />,
);
