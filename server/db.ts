/* Postgres (Neon) access. Every query uses $1-style parameters: values travel separately from the SQL text,
   so nothing a user types can change what a query does (that's how SQL injection is prevented).
   Table and column names come only from the fixed lists in rows.ts, never from the request. */
import pg from "pg";
import type { CollectionName } from "../src/types.ts";
import { COLS, blank, norm, type Row, type State } from "../src/db/format.ts";
import { FIELDS, SCHEMA_SQL, fromDb, linkSafe, patchToDb, toDb } from "./rows.ts";

let pool: pg.Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function connect(url: string) {
  pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30_000 });
  // Neon closes idle connections. Without this listener, that error would crash the server.
  pool.on("error", (e) => console.error("Database connection dropped:", e.message));
}

/** Create the tables once per server run. If it fails (offline), the next request tries again. */
function ready(): Promise<void> {
  if (!pool) return Promise.reject(new Error("DATABASE_URL is not set"));
  schemaReady ??= pool.query(SCHEMA_SQL).then(
    () => undefined,
    (e) => {
      schemaReady = null;
      throw e;
    },
  );
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

export async function loadAll(): Promise<State> {
  const out = blank();
  for (const c of COLS) {
    const order = c === "milestones" ? "ord, id" : "created_at, id";
    const r = await q(`select * from ${c} order by ${order}`);
    out[c] = r.rows.map((row) => fromDb(c, row));
  }
  return out;
}

/** Insert or replace a whole record (the client's `doc(id).set`). Returns the record as stored. */
export async function upsert(c: CollectionName, id: string, data: Record<string, unknown>): Promise<Row> {
  const names = cols(c);
  const values = toDb(c, { ...data, id });
  const params = names.map((_, i) => `$${i + 1}`).join(", ");
  const updates = names.filter((n) => n !== "id").map((n) => `${n} = excluded.${n}`).join(", ");
  const r = await q(`insert into ${c} (${names.join(", ")}) values (${params}) on conflict (id) do update set ${updates} returning *`, values);
  return fromDb(c, r.rows[0]);
}

/** Change some fields (the client's `doc(id).update`). Returns null if there's no such record. */
export async function patch(c: CollectionName, id: string, fields: Record<string, unknown>): Promise<Row | null> {
  const pairs = patchToDb(c, fields);
  const r = pairs.length
    ? await q(`update ${c} set ${pairs.map(([col], i) => `${col} = $${i + 2}`).join(", ")} where id = $1 returning *`, [id, ...pairs.map(([, v]) => v)])
    : await q(`select * from ${c} where id = $1`, [id]);
  return r.rows[0] ? fromDb(c, r.rows[0]) : null;
}

export async function remove(c: CollectionName, id: string): Promise<void> {
  await q(`delete from ${c} where id = $1`, [id]);
}

/** Replace everything (Import), all or nothing: inside a transaction, a failure part-way leaves the old data in place. */
export async function replaceAll(d: unknown): Promise<State> {
  const data = linkSafe(norm(d));
  await ready();
  const client = await pool!.connect();
  try {
    await client.query("begin");
    await client.query("delete from entries; delete from milestones; delete from topics; delete from tracks;");
    for (const c of COLS) {
      const names = cols(c);
      // many rows per insert: one round trip to Neon per 500 rows instead of one per row
      for (let i = 0; i < data[c].length; i += 500) {
        const chunk = data[c].slice(i, i + 500);
        const values = chunk.flatMap((rec) => toDb(c, rec));
        const rows = chunk.map((_, r) => "(" + names.map((_, k) => `$${r * names.length + k + 1}`).join(", ") + ")").join(", ");
        await client.query(`insert into ${c} (${names.join(", ")}) values ${rows} on conflict (id) do nothing`, values);
      }
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return loadAll();
}
