/* The real SQL, against PGlite (real Postgres compiled to WebAssembly) running inside the test.
   The database starts with the tables from before accounts, so the migration runs here exactly as it will on Neon. */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import backup from "../data/learning-ledger-2026-10-10.json";
import { APP } from "../src/db/format.ts";
import { handleApi, resetRateLimits } from "./api.ts";
import * as db from "./db.ts";

/** The schema before accounts (the old SCHEMA_SQL), with one record of each kind. */
const OLD_SCHEMA = `
create table tracks (id text primary key, title text, outcome text, why text, done_when text, start_date text, target_date text, next_step text, created_at bigint);
create table topics (id text primary key, track_id text not null references tracks(id) on delete cascade, name text, created_at bigint);
create table milestones (id text primary key, track_id text not null references tracks(id) on delete cascade, ord integer, title text,
  status text check (status in ('todo', 'doing', 'done')), due text, done_at text, next_step text);
create table entries (id text primary key, track_id text not null references tracks(id) on delete cascade,
  topic_id text references topics(id) on delete set null, milestone_id text references milestones(id) on delete set null,
  type text check (type in ('source', 'insight', 'question', 'build', 'milestone')), text text, url text, date text,
  created_at bigint, resolved boolean, answer text);
insert into tracks (id, title) values ('old', 'From before accounts');
insert into topics (id, track_id, name) values ('p', 'old', 'topic');
insert into milestones (id, track_id, ord, title, status) values ('m', 'old', 1, 'ms', 'todo');
insert into entries (id, track_id, topic_id, type, text) values ('e', 'old', 'p', 'insight', 'old entry');`;

let pg: PGlite;
let socket: PGLiteSocketServer;
let url: string;

beforeAll(async () => {
  pg = await PGlite.create();
  await pg.exec(OLD_SCHEMA);
  socket = new PGLiteSocketServer({ db: pg, port: 5498, maxConnections: 10 });
  await socket.start();
  url = "postgresql://postgres:postgres@127.0.0.1:5498/postgres";
  db.connect(url);
  expect(await db.health()).toBe(true); // runs the migrations
}, 60_000);

afterAll(async () => {
  await db.disconnect();
  await socket?.stop();
  await pg?.close();
});

const count = async (sql: string) => Number((await pg.query<{ n: number }>(`select count(*)::int as n from ${sql}`)).rows[0].n);

describe("migrations", () => {
  it("moves the tables from before accounts into the legacy schema, rows and all", async () => {
    expect(await count("legacy.tracks")).toBe(1);
    expect(await count("legacy.entries where topic_id = 'p'")).toBe(1);
    expect(await count("schema_migrations")).toBe(1);
    // the new tables have a user_id column and start out empty
    expect(await count("information_schema.columns where table_schema = 'public' and table_name = 'entries' and column_name = 'user_id'")).toBe(1);
  });

  it("runs each migration only once", async () => {
    await db.disconnect();
    db.connect(url);
    expect(await db.health()).toBe(true);
    expect(await count("schema_migrations")).toBe(1);
    expect(await count("legacy.tracks")).toBe(1);
  });
});

describe("users and sessions", () => {
  it("one account per email", async () => {
    const u = await db.createUser("one@example.com", "hash");
    expect(u).toMatchObject({ email: "one@example.com" });
    expect(await db.createUser("one@example.com", "other")).toBeNull();
    expect(await db.findUserByEmail("one@example.com")).toEqual({ id: u!.id, email: "one@example.com", passwordHash: "hash" });
    expect(await db.findUserByEmail("nobody@example.com")).toBeNull();
  });

  it("finds a session until it expires or is deleted", async () => {
    const u = (await db.createUser("two@example.com", "hash"))!;
    await db.createSession(u.id, "live", 30);
    await db.createSession(u.id, "expired", -1);
    expect(await db.findSession("live")).toEqual(u);
    expect(await db.findSession("expired")).toBeNull();
    await db.deleteExpiredSessions();
    expect(await count("sessions where token_hash = 'expired'")).toBe(0);
    await db.deleteSessionsForUser(u.id);
    expect(await db.findSession("live")).toBeNull();
  });
});

describe("each user sees only their own records", () => {
  let a: db.User, b: db.User;
  beforeEach(async () => {
    const n = Math.random().toString(36).slice(2);
    a = (await db.createUser(`a-${n}@example.com`, "h"))!;
    b = (await db.createUser(`b-${n}@example.com`, "h"))!;
  });

  it("two users can import the same backup, ids and all", async () => {
    await db.replaceAll(a.id, backup);
    const sb = await db.replaceAll(b.id, backup);
    expect(sb.entries).toHaveLength(15);
    expect((await db.loadAll(a.id)).entries).toHaveLength(15);
  });

  it("can't read, change or delete another user's records, even knowing their ids", async () => {
    await db.replaceAll(a.id, backup);
    expect(await db.loadAll(b.id)).toEqual({ tracks: [], topics: [], milestones: [], entries: [] });
    expect(await db.patch(b.id, "tracks", "webapp", { title: "hacked" })).toBeNull();
    await db.remove(b.id, "tracks", "webapp");
    await db.replaceAll(b.id, { tracks: [], topics: [], milestones: [], entries: [] });
    const sa = await db.loadAll(a.id);
    expect(sa.tracks[0]).toMatchObject({ id: "webapp", title: expect.not.stringContaining("hacked") });
    expect(sa.entries).toHaveLength(15);
  });

  it("writing a record with someone else's id makes a separate record of your own", async () => {
    await db.upsert(a.id, "tracks", "t", { title: "A's" });
    await db.upsert(b.id, "tracks", "t", { title: "B's" });
    expect((await db.loadAll(a.id)).tracks).toEqual([expect.objectContaining({ id: "t", title: "A's" })]);
    expect((await db.loadAll(b.id)).tracks).toEqual([expect.objectContaining({ id: "t", title: "B's" })]);
  });

  it("a record can't link to another user's track", async () => {
    await db.upsert(a.id, "tracks", "only-a", { title: "A's" });
    await expect(db.upsert(b.id, "topics", "p", { trackId: "only-a", name: "sneaky" })).rejects.toMatchObject({ code: "23503" });
  });

  it("deleting a topic clears just the link on its entries", async () => {
    await db.replaceAll(a.id, backup);
    await db.replaceAll(b.id, backup);
    await db.remove(a.id, "topics", "planning");
    const e = (await db.loadAll(a.id)).entries.filter((x) => x.id === backup.entries.find((y) => y.topicId === "planning")!.id);
    expect(e[0].topicId).toBe("");
    expect((await db.loadAll(b.id)).entries.some((x) => x.topicId === "planning")).toBe(true);
  });

  it("deleting a user deletes their records and sessions, and nobody else's", async () => {
    await db.replaceAll(a.id, backup);
    await db.replaceAll(b.id, backup);
    await db.createSession(a.id, "a-session-" + a.id, 30);
    await pg.query("delete from users where id = $1", [a.id]);
    expect(await count(`entries where user_id = '${a.id}'`)).toBe(0);
    expect(await db.findSession("a-session-" + a.id)).toBeNull();
    expect((await db.loadAll(b.id)).entries).toHaveLength(15);
  });
});

/* ---------- the HTTP API, with cookies ---------- */

let server: http.Server;
let port: number;

interface Res {
  status: number;
  body: Record<string, unknown>;
  cookie?: string;
}

/** fetch is replaced by the app tests' fake (src/test/setup.ts), so this uses node:http directly. */
function call(method: string, path: string, opts: { body?: unknown; cookie?: string; headers?: Record<string, string> } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers: {
          Host: "localhost",
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(opts.cookie ? { Cookie: opts.cookie } : {}),
          ...opts.headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          const setCookie = res.headers["set-cookie"]?.[0];
          resolve({ status: res.statusCode!, body: JSON.parse(data || "{}"), cookie: setCookie?.split(";")[0] });
        });
      },
    );
    req.on("error", reject);
    if (opts.body !== undefined) req.write(JSON.stringify(opts.body));
    req.end();
  });
}

describe("the API", () => {
  beforeAll(async () => {
    server = http.createServer((req, res) => void handleApi(req, res, { secure: false }));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => resetRateLimits());

  const pw = "a long enough password";
  const signUp = async (email: string) => {
    const r = await call("POST", "/api/auth/signup", { body: { email, password: pw } });
    expect(r.status).toBe(200);
    return r.cookie!;
  };

  it("record routes need a session", async () => {
    expect((await call("GET", "/api/ledger")).status).toBe(401);
    expect((await call("PUT", "/api/tracks/x", { body: {} })).status).toBe(401);
    expect((await call("GET", "/api/ledger", { cookie: "ll_session=made-up" })).status).toBe(401);
    expect(await call("GET", "/api/auth/me")).toMatchObject({ status: 200, body: { email: null } });
  });

  it("sign up sets an HttpOnly cookie that works for the API", async () => {
    const r = await call("POST", "/api/auth/signup", { body: { email: " New@Example.com ", password: pw } });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ email: "new@example.com" });
    expect(r.cookie).toMatch(/^ll_session=[\w-]{43}$/);
    expect((await call("GET", "/api/auth/me", { cookie: r.cookie })).body).toEqual({ email: "new@example.com" });
    expect((await call("GET", "/api/ledger", { cookie: r.cookie })).body).toMatchObject({ app: APP, tracks: [] });
  });

  it("sign up checks the email and password, and refuses a taken email", async () => {
    expect((await call("POST", "/api/auth/signup", { body: { email: "nope", password: pw } })).status).toBe(400);
    expect((await call("POST", "/api/auth/signup", { body: { email: "short@example.com", password: "short" } })).body.error).toMatch(/at least 10/);
    await signUp("taken@example.com");
    const again = await call("POST", "/api/auth/signup", { body: { email: "TAKEN@example.com", password: pw } });
    expect(again.status).toBe(409);
  });

  it("sign in gives the same answer for a wrong password and an unknown email", async () => {
    await signUp("known@example.com");
    const wrong = await call("POST", "/api/auth/signin", { body: { email: "known@example.com", password: "wrong password!" } });
    const unknown = await call("POST", "/api/auth/signin", { body: { email: "unknown@example.com", password: pw } });
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.cookie).toBeUndefined();
    const ok = await call("POST", "/api/auth/signin", { body: { email: "Known@example.com", password: pw } });
    expect(ok.status).toBe(200);
    expect(ok.cookie).toMatch(/^ll_session=/);
  });

  it("each sign-in gets a new session, and signing out ends only that one", async () => {
    const first = await signUp("two-devices@example.com");
    const second = (await call("POST", "/api/auth/signin", { body: { email: "two-devices@example.com", password: pw } })).cookie!;
    expect(second).not.toBe(first);
    const out = await call("POST", "/api/auth/signout", { body: {}, cookie: first });
    expect(out.cookie).toBe("ll_session=");
    expect((await call("GET", "/api/ledger", { cookie: first })).status).toBe(401);
    expect((await call("GET", "/api/ledger", { cookie: second })).status).toBe(200);
  });

  it("each user's API only reaches their own records", async () => {
    const ca = await signUp("api-a@example.com");
    const cb = await signUp("api-b@example.com");
    expect((await call("PUT", "/api/ledger", { body: backup, cookie: ca })).status).toBe(200);
    expect((await call("GET", "/api/ledger", { cookie: cb })).body.entries).toEqual([]);
    expect((await call("PATCH", "/api/tracks/webapp", { body: { title: "hacked" }, cookie: cb })).status).toBe(404);
    await call("DELETE", "/api/tracks/webapp", { cookie: cb });
    expect(((await call("GET", "/api/ledger", { cookie: ca })).body.entries as unknown[]).length).toBe(15);
  });

  it("ignores a user id sent in the body", async () => {
    const ca = await signUp("owner-a@example.com");
    const cb = await signUp("owner-b@example.com");
    const a = await db.findUserByEmail("owner-a@example.com");
    await call("PUT", "/api/tracks/planted", { body: { title: "x", userId: a!.id, user_id: a!.id }, cookie: cb });
    expect((await call("GET", "/api/ledger", { cookie: ca })).body.tracks).toEqual([]);
  });

  it("refuses writes from another site", async () => {
    const c = await signUp("origin@example.com");
    const evil = await call("PUT", "/api/tracks/x", { body: {}, cookie: c, headers: { Origin: "https://evil.example" } });
    expect(evil.status).toBe(403);
    const same = await call("PUT", "/api/tracks/x", { body: {}, cookie: c, headers: { Origin: "http://localhost" } });
    expect(same.status).toBe(200);
  });

  it("limits failed sign-ins per email", async () => {
    await signUp("target@example.com");
    for (let i = 0; i < 10; i++) {
      // a different address each time, so only the per-email limit applies
      const r = await call("POST", "/api/auth/signin", {
        body: { email: "target@example.com", password: "wrong password " + i },
        headers: { "CF-Connecting-IP": `10.0.0.${i}` },
      });
      expect(r.status).toBe(401);
    }
    const blocked = await call("POST", "/api/auth/signin", { body: { email: "target@example.com", password: pw }, headers: { "CF-Connecting-IP": "10.0.1.1" } });
    expect(blocked.status).toBe(429);
  });
});
