/* The /api routes. The record routes map to methods of the browser's data module (src/db/db.ts);
   the /api/auth routes create and end sessions.

   How the server protects your data:
   - Accounts: every record route needs a signed-in session (a cookie). The user id comes from the session, and every
     query is limited to that user's rows (server/db.ts), so nobody can read or change someone else's records,
     even by guessing their ids.
   - Writes must be sent as application/json. A web page on another site can't send that to us without
     a CORS "preflight" request first, and we never approve preflights, so other sites can't change your data.
     This matters because browsers attach cookies to requests that other sites trigger too (that attack is
     called CSRF). The session cookie's SameSite=Lax and the Origin check below are two more layers.
   - The Host header must be localhost, 127.0.0.1, Render's hostname or our own domain (PUBLIC_HOSTNAME). That blocks "DNS rebinding", where a site
     points its own domain name at your computer to get around the browser's same-origin rules.
   - Sign-in and sign-up are rate-limited, so passwords can't be guessed quickly. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { APP, SCHEMA, validate } from "../src/db/format.ts";
import {
  DUMMY_HASH,
  RateLimiter,
  SESSION_DAYS,
  allowedHosts,
  clearCookie,
  clientIp,
  hashPassword,
  hashToken,
  newSessionToken,
  normEmail,
  passwordProblem,
  readSessionCookie,
  sessionCookie,
  verifyPassword,
} from "./auth.ts";
import * as db from "./db.ts";
import { isCollection } from "./rows.ts";

const MAX_BODY = 5 * 1024 * 1024;
const MINUTE = 60_000;

/* Failed sign-ins per email protect each account from password guessing, wherever the guesses come from.
   The per-address limits slow down one machine trying many accounts, or creating lots of them. */
const failedSignins = new RateLimiter(10, 15 * MINUTE);
const authAttempts = new RateLimiter(30, 15 * MINUTE);
const signups = new RateLimiter(5, 60 * MINUTE);

/** For tests: forget all rate-limit counts. */
export function resetRateLimits() {
  for (const l of [failedSignins, authAttempts, signups]) l.hits.clear();
}

export interface ApiOptions {
  /** true when served over HTTPS (Render): the session cookie is then Secure, with the __Host- prefix */
  secure: boolean;
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface Reply {
  status: number;
  body: unknown;
  cookie?: string;
}

function send(res: ServerResponse, { status, body, cookie }: Reply) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(cookie ? { "Set-Cookie": cookie } : {}),
  });
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

/** Browsers send Origin with every POST/PUT/PATCH/DELETE. If it names another site, refuse the request. */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin === undefined || req.method === "GET" || req.method === "HEAD") return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false; // includes "null", sent by sandboxed frames and some redirects
  }
}

/** Handle the request if it's for /api. Returns false for anything else (static files). */
export async function handleApi(req: IncomingMessage, res: ServerResponse, opts: ApiOptions): Promise<boolean> {
  const url = new URL(req.url || "/", "http://localhost");
  if (!url.pathname.startsWith("/api/")) return false;
  try {
    const host = (req.headers.host || "").replace(/:\d+$/, "").toLowerCase();
    if (!allowedHosts(process.env).has(host)) throw new HttpError(403, "Forbidden host.");
    if (!sameOrigin(req)) throw new HttpError(403, "Requests from other sites aren't allowed.");
    send(res, await route(req, url, opts));
  } catch (e) {
    // our own HttpErrors carry a status; anything else came from the database
    const err = e instanceof HttpError ? e : dbError(e);
    send(res, { status: err.status, body: { error: err.message } });
  }
  return true;
}

/** The signed-in user, or a 401. */
async function currentUser(req: IncomingMessage, opts: ApiOptions): Promise<db.User> {
  const token = readSessionCookie(req.headers.cookie, opts.secure);
  const user = token ? await db.findSession(hashToken(token)) : null;
  if (!user) throw new HttpError(401, "Please sign in.");
  return user;
}

/** Start a session: a new random token every time, so a token planted before sign-in is useless ("session fixation"). */
async function startSession(user: db.User, opts: ApiOptions): Promise<Reply> {
  const token = newSessionToken();
  await db.createSession(user.id, hashToken(token), SESSION_DAYS);
  return { status: 200, body: { email: user.email }, cookie: sessionCookie(token, opts.secure) };
}

async function authRoute(req: IncomingMessage, action: string, opts: ApiOptions): Promise<Reply | null> {
  const m = req.method;
  const ip = clientIp(req.headers, req.socket.remoteAddress);

  // "Nobody" is a normal answer here, not an error, so it's a 200 (a 401 would show as an error in the browser's console)
  if (action === "me" && m === "GET") {
    const user = await currentUser(req, opts).catch(() => null);
    return { status: 200, body: { email: user?.email ?? null } };
  }

  if (action === "signup" && m === "POST") {
    const body = await readJson(req);
    if (authAttempts.blocked(ip) || signups.blocked(ip)) throw new HttpError(429, "Too many attempts from here. Try again later.");
    authAttempts.hit(ip);
    const email = normEmail(body.email);
    if (!email) throw new HttpError(400, "Enter a valid email address.");
    const problem = passwordProblem(body.password);
    if (problem) throw new HttpError(400, problem);
    const user = await db.createUser(email, await hashPassword(body.password as string));
    // Saying "taken" tells a visitor that this email has an account. Every sign-up form has to say it somehow;
    // with email verification (server/mail.ts) the message could move into an email instead.
    if (!user) throw new HttpError(409, "That email already has an account. Sign in instead.");
    signups.hit(ip);
    // TODO(email verification): sendMail a verification link here, see server/mail.ts.
    return startSession(user, opts);
  }

  if (action === "signin" && m === "POST") {
    const body = await readJson(req);
    const email = normEmail(body.email) ?? "";
    if (authAttempts.blocked(ip) || failedSignins.blocked(email)) throw new HttpError(429, "Too many sign-in attempts. Wait 15 minutes and try again.");
    authAttempts.hit(ip);
    const password = typeof body.password === "string" && body.password.length <= 1000 ? body.password : "";
    const user = email ? await db.findUserByEmail(email) : null;
    // With no such user, still check against a dummy hash: the reply then takes as long as for a wrong password,
    // so timing doesn't reveal which emails have accounts. Same message for both, for the same reason.
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      failedSignins.hit(email);
      throw new HttpError(401, "Email or password is wrong.");
    }
    failedSignins.clear(email);
    await db.deleteExpiredSessions();
    return startSession(user, opts);
  }

  if (action === "signout" && m === "POST") {
    await readJson(req); // insists on JSON, so another site can't sign you out with a plain form
    const token = readSessionCookie(req.headers.cookie, opts.secure);
    if (token) await db.deleteSession(hashToken(token));
    return { status: 200, body: { ok: true }, cookie: clearCookie(opts.secure) };
  }

  // TODO(password reset): POST /api/auth/reset-request emails a one-time link (server/mail.ts) and always answers
  // the same way, whether or not the email has an account; POST /api/auth/reset sets the new password and calls
  // db.deleteSessionsForUser.
  return null;
}

async function route(req: IncomingMessage, url: URL, opts: ApiOptions): Promise<Reply> {
  const parts = url.pathname.split("/").slice(2).map(decodeURIComponent); // "/api/topics/abc" → ["topics", "abc"]
  const m = req.method;

  if (parts.length === 1 && parts[0] === "health" && m === "GET") return { status: 200, body: { ok: true, db: await db.health() } };

  if (parts.length === 2 && parts[0] === "auth") {
    const reply = await authRoute(req, parts[1], opts);
    if (reply) return reply;
    throw new HttpError(404, "No such API route.");
  }

  // everything below needs a signed-in user, and only ever sees that user's records
  const user = await currentUser(req, opts);

  if (parts.length === 1 && parts[0] === "ledger") {
    if (m === "GET") return { status: 200, body: { app: APP, schema: SCHEMA, ...(await db.loadAll(user.id)) } };
    if (m === "PUT") {
      const data = await readJson(req);
      const err = validate(data);
      if (err) throw new HttpError(400, err);
      return { status: 200, body: { app: APP, schema: SCHEMA, ...(await db.replaceAll(user.id, data)) } };
    }
  }

  const [col, id] = parts;
  if (parts.length === 2 && isCollection(col) && id) {
    if (m === "PUT") return { status: 200, body: await db.upsert(user.id, col, id, await readJson(req)) };
    if (m === "PATCH") {
      const row = await db.patch(user.id, col, id, await readJson(req));
      if (!row) throw new HttpError(404, `No such record: ${col}/${id}`);
      return { status: 200, body: row };
    }
    if (m === "DELETE") {
      await db.remove(user.id, col, id);
      return { status: 200, body: { ok: true } };
    }
  }
  throw new HttpError(404, "No such API route.");
}
