// Learning Ledger server: serves the built app in dist/ and the /api routes, which save to Postgres (Neon).
// Run:  npm run build  once (and after changing the code), then  npm start  and open http://localhost:8765
// Needs DATABASE_URL in .env (see .env.example). Node 24 runs this TypeScript file directly: it strips the types,
// so there's no build step for the server.
//
// Everyone signs in with their own account (email + password, see api.ts), locally and on Render.
// Locally it listens on 127.0.0.1 only, so nothing is exposed to the network.
// On Render (render.yaml), HOST=0.0.0.0 makes it listen on every network interface, so it's reachable from the
// internet. Render serves it over HTTPS, so a public HOST also makes the session cookie Secure (sent over HTTPS only).
// PUBLIC_HOSTNAME (also in render.yaml) is our own domain: the API accepts it, and the onrender.com address redirects to it.
//
// Options:  --port 8766   use another port
//           --api-only    skip dist/ (for `npm run dev:api`, where Vite serves the app and forwards /api here)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleApi } from "./api.ts";
import { canonicalRedirect } from "./auth.ts";
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
// Read after loadEnvFile, so it could also come from .env (normally it's only set on Render).
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC = !["127.0.0.1", "localhost", "::1"].includes(HOST);
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
    // Render's health check: no database query, so it can't wake Neon and use up its free hours.
    if (req.url === "/healthz" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
      return res.end("ok");
    }
    // Old onrender.com links move to our own domain (PUBLIC_HOSTNAME), so there's only one address to sign in at.
    const moved = canonicalRedirect(req.headers.host, req.method, req.url, process.env);
    if (moved) {
      res.writeHead(301, { Location: moved, "Cache-Control": "no-store" });
      return res.end();
    }
    // The app's files (HTML, JS, CSS) go to anyone: they hold no data, and the sign-in form is one of them.
    // The /api routes that read or write records check the session themselves.
    if (await handleApi(req, res, { secure: PUBLIC })) return;
    if (API_ONLY) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("API only. Open the app through Vite at http://localhost:8765");
    }
    serveStatic(req, res);
  })
  .listen(PORT, HOST, async () => {
    if (PUBLIC) console.log(`Learning Ledger is listening on ${HOST}:${PORT} (session cookies are HTTPS-only).`);
    else {
      console.log(`Learning Ledger ${API_ONLY ? "API" : "is"} running at http://localhost:${PORT}`);
      console.log("Keep this window open while you use it. Press Ctrl+C to stop.");
    }
    console.log((await health()) ? "Connected to the database." : "Can't reach the database yet. Check DATABASE_URL and your internet connection.");
  });
