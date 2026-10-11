import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Same port as the server, so dev and the built app use the same address.
// In dev, Vite serves the app and forwards /api to the API server (`npm run dev:api` on 8766).
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist" },
  server: { port: 8765, strictPort: true, proxy: { "/api": "http://127.0.0.1:8766" } },
  test: {
    // the app tests drive a whole UI with user-event; on this machine some take ~6 s, over the 5 s default
    testTimeout: 20_000,
    projects: [
      // the browser app, in a fake browser (jsdom), with /api replaced by an in-memory fake (src/test/fakeApi.ts)
      { extends: true, test: { name: "app", environment: "jsdom", setupFiles: ["src/test/setup.ts"], include: ["src/**/*.test.{ts,tsx}"] } },
      // the server, in plain Node; server/db.test.ts runs a real Postgres (PGlite) in-process
      { extends: true, test: { name: "server", environment: "node", include: ["server/**/*.test.ts"] } },
    ],
  },
});
