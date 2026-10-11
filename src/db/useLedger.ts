import { useEffect, useState } from "react";
import { db } from "./db";
import type { Entry, Milestone, Topic, Track } from "../types";

export interface Ledger {
  tracks: Track[];
  topics: Topic[];
  milestones: Milestone[];
  entries: Entry[];
  loaded: { tracks: boolean; topics: boolean; milestones: boolean; entries: boolean };
}

/** Live view of all four collections. */
export function useLedger(): Ledger {
  const [d, setD] = useState<Ledger>({
    tracks: [],
    topics: [],
    milestones: [],
    entries: [],
    loaded: { tracks: false, topics: false, milestones: false, entries: false },
  });
  useEffect(() => {
    const sub = <K extends "tracks" | "topics" | "milestones" | "entries">(c: K) =>
      db.collection(c).onSnapshot((rows) => setD((s) => ({ ...s, [c]: rows, loaded: { ...s.loaded, [c]: true } })));
    const offs = [sub("tracks"), sub("topics"), sub("milestones"), sub("entries")];
    return () => offs.forEach((off) => off());
  }, []);
  return d;
}
