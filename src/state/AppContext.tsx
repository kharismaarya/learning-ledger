import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { signOut as endSession, type Account } from "../db/auth";
import { db, type DbError } from "../db/db";
import { useLedger, type Ledger } from "../db/useLedger";
import { store } from "../lib/localStore";
import { today } from "../lib/dates";
import type { Entry, EntryType, Milestone, Status, Topic, Track } from "../types";

export type View = "time" | "topic" | "milestone";

export interface Ui {
  cur: string | null;
  newTrack: boolean;
  editingGoal: boolean;
  filter: "all" | EntryType;
  q: string;
  view: View;
  /** a topic id, "__none" for entries without a topic, or null */
  topicFilter: string | null;
  msFilter: string | null;
  /** the one delete awaiting confirmation: "m:<id>", "p:<id>" or "e:<id>" */
  confirmDel: string | null;
  /** the one open answer box: "q:<id>" (open questions) or "l:<id>" (log) */
  ansOpen: string | null;
  editMs: string | null;
  editTopic: string | null;
  editEntry: string | null;
  /** topic the log form should switch to once it exists */
  topicReq: string | null;
}

const initialView = store.get("ll.view");
export const initialUi: Ui = {
  cur: store.get("ll.track"),
  newTrack: false,
  editingGoal: false,
  filter: "all",
  q: "",
  view: initialView === "topic" || initialView === "milestone" ? initialView : "time",
  topicFilter: null,
  msFilter: null,
  confirmDel: null,
  ansOpen: null,
  editMs: null,
  editTopic: null,
  editEntry: null,
  topicReq: null,
};

export interface BannerState {
  msg: string;
  buttons?: ReactNode;
}

export interface SessionProps {
  account: Account;
  /** back to the sign-in form, optionally with a message to show there */
  onSignedOut: (notice?: string) => void;
}

const EXPIRED = "You've been signed out (your session ended). Sign in again to carry on.";

function useAppState({ account, onSignedOut }: SessionProps) {
  const data = useLedger();
  const [ui, setUi] = useState<Ui>(initialUi);
  const set = useCallback((patch: Partial<Ui>) => setUi((u) => ({ ...u, ...patch })), []);

  /* toast + banner */
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number>();
  const toast = useCallback((m: string) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2200);
  }, []);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const hideBanner = useCallback(() => setBanner(null), []);

  /** set by actions that should move focus to the next-step input once it renders */
  const focusNow = useRef(false);
  const importInput = useRef<HTMLInputElement>(null);

  const write = useCallback(
    async (fn: () => Promise<void>, okMsg?: string | null): Promise<boolean> => {
      try {
        await fn();
        if (okMsg) toast(okMsg);
        return true;
      } catch (e) {
        if ((e as DbError)?.code === "unauthenticated") {
          onSignedOut(EXPIRED + " Your last change wasn't saved.");
          return false;
        }
        toast(
          (e as DbError)?.code === "server_unavailable"
            ? "Couldn't reach the server, so this wasn't saved. Is it still running?"
            : "The server didn't accept this change: " + ((e as DbError)?.message || "unknown error"),
        );
        console.error(e);
        return false;
      }
    },
    [toast, onSignedOut],
  );

  /* fetch the data from the server once, when the app opens.
     The answer can arrive after the app has closed (tests unmount it quickly), so results are dropped then. */
  const mounted = useRef(false);
  const load = useCallback(() => {
    db.load().then(
      ({ moved }) => {
        if (!mounted.current) return;
        setBanner(null);
        if (moved) toast("Moved your browser data into your account");
      },
      (e: DbError) => {
        if (!mounted.current) return;
        if (e?.code === "unauthenticated") return onSignedOut(EXPIRED);
        setBanner({
          msg: "Can't reach the database. Check that the server is running (npm start) and that you're online.",
          buttons: (
            <button className="btn primary" onClick={() => load()}>
              Retry
            </button>
          ),
        });
      },
    );
  }, [toast, onSignedOut]);
  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
      clearTimeout(toastTimer.current);
    };
  }, [load]);

  /* current track and its records */
  const sel = useMemo(() => selectors(data, ui), [data, ui]);

  async function setStatus(m: Milestone, ns: Status) {
    const was = m.status || "todo";
    if (!(await write(() => db.doc("milestones", m.id).update({ status: ns, doneAt: ns === "done" ? today() : "" })))) return;
    if (ns === "done") {
      await write(() =>
        db.collection("entries")
          .doc("ms-" + m.id)
          .set({ trackId: m.trackId, type: "milestone", milestoneId: m.id, topicId: "", text: "Reached milestone: " + m.title, url: "", date: today(), createdAt: Date.now() }),
      );
      const others = sel.tMs.filter((x) => x.id !== m.id);
      if (!others.some((x) => x.status === "doing")) {
        const n = others.find((x) => (x.status || "todo") === "todo");
        if (n && (await write(() => db.doc("milestones", n.id).update({ status: "doing" })))) {
          focusNow.current = true;
          toast("Milestone reached. What's the first step for the next one?");
          return;
        }
      }
      toast("Milestone reached and logged");
    } else if (was === "done") {
      await write(() => db.doc("entries", "ms-" + m.id).delete());
    }
  }

  async function createTopic(trackId: string, name: string): Promise<string | null> {
    const existing = sel.tTopics.find((t) => (t.name || "").toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    const ref = db.collection("topics").doc();
    return (await write(() => ref.set({ trackId, name, createdAt: Date.now() }))) ? ref.id : null;
  }

  async function signOut() {
    try {
      await endSession();
      onSignedOut();
    } catch {
      toast("Couldn't reach the server, so you're still signed in.");
    }
  }

  function selectTrack(id: string) {
    set({ cur: id, newTrack: false, editingGoal: false, topicFilter: null, msFilter: null });
    store.set("ll.track", id);
  }

  return {
    account,
    signOut,
    data,
    ui,
    set,
    ...sel,
    db,
    write,
    toast,
    toastMsg,
    banner,
    showBanner: setBanner,
    hideBanner,
    focusNow,
    importInput,
    setStatus,
    createTopic,
    selectTrack,
  };
}

export function selectors(data: Ledger, ui: Ui) {
  const sortedTracks = data.tracks.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const curId = data.tracks.some((t) => t.id === ui.cur) ? ui.cur : (sortedTracks[0]?.id ?? null);
  const track: Track | null = ui.newTrack ? null : (data.tracks.find((t) => t.id === curId) ?? null);
  const tEntries: Entry[] = data.entries
    .filter((e) => e.trackId === curId)
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0));
  const tMs: Milestone[] = data.milestones.filter((m) => m.trackId === curId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const tTopics: Topic[] = data.topics.filter((t) => t.trackId === curId).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const topicOf = (e: Entry): Topic | null => (e.topicId ? data.topics.find((t) => t.id === e.topicId && t.trackId === curId) || null : null);
  const curMs = tMs.find((m) => m.status === "doing") || null;
  const upNext = tMs.find((m) => (m.status || "todo") === "todo") || null;
  const msLog = (m: Milestone) => tEntries.filter((x) => x.milestoneId === m.id && x.type !== "milestone");
  /* filters pointing at records that no longer exist are ignored */
  const topicFilter =
    ui.topicFilter && ui.topicFilter !== "__none" && data.loaded.topics && !tTopics.some((t) => t.id === ui.topicFilter) ? null : ui.topicFilter;
  const msFilter = ui.msFilter && data.loaded.milestones && !tMs.some((m) => m.id === ui.msFilter) ? null : ui.msFilter;
  return { sortedTracks, curId, track, tEntries, tMs, tTopics, topicOf, curMs, upNext, msLog, topicFilter, msFilter };
}

export type App = ReturnType<typeof useAppState>;
const Ctx = createContext<App | null>(null);

export function AppProvider({ children, ...session }: SessionProps & { children: ReactNode }) {
  const app = useAppState(session);
  return <Ctx.Provider value={app}>{children}</Ctx.Provider>;
}

export function useApp(): App {
  const app = useContext(Ctx);
  if (!app) throw new Error("useApp outside AppProvider");
  return app;
}

/** Scroll the log panel into view after the current render. */
export function scrollToLog() {
  setTimeout(() => document.getElementById("logPanel")?.scrollIntoView({ block: "start" }));
}
