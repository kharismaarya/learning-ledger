import { describe, expect, it, vi } from "vitest";
import backup from "../../data/learning-ledger-2026-10-10.json";
import { KEY, LocalDB, type DbError } from "./localDb";

const flush = () => new Promise((r) => setTimeout(r));
const saved = () => JSON.parse(localStorage.getItem(KEY)!);
const topic = { trackId: "t1", name: "Git", createdAt: 1 };

describe("LocalDB", () => {
  it("set / update / delete persist to localStorage in the export shape", async () => {
    const ref = LocalDB.collection("topics").doc();
    expect(ref.id).toMatch(/^[a-z0-9]{15}$/);
    await ref.set(topic);
    expect(saved()).toMatchObject({ app: "learning-ledger", schema: 1, topics: [{ id: ref.id, name: "Git" }] });

    await ref.update({ name: "Git & GitHub" });
    expect(saved().topics[0]).toEqual({ ...topic, id: ref.id, name: "Git & GitHub" });

    await ref.delete();
    expect(saved().topics).toEqual([]);
  });

  it("set with a fixed id replaces the record instead of duplicating it", async () => {
    await LocalDB.collection("topics").doc("x").set(topic);
    await LocalDB.collection("topics").doc("x").set({ ...topic, name: "Again" });
    expect(saved().topics).toEqual([{ ...topic, id: "x", name: "Again" }]);
  });

  it("update of a missing record fails with invalid_argument", async () => {
    await expect(LocalDB.doc("topics", "nope").update({ name: "x" })).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("onSnapshot delivers the current rows, then every change, until unsubscribed", async () => {
    await LocalDB.collection("topics").doc("a").set(topic);
    const seen: string[][] = [];
    const off = LocalDB.collection("topics").onSnapshot((rows) => seen.push(rows.map((r) => r.id)));
    await flush();
    await LocalDB.collection("topics").doc("b").set(topic);
    await flush();
    off();
    await LocalDB.collection("topics").doc("c").set(topic);
    await flush();
    expect(seen).toEqual([["a"], ["a", "b"]]);
  });

  it("snapshots are copies: mutating them doesn't change stored data", async () => {
    await LocalDB.collection("topics").doc("a").set(topic);
    let rows: { name: string }[] = [];
    LocalDB.collection("topics").onSnapshot((r) => (rows = r));
    await flush();
    rows[0].name = "mutated";
    expect(saved().topics[0].name).toBe("Git");
  });

  it("a full browser storage rolls the change back and reports quota_exceeded", async () => {
    await LocalDB.collection("topics").doc("a").set(topic);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    const err = await LocalDB.collection("topics").doc("b").set(topic).catch((e: DbError) => e);
    spy.mockRestore();
    expect(err).toMatchObject({ code: "quota_exceeded" });
    expect(LocalDB.counts().tracks).toBe(0);
    expect(LocalDB.exportData().topics.map((t) => t.id)).toEqual(["a"]);
  });

  it("validate explains what's wrong with a file", () => {
    expect(LocalDB.validate(null)).toMatch(/isn't a Learning Ledger file/);
    expect(LocalDB.validate({ app: "other" })).toMatch(/isn't a Learning Ledger file/);
    expect(LocalDB.validate({ app: "learning-ledger", schema: 2, tracks: [], topics: [], milestones: [], entries: [] })).toMatch(/newer version/);
    expect(LocalDB.validate({ app: "learning-ledger", schema: 1, tracks: [] })).toMatch(/missing/);
    expect(LocalDB.validate({ app: "learning-ledger", schema: 1, tracks: [], topics: [], milestones: [], entries: [] })).toBeNull();
  });

  it("replaceAll drops rows without a string id", () => {
    LocalDB.replaceAll({ tracks: [{ id: "t" }, { id: 3 }, null, { title: "no id" }], topics: "junk" });
    const out = LocalDB.exportData();
    expect(out.tracks.map((t) => t.id)).toEqual(["t"]);
    expect(out.topics).toEqual([]);
  });

  it("the real backup in data/ still validates, imports and round-trips through export", () => {
    expect(LocalDB.validate(backup)).toBeNull();
    LocalDB.replaceAll(backup);
    expect(LocalDB.counts()).toEqual({ tracks: 1, entries: 15 });
    const out = LocalDB.exportData();
    expect(out).toMatchObject({ app: "learning-ledger", schema: 1 });
    expect(typeof out.exportedAt).toBe("string");
    for (const c of ["tracks", "topics", "milestones", "entries"] as const) expect(out[c]).toEqual(backup[c]);
  });

  it("follows changes another tab writes to the same key", async () => {
    const seen: number[] = [];
    LocalDB.collection("tracks").onSnapshot((rows) => seen.push(rows.length));
    await flush();
    window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: JSON.stringify({ tracks: [{ id: "other-tab" }] }) }));
    await flush();
    expect(seen.at(-1)).toBe(1);
    expect(LocalDB.exportData().tracks[0].id).toBe("other-tab");
  });
});

describe("LocalDB when storage is blocked", () => {
  it("runs in memory only and never writes", async () => {
    vi.resetModules();
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const set = vi.spyOn(Storage.prototype, "setItem");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { LocalDB: Fresh } = await import("./localDb");
    expect(Fresh.memoryOnly).toBe(true);
    await Fresh.collection("topics").doc("a").set(topic);
    expect(Fresh.exportData().topics).toHaveLength(1);
    expect(set).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    get.mockRestore();
  });
});
