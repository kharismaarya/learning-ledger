import { describe, expect, it } from "vitest";
import backup from "../data/learning-ledger-2026-10-10.json";
import { COLS, norm } from "../src/db/format.ts";
import { FIELDS, fromDb, linkSafe, patchToDb, toDb } from "./rows.ts";

/** what Postgres would hand back for a row inserted with toDb (bigint comes back as a string) */
function viaDb(c: (typeof COLS)[number], rec: Record<string, unknown>) {
  const values = toDb(c, rec);
  const row = Object.fromEntries(FIELDS[c].map((f, i) => [f.col, f.kind === "num" && values[i] !== null ? String(values[i]) : values[i]]));
  return fromDb(c, row);
}

describe("row mapping", () => {
  it("maps camelCase fields to snake_case columns, in FIELDS order", () => {
    const values = toDb("entries", { id: "e", trackId: "t", topicId: "p", milestoneId: "", type: "build", text: "x", url: "", date: "2026-10-10", createdAt: 5 });
    expect(values).toEqual(["e", "t", "p", null, "build", "x", null, "2026-10-10", 5, null, null]);
    expect(FIELDS.entries.map((f) => f.col)).toContain("milestone_id");
  });

  it("drops fields the database doesn't store", () => {
    expect(toDb("topics", { id: "p", trackId: "t", name: "n", createdAt: 1, color: "red" })).toEqual(["p", "t", "n", 1]);
  });

  it("reads NULL back as an empty string, or as a missing field when the field is optional", () => {
    expect(fromDb("milestones", { id: "m", track_id: "t", ord: 1, title: "x", status: "todo", due: null, done_at: null, next_step: null })).toEqual({
      id: "m",
      trackId: "t",
      order: 1,
      title: "x",
      status: "todo",
      due: "",
      doneAt: "",
    });
  });

  it("turns bigint strings from pg back into numbers", () => {
    expect(fromDb("topics", { id: "p", track_id: "t", name: "n", created_at: "1760000000000" }).createdAt).toBe(1760000000000);
  });

  it("a partial update only touches the fields it names, and never the id", () => {
    expect(patchToDb("milestones", { status: "done", doneAt: "", id: "evil", nope: 1 })).toEqual([
      ["status", "done"],
      ["done_at", null],
    ]);
  });

  it("every record in the real backup survives a trip through the database", () => {
    for (const c of COLS)
      for (const rec of backup[c] as Record<string, unknown>[]) {
        // optional fields that were empty come back missing, and missing required ones come back as ""
        // (the app treats all of these the same)
        const expected = Object.fromEntries(
          FIELDS[c].flatMap((f) => {
            const v = rec[f.key] ?? (f.opt ? "" : f.kind === "num" ? 0 : "");
            return v === "" && f.opt ? [] : [[f.key, v]];
          }),
        );
        expect(viaDb(c, rec)).toEqual(expected);
      }
  });
});

describe("linkSafe", () => {
  it("drops records whose track is gone and clears links to missing topics and milestones", () => {
    const s = linkSafe(
      norm({
        tracks: [{ id: "t" }],
        topics: [{ id: "p", trackId: "t" }, { id: "orphan", trackId: "gone" }],
        milestones: [{ id: "m", trackId: "t" }],
        entries: [
          { id: "ok", trackId: "t", topicId: "p", milestoneId: "m" },
          { id: "dangling", trackId: "t", topicId: "orphan", milestoneId: "deleted" },
          { id: "lost", trackId: "gone", topicId: "", milestoneId: "" },
        ],
      }),
    );
    expect(s.topics.map((r) => r.id)).toEqual(["p"]);
    expect(s.entries).toEqual([
      { id: "ok", trackId: "t", topicId: "p", milestoneId: "m" },
      { id: "dangling", trackId: "t", topicId: "", milestoneId: "" },
    ]);
  });

  it("leaves the real backup as it is", () => {
    expect(linkSafe(norm(backup))).toEqual(norm(backup));
  });
});
