import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Same port as serve.js, so dev and the built app share this browser's saved data.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist" },
  server: { port: 8765, strictPort: true },
});
