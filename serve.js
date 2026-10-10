// Learning Ledger — tiny local web server. No packages needed, only Node.js.
// Run:  npm run build   once (and after changing the code), then  node serve.js  and open http://localhost:8765
// It serves the built app in dist/ to your own computer only (127.0.0.1), nothing is exposed to the network.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT) || 8765;
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
const TYPES = {
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

if (!fs.existsSync(path.join(ROOT, "index.html"))) {
  console.error("The app hasn't been built yet. Run:  npm install  then  npm run build");
  process.exit(1);
}

http
  .createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end("Forbidden"); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(data);
    });
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`Learning Ledger is running at http://localhost:${PORT}`);
    console.log("Keep this window open while you use it. Press Ctrl+C to stop.");
  });
