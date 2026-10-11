/* The Ledger's data format, shared by the browser (src/db/db.ts) and the server (server/).
   No browser or Node APIs here, so both sides can import it. */
import type { CollectionName } from "../types";

export const APP = "learning-ledger";
export const SCHEMA = 1;
export const COLS: CollectionName[] = ["tracks", "topics", "milestones", "entries"];

export type Row = { id: string } & Record<string, unknown>;
export type State = Record<CollectionName, Row[]>;

export const blank = (): State => ({ tracks: [], topics: [], milestones: [], entries: [] });

/** Keep the four collections, and only rows that have a string id. Migrate old schemas here. */
export const norm = (d: unknown): State => {
  const o = blank();
  const src = (d || {}) as Record<string, unknown>;
  COLS.forEach((c) => {
    const v = src[c];
    o[c] = Array.isArray(v) ? v.filter((r): r is Row => !!r && typeof r.id === "string") : [];
  });
  return o;
};

export const isEmpty = (s: State) => COLS.every((c) => s[c].length === 0);

/** Why a file can't be imported, or null if it can. */
export function validate(d: unknown): string | null {
  const o = d as Record<string, unknown> | null;
  if (!o || o.app !== APP) return "This isn't a Learning Ledger file.";
  if (typeof o.schema === "number" && o.schema > SCHEMA) return "This file comes from a newer version of the Ledger.";
  if (!COLS.every((c) => Array.isArray(o[c]))) return "This file is missing tracks, topics, milestones or entries.";
  return null;
}
