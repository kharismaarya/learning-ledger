/* The app's data module: the same small API as before (collection/doc, set/update/delete, onSnapshot),
   now saving to the server's /api, which stores everything in Postgres.

   Components read from an in-memory copy (the cache), so rendering never waits on the network.
   Writes go to the server first and change the cache only once the server confirms, so the screen
   never shows something that wasn't saved. */
import type { CollectionName, Collections } from "../types";
import { APP, COLS, SCHEMA, blank, isEmpty, norm, validate, type Row, type State } from "./format";

/** Where the browser-only version kept its data. Read once, to move it into the database. */
export const KEY = "learning-ledger";
export const BKEY = "learning-ledger:lastExport";

export interface DbError {
  code: "server_unavailable" | "invalid_argument";
  message: string;
}
type Listener = (rows: Row[]) => void;

let state: State = blank();
let loaded = false;
let loading: Promise<{ moved: boolean }> | null = null;

const subs = Object.fromEntries(COLS.map((c) => [c, new Set<Listener>()])) as Record<CollectionName, Set<Listener>>;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const notify = (cs: CollectionName[]) => queueMicrotask(() => cs.forEach((c) => subs[c].forEach((cb) => cb(clone(state[c])))));

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api" + path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw { code: "server_unavailable", message: String(e) } satisfies DbError;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok)
    throw { code: res.status >= 500 ? "server_unavailable" : "invalid_argument", message: data?.error || res.statusText } satisfies DbError;
  return data as T;
}

const newId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(15)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36])
    .join("")
    .slice(0, 20);

/** Put the server's copy of a record into the cache. */
function put(c: CollectionName, row: Row) {
  const i = state[c].findIndex((r) => r.id === row.id);
  state[c] = i < 0 ? [...state[c], row] : state[c].map((r, j) => (j === i ? row : r));
  notify([c]);
}

export interface DocRef<T> {
  id: string;
  path: string;
  set(data: Omit<T, "id">): Promise<void>;
  update(data: Partial<Omit<T, "id">>): Promise<void>;
  delete(): Promise<void>;
}

function ref<C extends CollectionName>(c: C, id: string): DocRef<Collections[C]> {
  const url = `/${c}/${encodeURIComponent(id)}`;
  return {
    id,
    path: c + "/" + id,
    async set(data) {
      put(c, await api<Row>("PUT", url, data));
    },
    async update(data) {
      put(c, await api<Row>("PATCH", url, data));
    },
    async delete() {
      await api("DELETE", url);
      state[c] = state[c].filter((r) => r.id !== id);
      notify([c]);
    },
  };
}

function collection<C extends CollectionName>(c: C) {
  if (!COLS.includes(c)) throw new TypeError("Unknown collection " + c);
  return {
    doc: (id?: string) => ref(c, id || newId()),
    /** Calls back with the rows once they've loaded, then after every change, until unsubscribed. */
    onSnapshot(cb: (rows: Collections[C][]) => void): () => void {
      const l = cb as unknown as Listener;
      subs[c].add(l);
      if (loaded) queueMicrotask(() => subs[c].has(l) && l(clone(state[c])));
      return () => {
        subs[c].delete(l);
      };
    },
  };
}

function readBrowserData(): State | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? norm(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

async function doLoad(): Promise<{ moved: boolean }> {
  let d = norm(await api("GET", "/ledger"));
  let moved = false;
  // First run with a database: move what this browser saved before. localStorage is left as a spare copy.
  const local = isEmpty(d) ? readBrowserData() : null;
  if (local && !isEmpty(local)) {
    d = norm(await api("PUT", "/ledger", { app: APP, schema: SCHEMA, ...local }));
    moved = true;
  }
  state = d;
  loaded = true;
  notify(COLS);
  return { moved };
}

export const db = {
  collection,
  doc<C extends CollectionName>(c: C, id: string): DocRef<Collections[C]> {
    collection(c);
    return ref(c, id);
  },
  /** Fetch everything from the server. Calls made while a load is running share it. */
  load(): Promise<{ moved: boolean }> {
    loading ??= doLoad().finally(() => (loading = null));
    return loading;
  },
  counts: () => ({ tracks: state.tracks.length, entries: state.entries.length }),
  exportData: () => ({ app: APP, schema: SCHEMA, exportedAt: new Date().toISOString(), ...state }),
  /** Replace everything in the database (Import). */
  async replaceAll(d: unknown) {
    state = norm(await api("PUT", "/ledger", { app: APP, schema: SCHEMA, ...norm(d) }));
    loaded = true;
    notify(COLS);
  },
  validate,
};
export type Db = typeof db;
