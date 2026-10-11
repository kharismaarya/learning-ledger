/* The /api routes. Each one maps to a method of the browser's data module (src/db/db.ts).

   How the server protects your data:
   - Locally it only listens on 127.0.0.1, so other computers can't reach it. On Render, APP_PASSWORD guards
     every request before it gets here (see index.ts).
   - Writes must be sent as application/json. A web page on another site can't send that to us without
     a CORS "preflight" request first, and we never approve preflights, so other sites can't change your data.
     This still matters with a password: once you've signed in, your browser attaches it to requests that
     other sites trigger too.
   - The Host header must be localhost, 127.0.0.1 or Render's hostname. That blocks "DNS rebinding", where a site
     points its own domain name at your computer to get around the browser's same-origin rules. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { APP, SCHEMA, validate } from "../src/db/format.ts";
import { allowedHosts } from "./auth.ts";
import * as db from "./db.ts";
import { isCollection } from "./rows.ts";

const MAX_BODY = 5 * 1024 * 1024;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!(req.headers["content-type"] || "").startsWith("application/json")) throw new HttpError(415, "Send JSON (Content-Type: application/json).");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, "That's more than 5 MB.");
    chunks.push(chunk);
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
  } catch {
    /* fall through */
  }
  throw new HttpError(400, "The request body isn't a JSON object.");
}

/** Turn a database error into a status code and a message the app can show. */
function dbError(e: unknown): HttpError {
  const code = (e as { code?: string })?.code;
  if (code === "23503") return new HttpError(400, "That links to a track, topic or milestone that doesn't exist.");
  if (code === "23514" || code === "22P02") return new HttpError(400, "A value isn't allowed: " + (e as Error).message);
  console.error("Database error:", (e as Error)?.message ?? e);
  return new HttpError(503, "The database couldn't be reached.");
}

/** Handle the request if it's for /api. Returns false for anything else (static files). */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || "/", "http://localhost");
  if (!url.pathname.startsWith("/api/")) return false;
  try {
    const host = (req.headers.host || "").replace(/:\d+$/, "").toLowerCase();
    if (!allowedHosts(process.env).has(host)) throw new HttpError(403, "Forbidden host.");
    const { status, body } = await route(req, url);
    send(res, status, body);
  } catch (e) {
    // our own HttpErrors carry a status; anything else came from the database
    const err = e instanceof HttpError ? e : dbError(e);
    send(res, err.status, { error: err.message });
  }
  return true;
}

async function route(req: IncomingMessage, url: URL): Promise<{ status: number; body: unknown }> {
  const parts = url.pathname.split("/").slice(2).map(decodeURIComponent); // "/api/topics/abc" → ["topics", "abc"]
  const m = req.method;

  if (parts.length === 1 && parts[0] === "health" && m === "GET") return { status: 200, body: { ok: true, db: await db.health() } };

  if (parts.length === 1 && parts[0] === "ledger") {
    if (m === "GET") return { status: 200, body: { app: APP, schema: SCHEMA, ...(await db.loadAll()) } };
    if (m === "PUT") {
      const data = await readJson(req);
      const err = validate(data);
      if (err) throw new HttpError(400, err);
      return { status: 200, body: { app: APP, schema: SCHEMA, ...(await db.replaceAll(data)) } };
    }
  }

  const [col, id] = parts;
  if (parts.length === 2 && isCollection(col) && id) {
    if (m === "PUT") return { status: 200, body: await db.upsert(col, id, await readJson(req)) };
    if (m === "PATCH") {
      const row = await db.patch(col, id, await readJson(req));
      if (!row) throw new HttpError(404, `No such record: ${col}/${id}`);
      return { status: 200, body: row };
    }
    if (m === "DELETE") {
      await db.remove(col, id);
      return { status: 200, body: { ok: true } };
    }
  }
  throw new HttpError(404, "No such API route.");
}
