import { describe, expect, it } from "vitest";
import backup from "../../data/learning-ledger-2026-10-10.json";
import { fakeApi } from "../test/fakeApi";
import { KEY, db, type DbError } from "./db";

const flush = () => new Promise((r) => setTimeout(r));
const topic = { trackId: "t1", name: "Git", createdAt: 1 };

describe("db", () => {
  it("set / update / delete go to the server, then to the cache", async () => {
    const ref = db.collection("topics").doc();
    expect(ref.id).toMatch(/^[a-z0-9]{15}$/);
    await ref.set(topic);
    expect(fakeApi.calls).toEqual([`PUT /api/topics/${ref.id}`]);
    expect(fakeApi.data.topics).toEqual([{ ...topic, id: ref.id }]);
    expect(db.exportData().topics).toEqual([{ ...topic, id: ref.id }]);

    await ref.update({ name: "Git & GitHub" });
    expect(fakeApi.data.topics[0]).toEqual({ ...topic, id: ref.id, name: "Git & GitHub" });
    expect(db.exportData().topics[0].name).toBe("Git & GitHub");

    await ref.delete();
    expect(fakeApi.data.topics).toEqual([]);
    expect(db.exportData().topics).toEqual([]);
  });

  it("set with a fixed id replaces the record instead of duplicating it", async () => {
    await db.collection("topics").doc("x").set(topic);
    await db.collection("topics").doc("x").set({ ...topic, name: "Again" });
    expect(db.exportData().topics).toEqual([{ ...topic, id: "x", name: "Again" }]);
  });

  it("the cache keeps what the server sent back, not what was sent", async () => {
    // e.g. the real server drops fields it doesn't store
    await db.collection("topics").doc("x").set({ ...topic, extra: "dropped" } as typeof topic);
    fakeApi.data.topics = [{ ...topic, id: "x" }];
    await db.doc("topics", "x").update({ name: "Server copy" });
    expect(db.exportData().topics[0]).toEqual({ ...topic, id: "x", name: "Server copy" });
  });

  it("update of a missing record fails with invalid_argument", async () => {
    await expect(db.doc("topics", "nope").update({ name: "x" })).rejects.toMatchObject({ code: "invalid_argument", message: "No such record: topics/nope" });
  });

  it("a failed write leaves the cache unchanged and reports server_unavailable", async () => {
    await db.collection("topics").doc("a").set(topic);
    for (const fail of ["network", 503] as const) {
      fakeApi.fail = fail;
      const err = await db.collection("topics").doc("b").set(topic).catch((e: DbError) => e);
      expect(err).toMatchObject({ code: "server_unavailable" });
      await expect(db.doc("topics", "a").delete()).rejects.toMatchObject({ code: "server_unavailable" });
    }
    expect(db.exportData().topics.map((t) => t.id)).toEqual(["a"]);
  });

  it("onSnapshot delivers the current rows, then every change, until unsubscribed", async () => {
    await db.collection("topics").doc("a").set(topic);
    const seen: string[][] = [];
    const off = db.collection("topics").onSnapshot((rows) => seen.push(rows.map((r) => r.id)));
    await flush();
    await db.collection("topics").doc("b").set(topic);
    await flush();
    off();
    await db.collection("topics").doc("c").set(topic);
    await flush();
    expect(seen).toEqual([["a"], ["a", "b"]]);
  });

  it("snapshots are copies: mutating them doesn't change the cache", async () => {
    await db.collection("topics").doc("a").set(topic);
    let rows: { name: string }[] = [];
    db.collection("topics").onSnapshot((r) => (rows = r));
    await flush();
    rows[0].name = "mutated";
    expect(db.exportData().topics[0].name).toBe("Git");
  });

  it("validate explains what's wrong with a file", () => {
    expect(db.validate(null)).toMatch(/isn't a Learning Ledger file/);
    expect(db.validate({ app: "other" })).toMatch(/isn't a Learning Ledger file/);
    expect(db.validate({ app: "learning-ledger", schema: 2, tracks: [], topics: [], milestones: [], entries: [] })).toMatch(/newer version/);
    expect(db.validate({ app: "learning-ledger", schema: 1, tracks: [] })).toMatch(/missing/);
    expect(db.validate({ app: "learning-ledger", schema: 1, tracks: [], topics: [], milestones: [], entries: [] })).toBeNull();
  });

  it("replaceAll drops rows without a string id", async () => {
    await db.replaceAll({ tracks: [{ id: "t" }, { id: 3 }, null, { title: "no id" }], topics: "junk" });
    const out = db.exportData();
    expect(out.tracks.map((t) => t.id)).toEqual(["t"]);
    expect(out.topics).toEqual([]);
  });

  it("the real backup in data/ still validates, imports and round-trips through export", async () => {
    expect(db.validate(backup)).toBeNull();
    await db.replaceAll(backup);
    expect(db.counts()).toEqual({ tracks: 1, entries: 15 });
    const out = db.exportData();
    expect(out).toMatchObject({ app: "learning-ledger", schema: 1 });
    expect(typeof out.exportedAt).toBe("string");
    for (const c of ["tracks", "topics", "milestones", "entries"] as const) expect(out[c]).toEqual(backup[c]);
  });
});

describe("db.load", () => {
  it("fetches everything from the server", async () => {
    fakeApi.data.tracks = [{ id: "t" }];
    expect(await db.load()).toEqual({ moved: false });
    expect(db.counts().tracks).toBe(1);
  });

  it("moves browser data into an empty database and keeps the browser copy", async () => {
    localStorage.setItem(KEY, JSON.stringify(backup));
    expect(await db.load()).toEqual({ moved: true });
    expect(fakeApi.data.entries).toHaveLength(15);
    expect(localStorage.getItem(KEY)).not.toBeNull();
    // the next load finds data in the database and doesn't move anything again
    fakeApi.calls = [];
    expect(await db.load()).toEqual({ moved: false });
    expect(fakeApi.calls).toEqual(["GET /api/ledger"]);
  });

  it("ignores unreadable browser data", async () => {
    localStorage.setItem(KEY, "{broken");
    expect(await db.load()).toEqual({ moved: false });
    expect(fakeApi.calls).toEqual(["GET /api/ledger"]);
  });

  it("calls made while loading share one request, and a failed load can be retried", async () => {
    await Promise.all([db.load(), db.load()]);
    expect(fakeApi.calls).toEqual(["GET /api/ledger"]);
    fakeApi.fail = "network";
    await expect(db.load()).rejects.toMatchObject({ code: "server_unavailable" });
    fakeApi.fail = null;
    await expect(db.load()).resolves.toEqual({ moved: false });
  });
});
