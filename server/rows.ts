/* How app records (camelCase JSON) map to Postgres rows (snake_case columns).
   Pure functions, no database connection, so they're easy to test (rows.test.ts). */
import type { CollectionName } from "../src/types.ts";
import { COLS, type Row, type State } from "../src/db/format.ts";

/** text: "" is stored as NULL and read back as "". opt: NULL is read back as a missing field. */
type Kind = "text" | "num" | "bool";
interface Field {
  key: string;
  col: string;
  kind: Kind;
  opt?: boolean;
}
const f = (key: string, col: string, kind: Kind = "text", opt = false): Field => ({ key, col, kind, opt });

export const FIELDS: Record<CollectionName, Field[]> = {
  tracks: [
    f("id", "id"),
    f("title", "title"),
    f("outcome", "outcome"),
    f("why", "why"),
    f("doneWhen", "done_when"),
    f("startDate", "start_date"),
    f("targetDate", "target_date"),
    f("nextStep", "next_step", "text", true),
    f("createdAt", "created_at", "num"),
  ],
  topics: [f("id", "id"), f("trackId", "track_id"), f("name", "name"), f("createdAt", "created_at", "num")],
  milestones: [
    f("id", "id"),
    f("trackId", "track_id"),
    f("order", "ord", "num"),
    f("title", "title"),
    f("status", "status"),
    f("due", "due"),
    f("doneAt", "done_at"),
    f("nextStep", "next_step", "text", true),
  ],
  entries: [
    f("id", "id"),
    f("trackId", "track_id"),
    f("topicId", "topic_id"),
    f("milestoneId", "milestone_id"),
    f("type", "type"),
    f("text", "text"),
    f("url", "url"),
    f("date", "date"),
    f("createdAt", "created_at", "num"),
    f("resolved", "resolved", "bool", true),
    f("answer", "answer", "text", true),
  ],
};

/** The tables, in the order they can be filled (each one only links to tables before it). */
export const SCHEMA_SQL = `
create table if not exists tracks (
  id text primary key,
  title text, outcome text, why text, done_when text, start_date text, target_date text, next_step text,
  created_at bigint
);
create table if not exists topics (
  id text primary key,
  track_id text not null references tracks(id) on delete cascade,
  name text,
  created_at bigint
);
create table if not exists milestones (
  id text primary key,
  track_id text not null references tracks(id) on delete cascade,
  ord integer,
  title text,
  status text check (status in ('todo', 'doing', 'done')),
  due text, done_at text, next_step text
);
create table if not exists entries (
  id text primary key,
  track_id text not null references tracks(id) on delete cascade,
  topic_id text references topics(id) on delete set null,
  milestone_id text references milestones(id) on delete set null,
  type text check (type in ('source', 'insight', 'question', 'build', 'milestone')),
  text text, url text, date text,
  created_at bigint,
  resolved boolean,
  answer text
);`;

function toCol(v: unknown, kind: Kind): unknown {
  if (v === undefined || v === null) return null;
  if (kind === "num") return Number.isFinite(Number(v)) ? Number(v) : null;
  if (kind === "bool") return Boolean(v);
  return v === "" ? null : String(v);
}

/** App record → column values, in FIELDS order. Fields not listed in FIELDS are dropped. */
export function toDb(c: CollectionName, rec: Record<string, unknown>): unknown[] {
  return FIELDS[c].map((fl) => toCol(rec[fl.key], fl.kind));
}

/** Only the fields present in a partial update, as [column, value] pairs. `id` can't be changed. */
export function patchToDb(c: CollectionName, patch: Record<string, unknown>): [string, unknown][] {
  return FIELDS[c].filter((fl) => fl.key !== "id" && fl.key in patch).map((fl) => [fl.col, toCol(patch[fl.key], fl.kind)]);
}

/** Postgres row → app record. bigint arrives as a string from `pg`, so numbers are converted back. */
export function fromDb(c: CollectionName, row: Record<string, unknown>): Row {
  const out: Record<string, unknown> = {};
  for (const fl of FIELDS[c]) {
    const v = row[fl.col];
    if (v === null || v === undefined) {
      if (!fl.opt) out[fl.key] = fl.kind === "num" ? 0 : fl.kind === "bool" ? false : "";
    } else out[fl.key] = fl.kind === "num" ? Number(v) : v;
  }
  return out as Row;
}

/** Make an import safe for the foreign keys: drop records whose track is missing,
    and clear links to topics or milestones that don't exist (old backups can have these). */
export function linkSafe(s: State): State {
  const ids = (c: CollectionName) => new Set(s[c].map((r) => r.id));
  const tracks = ids("tracks");
  const onTrack = (r: Row) => tracks.has(r.trackId as string);
  const topics = s.topics.filter(onTrack);
  const milestones = s.milestones.filter(onTrack);
  const topicIds = new Set(topics.map((r) => r.id));
  const msIds = new Set(milestones.map((r) => r.id));
  const entries = s.entries.filter(onTrack).map((e) => {
    const out = { ...e };
    if (e.topicId && !topicIds.has(e.topicId as string)) out.topicId = "";
    if (e.milestoneId && !msIds.has(e.milestoneId as string)) out.milestoneId = "";
    return out;
  });
  return { tracks: s.tracks, topics, milestones, entries };
}

export const isCollection = (c: string): c is CollectionName => (COLS as string[]).includes(c);
