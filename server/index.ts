// Learning Ledger server: serves the built app in dist/ and the /api routes, which save to Postgres (Neon).
// Run:  npm run build  once (and after changing the code), then  npm start  and open http://localhost:8765
// Needs DATABASE_URL in .env (see .env.example). Node 24 runs this TypeScript file directly: it strips the types,
// so there's no build step for the server.
//
// Locally it listens on 127.0.0.1 only, so nothing is exposed to the network, and there's no password.
// On Render (render.yaml) it's reachable from the internet, so two environment variables switch that on together:
//   HOST=0.0.0.0        listen on every network interface, not just this computer
//   APP_PASSWORD=...    every request except /healthz needs this password (the browser shows a sign-in pop-up)
// It refuses to start with a public HOST and no password, so a setup mistake can't expose your data.
//
// Options:  --port 8766   use another port
//           --api-only    skip dist/ (for `npm run dev:api`, where Vite serves the app and forwards /api here)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleApi } from "./api.ts";
import { checkBasicAuth } from "./auth.ts";
import { connect, health } from "./db.ts";

const args = process.argv.slice(2);
const portArg = args.indexOf("--port");
const PORT = Number(portArg >= 0 ? args[portArg + 1] : process.env.PORT) || 8765;
const API_ONLY = args.includes("--api-only");
const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.join(PROJECT, "dist");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

// .env holds the database password. It's gitignored, so it never ends up in the public repo.
try {
  process.loadEnvFile(path.join(PROJECT, ".env"));
} catch {
  /* no .env file: DATABASE_URL may come from the environment instead */
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL isn't set. Copy .env.example to .env and paste your Neon connection string into it.");
  process.exit(1);
}
if (!API_ONLY && !fs.existsSync(path.join(ROOT, "index.html"))) {
  console.error("The app hasn't been built yet. Run:  npm install  then  npm run build");
  process.exit(1);
}
// Read after loadEnvFile, so these could also come from .env (normally they're only set on Render).
const HOST = process.env.HOST || "127.0.0.1";
const PASSWORD = process.env.APP_PASSWORD || "";
const PUBLIC = !["127.0.0.1", "localhost", "::1"].includes(HOST);
if (PUBLIC && PASSWORD.length < 16) {
  console.error(`HOST=${HOST} makes the app reachable from other computers, so APP_PASSWORD must be set to at least 16 characters.`);
  process.exit(1);
}
connect(process.env.DATABASE_URL);

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  let rel = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  });
}

http
  .createServer(async (req, res) => {
    // Render's health check: no password and no database query, so it can't wake Neon and use up its free hours.
    if (req.url === "/healthz" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
      return res.end("ok");
    }
    // The WWW-Authenticate header is what makes the browser show its sign-in pop-up. Once you've signed in,
    // the browser sends the password with every request to this site, including the app's own fetch("/api/...").
    if (PASSWORD && !checkBasicAuth(req.headers.authorization, PASSWORD)) {
      res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Learning Ledger", charset="UTF-8"', "Content-Type": "text/plain", "Cache-Control": "no-store" });
      return res.end("This Learning Ledger is password-protected.");
    }
    if (await handleApi(req, res)) return;
    if (API_ONLY) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("API only. Open the app through Vite at http://localhost:8765");
    }
    serveStatic(req, res);
  })
  .listen(PORT, HOST, async () => {
    if (PUBLIC) console.log(`Learning Ledger is listening on ${HOST}:${PORT}, password-protected.`);
    else {
      console.log(`Learning Ledger ${API_ONLY ? "API" : "is"} running at http://localhost:${PORT}${PASSWORD ? " (password-protected)" : ""}`);
      console.log("Keep this window open while you use it. Press Ctrl+C to stop.");
    }
    console.log((await health()) ? "Connected to the database." : "Can't reach the database yet. Check DATABASE_URL and your internet connection.");
  });
