import type { ReactNode } from "react";
import { parseD } from "../lib/dates";
import { store } from "../lib/localStore";
import { plural } from "../lib/text";
import { useApp, type View } from "../state/AppContext";
import { TYPES, type Entry } from "../types";
import { EntryItem } from "./EntryItem";

const VIEWS: { v: View; n: string }[] = [
  { v: "time", n: "Timeline" },
  { v: "topic", n: "By topic" },
  { v: "milestone", n: "By milestone" },
];
const MS_LABEL = { todo: ["To do", "var(--faint)"], doing: ["In progress", "var(--accent)"], done: ["Done", "var(--good)"] } as const;

export function LogPanel() {
  const app = useApp();
  const { track: t, ui, topicFilter, msFilter } = app;
  if (!t || ui.editingGoal) return null;

  const all = app.tEntries;
  const noTopic = (e: Entry) => !app.topicOf(e) && e.type !== "milestone";
  const byTopic = (e: Entry) => (topicFilter === "__none" ? noTopic(e) : e.topicId === topicFilter);

  /* milestone and topic filters first: the type chips count what's left */
  let scoped = all;
  if (msFilter) scoped = scoped.filter((e) => e.milestoneId === msFilter);
  if (topicFilter) scoped = scoped.filter(byTopic);
  let es = ui.filter === "all" ? scoped : scoped.filter((e) => e.type === ui.filter);
  const q = ui.q.trim().toLowerCase();
  if (q)
    es = es.filter(
      (e) => (e.text || "").toLowerCase().includes(q) || (e.url || "").toLowerCase().includes(q) || (app.topicOf(e)?.name || "").toLowerCase().includes(q),
    );

  const fm = msFilter ? app.data.milestones.find((x) => x.id === msFilter) : null;
  const ft = topicFilter && topicFilter !== "__none" ? app.data.topics.find((x) => x.id === topicFilter) : null;

  return (
    <section className="panel" id="logPanel">
      <div className="panel-head">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h2>Log</h2>
          <span className="label" id="logCount">
            {all.length ? plural(all.length, "entry", "entries") : ""}
          </span>
        </div>
        <div className="seg" id="viewSeg" role="group" aria-label="Log view">
          {VIEWS.map((x) => (
            <button
              key={x.v}
              type="button"
              aria-pressed={ui.view === x.v}
              disabled={!!topicFilter && x.v === "topic"}
              onClick={() => {
                app.set({ view: x.v });
                store.set("ll.view", x.v);
              }}
            >
              {x.n}
            </button>
          ))}
        </div>
      </div>
      <input
        type="search"
        id="logSearch"
        className="log-search"
        placeholder="Search the log: text, links or topic names"
        aria-label="Search the log"
        value={ui.q}
        onChange={(e) => app.set({ q: e.target.value })}
      />
      <div className="filters" id="filters">
        {msFilter && (
          <button className="chip" aria-pressed="true" title="Show all milestones" onClick={() => app.set({ msFilter: null })}>
            {`Milestone: ${fm ? fm.title.slice(0, 40) + (fm.title.length > 40 ? "…" : "") : ""}  ✕`}
          </button>
        )}
        {topicFilter && (
          <button className="chip" aria-pressed="true" title="Show all topics" onClick={() => app.set({ topicFilter: null })}>
            {`Topic: ${ft ? ft.name : "No topic"}  ✕`}
          </button>
        )}
        {[{ k: "all" as const, n: "All" }, ...TYPES].map((x) => {
          const n = x.k === "all" ? scoped.length : scoped.filter((e) => e.type === x.k).length;
          const on = ui.filter === x.k;
          return (
            <button key={x.k} className="chip" aria-pressed={on} style={n || on ? undefined : { opacity: 0.55 }} onClick={() => app.set({ filter: x.k })}>
              {`${x.n} `}
              <span className="mono" style={{ opacity: 0.6 }}>
                {n}
              </span>
            </button>
          );
        })}
      </div>
      <div className="log" id="log">
        <LogBody es={es} total={all.length} />
      </div>
    </section>
  );
}

function LogBody({ es, total }: { es: Entry[]; total: number }) {
  const app = useApp();
  const { ui, topicFilter } = app;
  if (!es.length)
    return (
      <div className="empty">
        <strong>{total ? "Nothing matches" : "Your log starts here"}</strong>
        <span>
          {total
            ? "Try another topic, filter or search term."
            : "Pick a topic, then log the first video you watch, the first thing you build, or a question you want answered."}
        </span>
      </div>
    );

  const out: ReactNode[] = [];
  if (ui.view === "milestone") {
    const ms = app.tMs,
      groups = new Map<string, Entry[]>(ms.map((m) => [m.id, []]));
    groups.set("__none", []);
    es.forEach((e) => groups.get(e.milestoneId && groups.has(e.milestoneId) ? e.milestoneId : "__none")!.push(e));
    for (const [k, list] of groups) {
      if (!list.length) continue;
      const m = ms.find((x) => x.id === k);
      const st = MS_LABEL[m?.status || "todo"];
      out.push(
        <div className="group-h" key={"g:" + k}>
          <h3>{m ? m.title : "Not linked to a milestone"}</h3>
          {m && <span style={{ color: st[1], fontWeight: 600 }}>{st[0]}</span>}
          <span className="mono">{plural(list.filter((e) => e.type !== "milestone").length, "entry", "entries")}</span>
        </div>,
      );
      list.forEach((e) => out.push(<EntryItem key={e.id} e={e} opt={{ full: true, showTopic: !topicFilter, hideMs: true }} />));
    }
  } else if (ui.view === "topic" && !topicFilter) {
    const groups = new Map<string, Entry[]>();
    es.forEach((e) => {
      const k = e.type === "milestone" ? "__ms" : app.topicOf(e)?.id || "__none";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(e);
    });
    for (const [k, list] of groups) {
      const tp = app.data.topics.find((x) => x.id === k);
      const srcN = list.filter((e) => e.type === "source").length;
      out.push(
        <div className="group-h" key={"g:" + k}>
          <h3>{tp ? tp.name : k === "__ms" ? "Milestones reached" : "No topic"}</h3>
          <span className="mono">{plural(list.length, "entry", "entries") + " · " + plural(srcN, "source")}</span>
        </div>,
      );
      list.forEach((e) => out.push(<EntryItem key={e.id} e={e} opt={{ full: true, showTopic: false }} />));
    }
  } else {
    let lastMonth = "";
    es.forEach((e) => {
      const d = parseD(e.date);
      const mk = d ? d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "Undated";
      if (mk !== lastMonth) {
        out.push(
          <div className="month" key={"m:" + mk}>
            {mk}
          </div>,
        );
        lastMonth = mk;
      }
      out.push(<EntryItem key={e.id} e={e} opt={{ full: false, showTopic: !topicFilter }} />);
    });
  }
  return <>{out}</>;
}
