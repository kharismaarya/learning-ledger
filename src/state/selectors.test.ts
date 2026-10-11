import { describe, expect, it } from "vitest";
import type { Ledger } from "../db/useLedger";
import type { Entry, Milestone, Topic, Track } from "../types";
import { initialUi, selectors, type Ui } from "./AppContext";

const track = (id: string, createdAt: number): Track => ({ id, title: id, outcome: "", why: "", doneWhen: "", startDate: "", targetDate: "", createdAt });
const ms = (id: string, order: number, status: Milestone["status"], trackId = "a"): Milestone => ({ id, trackId, order, title: id, status, due: "", doneAt: "" });
const entry = (id: string, date: string, createdAt: number, extra: Partial<Entry> = {}): Entry => ({
  id, trackId: "a", topicId: "t1", milestoneId: "", type: "insight", text: id, url: "", date, createdAt, ...extra,
});
const topic = (id: string, name: string, trackId = "a"): Topic => ({ id, trackId, name, createdAt: 0 });

function ledger(p: Partial<Ledger> = {}): Ledger {
  return {
    tracks: [track("b", 2), track("a", 1)],
    topics: [topic("t2", "Zeta"), topic("t1", "Alpha"), topic("tx", "Other track", "b")],
    milestones: [ms("m3", 3, "todo"), ms("m1", 1, "done"), ms("m2", 2, "todo"), ms("mb", 1, "doing", "b")],
    entries: [entry("old", "2026-10-01", 5), entry("new-early", "2026-10-09", 1), entry("new-late", "2026-10-09", 9), entry("other", "2026-10-10", 1, { trackId: "b" })],
    loaded: { tracks: true, topics: true, milestones: true, entries: true },
    ...p,
  };
}
const run = (ui: Partial<Ui> = {}, p?: Partial<Ledger>) => selectors(ledger(p), { ...initialUi, cur: null, ...ui });

describe("selectors", () => {
  it("falls back to the oldest track when the saved one is missing", () => {
    expect(run({ cur: "gone" }).curId).toBe("a");
    expect(run({ cur: "b" }).curId).toBe("b");
  });

  it("has no current track while creating a new one", () => {
    const s = run({ cur: "a", newTrack: true });
    expect(s.track).toBeNull();
    expect(s.curId).toBe("a");
  });

  it("sorts the track's entries newest date first, then newest created", () => {
    expect(run({ cur: "a" }).tEntries.map((e) => e.id)).toEqual(["new-late", "new-early", "old"]);
  });

  it("orders milestones and topics, and only for the current track", () => {
    const s = run({ cur: "a" });
    expect(s.tMs.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(s.tTopics.map((t) => t.name)).toEqual(["Alpha", "Zeta"]);
  });

  it("curMs is the milestone in progress; upNext is the first to-do", () => {
    const a = run({ cur: "a" });
    expect(a.curMs).toBeNull();
    expect(a.upNext?.id).toBe("m2");
    expect(run({ cur: "b" }).curMs?.id).toBe("mb");
  });

  it("topicOf ignores topics that belong to another track", () => {
    const s = run({ cur: "a" });
    expect(s.topicOf(entry("x", "", 0, { topicId: "t1" }))?.name).toBe("Alpha");
    expect(s.topicOf(entry("x", "", 0, { topicId: "tx" }))).toBeNull();
    expect(s.topicOf(entry("x", "", 0, { topicId: "" }))).toBeNull();
  });

  it("msLog lists entries toward a milestone, without its own milestone entry", () => {
    const s = run({ cur: "a" }, {
      entries: [entry("b1", "2026-10-01", 1, { milestoneId: "m1", type: "build" }), entry("ms-m1", "2026-10-02", 2, { milestoneId: "m1", type: "milestone" })],
    });
    expect(s.msLog(s.tMs[0]).map((e) => e.id)).toEqual(["b1"]);
  });

  it("drops filters that point at deleted topics or milestones, once loaded", () => {
    expect(run({ cur: "a", topicFilter: "deleted" }).topicFilter).toBeNull();
    expect(run({ cur: "a", topicFilter: "__none" }).topicFilter).toBe("__none");
    expect(run({ cur: "a", topicFilter: "t1" }).topicFilter).toBe("t1");
    expect(run({ cur: "a", msFilter: "deleted" }).msFilter).toBeNull();
    const loading = { tracks: true, topics: false, milestones: false, entries: true };
    expect(run({ cur: "a", topicFilter: "deleted", msFilter: "deleted" }, { loaded: loading })).toMatchObject({ topicFilter: "deleted", msFilter: "deleted" });
  });
});
