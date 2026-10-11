/* An in-memory stand-in for the server's /api routes, so tests run the real client code (src/db/db.ts)
   without a server or a database. setup.ts installs it as `fetch` and resets it before each test. */
import { APP, SCHEMA, blank, norm, type Row, type State } from "../db/format";
import type { CollectionName } from "../types";

export const fakeApi = {
  data: blank() as State,
  /** make every request fail: "network" = server not running, 503 = database unreachable */
  fail: null as null | "network" | 503,
  /** every request seen, as "METHOD /api/path" */
  calls: [] as string[],
  reset() {
    this.data = blank();
    this.fail = null;
    this.calls = [];
  },
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function fakeFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = init.method || "GET";
  const path = new URL(String(input), "http://localhost").pathname;
  fakeApi.calls.push(`${method} ${path}`);
  if (fakeApi.fail === "network") throw new TypeError("Failed to fetch");
  if (fakeApi.fail === 503) return json(503, { error: "The database couldn't be reached." });

  const body = init.body ? JSON.parse(String(init.body)) : undefined;
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
