/* Local store: the same small API the claude.ai version used (collection/doc, set/update/delete, onSnapshot),
   backed by one JSON object in localStorage. Swap this module for a backend later. */
import type { CollectionName, Collections } from "../types";

export const KEY = "learning-ledger";
export const BKEY = "learning-ledger:lastExport";
const COLS: CollectionName[] = ["tracks", "topics", "milestones", "entries"];

export interface DbError {
  code: "quota_exceeded" | "unavailable" | "invalid_argument";
  message: string;
}
type Row = { id: string } & Record<string, unknown>;
type State = Record<CollectionName, Row[]>;
type Listener = (rows: Row[]) => void;

const blank = (): State => ({ tracks: [], topics: [], milestones: [], entries: [] });
const norm = (d: unknown): State => {
  const o = blank();
  const src = (d || {}) as Record<string, unknown>;
  COLS.forEach((c) => {
    const v = src[c];
    o[c] = Array.isArray(v) ? v.filter((r): r is Row => !!r && typeof r.id === "string") : [];
  });
  return o;
};
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

let memoryOnly = false;
let state: State;
try {
  const raw = localStorage.getItem(KEY);
  state = raw ? norm(JSON.parse(raw)) : blank();
} catch (e) {
  console.error(e);
  memoryOnly = true;
  state = blank();
}

const subs = Object.fromEntries(COLS.map((c) => [c, new Set<Listener>()])) as Record<CollectionName, Set<Listener>>;
const notify = (cs: CollectionName[]) => queueMicrotask(() => cs.forEach((c) => subs[c].forEach((cb) => cb(clone(state[c])))));
const persist = () => {
  if (memoryOnly) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ app: "learning-ledger", schema: 1, ...state }));
  } catch (e) {
    const err: DbError = {
      code: e instanceof DOMException && e.name === "QuotaExceededError" ? "quota_exceeded" : "unavailable",
      message: String(e),
    };
    throw err;
  }
};
const commit = (c: CollectionName, before: Row[]) => {
  try {
    persist();
  } catch (e) {
    state[c] = before;
    throw e;
  }
  notify([c]);
};
const newId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(15)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36])
    .join("")
    .slice(0, 20);

export interface DocRef<T> {
  id: string;
  path: string;
  set(data: Omit<T, "id">): Promise<void>;
  update(data: Partial<Omit<T, "id">>): Promise<void>;
  delete(): Promise<void>;
}

function ref<C extends CollectionName>(c: C, id: string): DocRef<Collections[C]> {
  return {
    id,
    path: c + "/" + id,
    async set(data) {
      const before = state[c];
      const row: Row = { ...clone(data), id };
      const i = before.findIndex((r) => r.id === id);
      state[c] = i < 0 ? [...before, row] : before.map((r, j) => (j === i ? row : r));
      commit(c, before);
    },
    async update(data) {
      const before = state[c];
      const i = before.findIndex((r) => r.id === id);
      if (i < 0) throw { code: "invalid_argument", message: "No such record: " + c + "/" + id } satisfies DbError;
      const row: Row = { ...before[i], ...clone(data) };
      state[c] = before.map((r, j) => (j === i ? row : r));
      commit(c, before);
    },
    async delete() {
      const before = state[c];
      state[c] = before.filter((r) => r.id !== id);
      commit(c, before);
    },
  };
}

function collection<C extends CollectionName>(c: C) {
  if (!COLS.includes(c)) throw new TypeError("Unknown collection " + c);
  return {
    doc: (id?: string) => ref(c, id || newId()),
    onSnapshot(cb: (rows: Collections[C][]) => void): () => void {
      const l = cb as unknown as Listener;
      subs[c].add(l);
      queueMicrotask(() => l(clone(state[c])));
      return () => {
        subs[c].delete(l);
      };
    },
  };
}

window.addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  try {
    state = e.newValue ? norm(JSON.parse(e.newValue)) : blank();
    notify(COLS);
  } catch {
    /* ignore */
  }
});

export const LocalDB = {
  collection,
  doc<C extends CollectionName>(c: C, id: string): DocRef<Collections[C]> {
    collection(c);
    return ref(c, id);
  },
  get memoryOnly() {
    return memoryOnly;
  },
  counts: () => ({ tracks: state.tracks.length, entries: state.entries.length }),
  exportData: () => ({ app: "learning-ledger", schema: 1, exportedAt: new Date().toISOString(), ...state }),
  replaceAll(d: unknown) {
    const before = state;
    state = norm(d);
    try {
      persist();
    } catch (e) {
      state = before;
      throw e;
    }
    notify(COLS);
  },
  validate(d: unknown): string | null {
    const o = d as Record<string, unknown> | null;
    if (!o || o.app !== "learning-ledger") return "This isn't a Learning Ledger file.";
    if (typeof o.schema === "number" && o.schema > 1) return "This file comes from a newer version of the Ledger.";
    if (!COLS.every((c) => Array.isArray(o[c]))) return "This file is missing tracks, topics, milestones or entries.";
    return null;
  },
};
export type Db = typeof LocalDB;
