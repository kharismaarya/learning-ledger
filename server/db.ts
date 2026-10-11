/* Postgres (Neon) access. Every query uses $1-style parameters: values travel separately from the SQL text,
   so nothing a user types can change what a query does (that's how SQL injection is prevented).
   Table and column names come only from the fixed lists in rows.ts, never from the request.

   Every function that touches records takes the signed-in user's id first and puts `user_id = $1` in its SQL.
   That's the whole of "each person sees only their own data": the id comes from the session (api.ts), and a
   record id that belongs to someone else simply matches nothing. */
import { randomUUID } from "node:crypto";
import pg from "pg";
import type { CollectionName } from "../src/types.ts";
import { COLS, blank, norm, type Row, type State } from "../src/db/format.ts";
import { FIELDS, MIGRATIONS, fromDb, linkSafe, patchToDb, toDb } from "./rows.ts";

let pool: pg.Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function connect(url: string) {
  pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30_000 });
  // Neon closes idle connections. Without this listener, that error would crash the server.
  pool.on("error", (e) => console.error("Database connection dropped:", e.message));
}

/** For tests: close the connections, so the next connect() starts fresh. */
export async function disconnect() {
  await pool?.end();
  pool = null;
  schemaReady = null;
}

/** Run the migrations that haven't run yet (rows.ts), all in one transaction: if one fails, none of them count. */
async function migrate(p: pg.Pool) {
  const client = await p.connect();
  try {
    await client.query("begin");
    // if two servers start at once (say, during a deploy), the second waits here until the first has finished
    await client.query("select pg_advisory_xact_lock(8765)");
    await client.query("create table if not exists schema_migrations (version integer primary key, applied_at timestamptz not null default now())");
    const done = new Set((await client.query("select version from schema_migrations")).rows.map((r) => r.version));
    for (const [i, sql] of MIGRATIONS.entries()) {
      if (done.has(i + 1)) continue;
      await client.query(sql);
      await client.query("insert into schema_migrations (version) values ($1)", [i + 1]);
      console.log(`Database: ran migration ${i + 1}.`);
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Bring the schema up to date once per server run. If it fails (offline), the next request tries again. */
function ready(): Promise<void> {
  if (!pool) return Promise.reject(new Error("DATABASE_URL is not set"));
  schemaReady ??= migrate(pool).catch((e) => {
    schemaReady = null;
    throw e;
  });
  return schemaReady;
}

async function q(sql: string, params: unknown[] = []) {
  await ready();
  return pool!.query(sql, params);
}

const cols = (c: CollectionName) => FIELDS[c].map((f) => f.col);

export async function health(): Promise<boolean> {
  try {
    await q("select 1");
    return true;
  } catch {
    return false;
  }
}

/* ---------- users and sessions ---------- */

export interface User {
  id: string;
  email: string;
}

/** Create an account. Returns null if the email is already taken. */
export async function createUser(email: string, passwordHash: string): Promise<User | null> {
  try {
    const r = await q("insert into users (id, email, password_hash) values ($1, $2, $3) returning id, email", [randomUUID(), email, passwordHash]);
    return r.rows[0];
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return null; // unique_violation: that email has an account
    throw e;
  }
}

export async function findUserByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
  const r = await q("select id, email, password_hash from users where email = $1", [email]);
  const u = r.rows[0];
  return u ? { id: u.id, email: u.email, passwordHash: u.password_hash } : null;
}

export async function createSession(userId: string, tokenHash: string, days: number): Promise<void> {
  await q("insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))", [tokenHash, userId, days]);
}

/** The user a session belongs to, if the session exists and hasn't expired. */
export async function findSession(tokenHash: string): Promise<User | null> {
  const r = await q("select u.id, u.email from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()", [
    tokenHash,
  ]);
  return r.rows[0] ?? null;
}

export async function deleteSession(tokenHash: string): Promise<void> {
  await q("delete from sessions where token_hash = $1", [tokenHash]);
}

/** Sign someone out everywhere. A password reset (later) will call this, so a stolen session stops working. */
export async function deleteSessionsForUser(userId: string): Promise<void> {
  await q("delete from sessions where user_id = $1", [userId]);
}

export async function deleteExpiredSessions(): Promise<void> {
  await q("delete from sessions where expires_at <= now()");
}

/* ---------- records ---------- */

export async function loadAll(userId: string): Promise<State> {
  const out = blank();
  for (const c of COLS) {
    const order = c === "milestones" ? "ord, id" : "created_at, id";
    const r = await q(`select * from ${c} where user_id = $1 order by ${order}`, [userId]);
    out[c] = r.rows.map((row) => fromDb(c, row));
  }
  return out;
}

/** Insert or replace a whole record (the client's `doc(id).set`). Returns the record as stored. */
export async function upsert(userId: string, c: CollectionName, id: string, data: Record<string, unknown>): Promise<Row> {
  const names = cols(c);
  const values = toDb(c, { ...data, id });
  const params = names.map((_, i) => `$${i + 2}`).join(", ");
  const updates = names.filter((n) => n !== "id").map((n) => `${n} = excluded.${n}`).join(", ");
  const r = await q(
    `insert into ${c} (user_id, ${names.join(", ")}) values ($1, ${params}) on conflict (user_id, id) do update set ${updates} returning *`,
    [userId, ...values],
  );
  return fromDb(c, r.rows[0]);
}

/** Change some fields (the client's `doc(id).update`). Returns null if this user has no such record. */
export async function patch(userId: string, c: CollectionName, id: string, fields: Record<string, unknown>): Promise<Row | null> {
  const pairs = patchToDb(c, fields);
  const r = pairs.length
    ? await q(`update ${c} set ${pairs.map(([col], i) => `${col} = $${i + 3}`).join(", ")} where user_id = $1 and id = $2 returning *`, [
        userId,
        id,
        ...pairs.map(([, v]) => v),
      ])
    : await q(`select * from ${c} where user_id = $1 and id = $2`, [userId, id]);
  return r.rows[0] ? fromDb(c, r.rows[0]) : null;
}

export async function remove(userId: string, c: CollectionName, id: string): Promise<void> {
  await q(`delete from ${c} where user_id = $1 and id = $2`, [userId, id]);
}

/** Replace all of this user's records (Import), all or nothing: inside a transaction, a failure part-way leaves the
    old data in place. Other users' records are never touched. */
export async function replaceAll(userId: string, d: unknown): Promise<State> {
  const data = linkSafe(norm(d));
  await ready();
  const client = await pool!.connect();
  try {
    await client.query("begin");
    for (const c of [...COLS].reverse()) await client.query(`delete from ${c} where user_id = $1`, [userId]);
    for (const c of COLS) {
      const names = ["user_id", ...cols(c)];
      // many rows per insert: one round trip to Neon per 500 rows instead of one per row
      for (let i = 0; i < data[c].length; i += 500) {
        const chunk = data[c].slice(i, i + 500);
        const values = chunk.flatMap((rec) => [userId, ...toDb(c, rec)]);
        const rows = chunk.map((_, r) => "(" + names.map((_, k) => `$${r * names.length + k + 1}`).join(", ") + ")").join(", ");
        await client.query(`insert into ${c} (${names.join(", ")}) values ${rows} on conflict (user_id, id) do nothing`, values);
      }
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return loadAll(userId);
}
