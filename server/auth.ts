/* Accounts: password hashing, session tokens and cookies, input rules, rate limits, and the list of hostnames
   the API answers to. Pure functions with no database, so server/auth.test.ts can check them without starting anything. */
import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/* ---------- passwords ----------
   scrypt is deliberately slow and needs a lot of memory per guess. If the users table ever leaked, an attacker
   couldn't try billions of passwords a second on graphics cards the way they could against a plain hash.
   The salt (random per user) means two people with the same password get different hashes, so one guess can't
   be checked against everyone at once. Node has scrypt built in, so there's no extra dependency. */
const SCRYPT = { N: 2 ** 15, r: 8, p: 1 }; // ~32 MB and ~50-100 ms per hash: fine for sign-in, painful for guessing
const KEYLEN = 32;

function scryptAsync(pw: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  // the async version runs on Node's thread pool, so one sign-in doesn't freeze the server for everyone else
  return new Promise((resolve, reject) =>
    scrypt(pw.normalize("NFC"), salt, KEYLEN, { ...opts, maxmem: 256 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** "scrypt$N$r$p$salt$hash". The parameters are stored with the hash, so they can be raised later without breaking old accounts. */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  if (expected.length !== KEYLEN) return false;
  try {
    const key = await scryptAsync(pw, Buffer.from(salt, "base64url"), { N: Number(n), r: Number(r), p: Number(p) });
    // timingSafeEqual takes the same time however many bytes match, so response times don't leak anything
    return timingSafeEqual(key, expected);
  } catch {
    return false; // malformed parameters
  }
}

/** Compared against when the email isn't registered, so "no such account" takes as long as "wrong password". */
export const DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/* ---------- input rules ---------- */

/** The email in the form we store and compare, or null if it doesn't look like an email. */
export function normEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

export const PASSWORD_MIN = 10;
const PASSWORD_MAX = 200;

/** Why a new password isn't allowed, or null. Length is what makes a password strong (NIST 800-63B), so there are
    no "one digit, one symbol" rules. The maximum stops someone sending a megabyte to make hashing slow. */
export function passwordProblem(v: unknown): string | null {
  if (typeof v !== "string") return "Enter a password.";
  if ([...v].length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters for your password.`;
  if (v.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters for your password.`;
  return null;
}

/* ---------- sessions ----------
   Signing in creates a random token. The browser keeps it in a cookie; the database keeps only its SHA-256 hash.
   If the database leaked, the hashes couldn't be turned back into working cookies. (A fast hash is fine here,
   unlike for passwords: the token is 256 random bits, so there's nothing to guess.) */
export const SESSION_DAYS = 30;

export const newSessionToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token, "utf8").digest("base64url");

/** On HTTPS the cookie gets the __Host- prefix: browsers then only accept it with Secure, Path=/ and no Domain,
    so a sibling subdomain can't plant or overwrite it. Locally (plain http) neither is possible. */
export const cookieName = (secure: boolean) => (secure ? "__Host-ll_session" : "ll_session");

/** The Set-Cookie value for a new session.
    HttpOnly: page JavaScript can't read it, so an injected script couldn't steal the session.
    SameSite=Lax: the browser doesn't send it with requests that other sites make in the background.
    Secure: only ever sent over HTTPS. */
export function sessionCookie(token: string, secure: boolean): string {
  return `${cookieName(secure)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`;
}

export function clearCookie(secure: boolean): string {
  return `${cookieName(secure)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

/** The session token from a Cookie header, if there is one. */
export function readSessionCookie(header: string | undefined, secure: boolean): string | null {
  const name = cookieName(secure);
  for (const part of (header || "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

/* ---------- rate limits ----------
   Counts attempts per key (an email or an IP address) in a fixed time window, in memory. That's enough for one
   small server; it resets when the server restarts. */
export class RateLimiter {
  limit: number;
  windowMs: number;
  hits = new Map<string, { n: number; reset: number }>();

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** True if the key has used up its attempts. */
  blocked(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    return !!h && h.reset > now && h.n >= this.limit;
  }

  /** Count one attempt. */
  hit(key: string, now = Date.now()) {
    const h = this.hits.get(key);
    if (!h || h.reset <= now) {
      if (this.hits.size > 10_000) this.prune(now); // keep memory bounded
      this.hits.set(key, { n: 1, reset: now + this.windowMs });
    } else h.n++;
  }

  clear(key: string) {
    this.hits.delete(key);
  }

  prune(now = Date.now()) {
    for (const [k, h] of this.hits) if (h.reset <= now) this.hits.delete(k);
  }
}

/** The client's address, for per-IP limits. Behind Render, the socket address is Render's proxy, and its
    X-Forwarded-For keeps whatever the client sent, so it can be faked. Cloudflare (in front of Render) sets
    CF-Connecting-IP and overwrites any value the client sends, so that one is used when it's there. */
export function clientIp(headers: Record<string, string | string[] | undefined>, socketAddr: string | undefined): string {
  const cf = headers["cf-connecting-ip"];
  return (typeof cf === "string" && cf) || socketAddr || "unknown";
}

/* ---------- hosts ---------- */

/** Hostnames the API accepts in the Host header. Render sets RENDER_EXTERNAL_HOSTNAME (e.g. learning-ledger.onrender.com). */
export function allowedHosts(env: Record<string, string | undefined>): Set<string> {
  const hosts = new Set(["localhost", "127.0.0.1"]);
  if (env.RENDER_EXTERNAL_HOSTNAME) hosts.add(env.RENDER_EXTERNAL_HOSTNAME.toLowerCase());
  return hosts;
}
