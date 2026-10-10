export type EntryType = "source" | "insight" | "question" | "build" | "milestone";
export type Status = "todo" | "doing" | "done";

export interface Track {
  id: string;
  title: string;
  outcome: string;
  why: string;
  doneWhen: string;
  startDate: string;
  targetDate: string;
  nextStep?: string;
  createdAt: number;
}
export interface Topic {
  id: string;
  trackId: string;
  name: string;
  createdAt: number;
}
export interface Milestone {
  id: string;
  trackId: string;
  order: number;
  title: string;
  status: Status;
  due: string;
  doneAt: string;
  nextStep?: string;
}
export interface Entry {
  id: string;
  trackId: string;
  topicId: string;
  milestoneId: string;
  type: EntryType;
  text: string;
  url: string;
  date: string;
  createdAt: number;
  resolved?: boolean;
  answer?: string;
}

export interface Collections {
  tracks: Track;
  topics: Topic;
  milestones: Milestone;
  entries: Entry;
}
export type CollectionName = keyof Collections;
export type LedgerData = { [C in CollectionName]: Collections[C][] };

export interface TypeInfo {
  k: EntryType;
  n: string;
  c: string;
}
export const TYPES: TypeInfo[] = [
  { k: "source", n: "Source", c: "var(--t-source)" },
  { k: "insight", n: "Insight", c: "var(--t-insight)" },
  { k: "question", n: "Question", c: "var(--t-question)" },
  { k: "build", n: "Build", c: "var(--t-build)" },
  { k: "milestone", n: "Milestone", c: "var(--t-milestone)" },
];
export const TMAP = Object.fromEntries(TYPES.map((t) => [t.k, t])) as Record<EntryType, TypeInfo>;
/** milestone entries are created by ticking a milestone done */
export const PICK = TYPES.filter((t) => t.k !== "milestone");
