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

/* The database schema, as a list of migrations. Each one runs once, in order, and the schema_migrations table records
   which have run (server/db.ts). `create table if not exists` can't change a table that's already there, so any change
   to an existing table needs a new migration at the end of this list. Never edit one that has already run on Neon.

   Every record belongs to a user. Each table's key is (user_id, id), not just id, because ids are made by the browser
   and two people can import the same backup. The foreign keys include user_id too, so a topic can only ever point at a
   track of the same user. user_id isn't in FIELDS: it always comes from the session, never from a request. */
export const MIGRATIONS: string[] = [
  `-- 1: accounts. Tables from before accounts had no owner, so they move aside into a "legacy" schema (they keep their
  -- rows, indexes and constraints, and the new tables can reuse the names). Export/Import moves the data to an account.
  do $$ begin
    if to_regclass('public.tracks') is not null then
      create schema if not exists legacy;
      alter table public.entries set schema legacy;
      alter table public.milestones set schema legacy;
      alter table public.topics set schema legacy;
      alter table public.tracks set schema legacy;
    end if;
  end $$;

  create table users (
    id text primary key,
    email text not null unique check (email = lower(email)),
    password_hash text not null,
    email_verified_at timestamptz, -- set by email verification, once there's an email service
    created_at timestamptz not null default now()
  );
  create table sessions (
    token_hash text primary key, -- sha256 of the cookie's token; the token itself is never stored
    user_id text not null references users(id) on delete cascade,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null
  );
  create index sessions_user_id on sessions (user_id);

  create table tracks (
    user_id text not null references users(id) on delete cascade,
    id text not null,
    title text, outcome text, why text, done_when text, start_date text, target_date text, next_step text,
    created_at bigint,
    primary key (user_id, id)
  );
  create table topics (
    user_id text not null,
    id text not null,
    track_id text not null,
    name text,
    created_at bigint,
    primary key (user_id, id),
    foreign key (user_id, track_id) references tracks(user_id, id) on delete cascade
  );
  create table milestones (
    user_id text not null,
    id text not null,
    track_id text not null,
    ord integer,
    title text,
    status text check (status in ('todo', 'doing', 'done')),
    due text, done_at text, next_step text,
    primary key (user_id, id),
    foreign key (user_id, track_id) references tracks(user_id, id) on delete cascade
  );
  create table entries (
    user_id text not null,
    id text not null,
    track_id text not null,
    topic_id text,
    milestone_id text,
    type text check (type in ('source', 'insight', 'question', 'build', 'milestone')),
    text text, url text, date text,
    created_at bigint,
    resolved boolean,
    answer text,
    primary key (user_id, id),
    foreign key (user_id, track_id) references tracks(user_id, id) on delete cascade,
    -- "set null (topic_id)" clears just the link and keeps user_id (Postgres 15+)
    foreign key (user_id, topic_id) references topics(user_id, id) on delete set null (topic_id),
    foreign key (user_id, milestone_id) references milestones(user_id, id) on delete set null (milestone_id)
  );`,
];

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
