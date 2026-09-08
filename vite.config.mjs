import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(
        new URL("./src/renderer/desktop.html", import.meta.url),
      ),
    },
  },
});
