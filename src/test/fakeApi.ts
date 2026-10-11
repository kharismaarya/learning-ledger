/* An in-memory stand-in for the server's /api routes, so tests run the real client code (src/db/db.ts)
   without a server or a database. setup.ts installs it as `fetch` and resets it before each test. */
import { APP, SCHEMA, blank, norm, type Row, type State } from "../db/format";
import type { CollectionName } from "../types";

export const ME = { email: "me@example.com", password: "correct horse battery" };

export const fakeApi = {
  /** the signed-in user's records */
  data: blank() as State,
  /** who is signed in (an email), or null. Tests start signed in as ME. */
  user: ME.email as string | null,
  /** email → password, and email → records while that user is signed out */
  accounts: { [ME.email]: ME.password } as Record<string, string>,
  stored: {} as Record<string, State>,
  /** make every request fail: "network" = server not running, 503 = database unreachable */
  fail: null as null | "network" | 503,
  /** every request seen, as "METHOD /api/path" */
  calls: [] as string[],
  reset() {
    this.data = blank();
    this.user = ME.email;
    this.accounts = { [ME.email]: ME.password };
    this.stored = {};
    this.fail = null;
    this.calls = [];
  },
  /** what the real server does when a session ends or starts: each user has their own records */
  switchTo(email: string | null) {
    if (this.user) this.stored[this.user] = this.data;
    this.user = email;
    this.data = (email && this.stored[email]) || blank();
  },
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function auth(action: string, body: { email?: string; password?: string } | undefined): Response {
  const email = (body?.email || "").trim().toLowerCase();
  const password = body?.password || "";
  if (action === "me") return json(200, { email: fakeApi.user });
  if (action === "signout") {
    fakeApi.switchTo(null);
    return json(200, { ok: true });
  }
  if (action === "signup") {
    if (fakeApi.accounts[email]) return json(409, { error: "That email already has an account. Sign in instead." });
    if (password.length < 10) return json(400, { error: "Use at least 10 characters for your password." });
    fakeApi.accounts[email] = password;
    fakeApi.switchTo(email);
    return json(200, { email });
  }
  if (action === "signin") {
    if (fakeApi.accounts[email] !== password) return json(401, { error: "Email or password is wrong." });
    fakeApi.switchTo(email);
    return json(200, { email });
  }
  return json(404, { error: "No such API route." });
}

export async function fakeFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = init.method || "GET";
  const path = new URL(String(input), "http://localhost").pathname;
  fakeApi.calls.push(`${method} ${path}`);
  if (fakeApi.fail === "network") throw new TypeError("Failed to fetch");
  if (fakeApi.fail === 503) return json(503, { error: "The database couldn't be reached." });

  const body = init.body ? JSON.parse(String(init.body)) : undefined;
  if (path.startsWith("/api/auth/")) return auth(path.slice("/api/auth/".length), body);
  if (!fakeApi.user) return json(401, { error: "Please sign in." });
  const d = fakeApi.data;
  const [, , col, id] = path.split("/").map(decodeURIComponent) as [string, string, CollectionName, string];

  if (path === "/api/ledger") {
    if (method === "PUT") fakeApi.data = norm(structuredClone(body));
    return json(200, { app: APP, schema: SCHEMA, ...fakeApi.data });
  }
  const rows: Row[] = d[col];
  if (!rows || !id) return json(404, { error: "No such API route." });
  const i = rows.findIndex((r) => r.id === id);
  if (method === "PUT") {
    const row = { ...body, id };
    d[col] = i < 0 ? [...rows, row] : rows.map((r, j) => (j === i ? row : r));
    return json(200, row);
  }
  if (method === "PATCH") {
    if (i < 0) return json(404, { error: `No such record: ${col}/${id}` });
    const row = { ...rows[i], ...body, id };
    d[col] = rows.map((r, j) => (j === i ? row : r));
    return json(200, row);
  }
  if (method === "DELETE") {
    d[col] = rows.filter((r) => r.id !== id);
    return json(200, { ok: true });
  }
  return json(404, { error: "No such API route." });
}
