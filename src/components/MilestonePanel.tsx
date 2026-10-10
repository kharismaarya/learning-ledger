import { useState, type FormEvent } from "react";
import { fmtD } from "../lib/dates";
import { plural } from "../lib/text";
import { scrollToLog, useApp } from "../state/AppContext";
import type { Milestone, Status } from "../types";

const NEXTS: Record<Status, Status> = { todo: "doing", doing: "done", done: "todo" };

export function MilestonePanel() {
  const app = useApp();
  const { track: t, ui } = app;
  if (!t || ui.editingGoal) return null;
  const ms = app.tMs;
  return (
    <section className="panel" id="msPanel">
      <div className="panel-head">
        <h2>Milestones</h2>
        <span className="label" id="msCount">
          {ms.length ? `${ms.filter((m) => m.status === "done").length} of ${ms.length} done` : ""}
        </span>
      </div>
      <ul className="ms" id="msList">
        {!ms.length && (
          <li style={{ display: "block", color: "var(--muted)", fontSize: 14 }}>Break the goal into 3–8 capabilities you'll have along the way.</li>
        )}
        {ms.map((m) =>
          ui.editMs === m.id ? (
            <li key={m.id} data-s={m.status || "todo"} data-edit={m.id}>
              <MilestoneEdit m={m} />
            </li>
          ) : (
            <MilestoneRow key={m.id} m={m} />
          ),
        )}
      </ul>
      <MilestoneAdd trackId={t.id} />
    </section>
  );
}

function MilestoneRow({ m }: { m: Milestone }) {
  const app = useApp();
  const s = m.status || "todo";
  const delKey = "m:" + m.id;
  const confirming = app.ui.confirmDel === delKey;
  const on = app.msFilter === m.id;
  const logged = app.msLog(m).length;
  return (
    <li data-s={s}>
      <button className="state" title={`Status: ${s}. Click to change.`} aria-label={`${m.title}: ${s}. Change status`} onClick={() => app.setStatus(m, NEXTS[s])}>
        {s === "done" ? "✓" : ""}
      </button>
      <div className="mt">
        <button
          className="mt-btn"
          aria-pressed={on}
          title={on ? "Show all log entries" : "Show only this milestone's log entries"}
          onClick={() => {
            app.set({ msFilter: on ? null : m.id });
            if (!on && matchMedia("(max-width:860px)").matches) scrollToLog();
          }}
        >
          {m.title}
        </button>
        <div className="due mono">
          {[s === "done" && m.doneAt ? "Done " + fmtD(m.doneAt) : m.due ? "By " + fmtD(m.due) : "", s === "doing" ? " · in progress" : ""].join("")}
          {logged > 0 && <span className="logged">{" · " + plural(logged, "entry", "entries") + " logged"}</span>}
        </div>
        {s === "doing" && m.nextStep && <div className="ns">Next: {m.nextStep}</div>}
      </div>
      <div className="acts">
        {confirming ? (
          <>
            <button
              className="icon-btn danger"
              onClick={async () => {
                app.set({ confirmDel: null });
                await app.write(() => app.db.doc("milestones", m.id).delete(), "Milestone removed");
              }}
            >
              Confirm
            </button>
            <button className="icon-btn" onClick={() => app.set({ confirmDel: null })}>
              Keep
            </button>
          </>
        ) : (
          <>
            <button className="icon-btn" onClick={() => app.set({ editMs: m.id })}>
              Edit
            </button>
            <button className="icon-btn" onClick={() => app.set({ confirmDel: delKey })}>
              Delete
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function MilestoneEdit({ m }: { m: Milestone }) {
  const app = useApp();
  const [title, setTitle] = useState(m.title || "");
  const [due, setDue] = useState(m.due || "");
  const [ns, setNs] = useState(m.nextStep || "");
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (await app.write(() => app.db.doc("milestones", m.id).update({ title: title.trim() || m.title, due: due || "", nextStep: ns.trim() })))
      app.set({ editMs: null });
  }
  return (
    <form className="ms-add" style={{ gridColumn: "1/-1" }} onSubmit={submit}>
      <input type="text" aria-label="Milestone" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      <input type="date" aria-label="Target date" value={due} onChange={(e) => setDue(e.target.value)} />
      <input
        type="text"
        aria-label="Next step"
        placeholder="Next step for this milestone (optional)"
        style={{ flex: "1 1 100%" }}
        value={ns}
        onChange={(e) => setNs(e.target.value)}
      />
      <button className="btn primary" type="submit">
        Save
      </button>
      <button className="btn" type="button" onClick={() => app.set({ editMs: null })}>
        Cancel
      </button>
    </form>
  );
}

function MilestoneAdd({ trackId }: { trackId: string }) {
  const app = useApp();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    const tt = title.trim();
    if (!tt) return;
    const ms = app.tMs;
    const order = ms.length ? Math.max(...ms.map((m) => m.order || 0)) + 1 : 1;
    if (
      await app.write(
        () => app.db.collection("milestones").doc().set({ trackId, title: tt, due: due || "", status: "todo", order, doneAt: "" }),
        "Milestone added",
      )
    ) {
      setTitle("");
      setDue("");
    }
  }
  return (
    <form className="ms-add" id="msForm" onSubmit={submit}>
      <input type="text" id="msTitle" placeholder="Add a milestone (a capability, not a task)" aria-label="New milestone" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input type="date" id="msDue" aria-label="Milestone target date" value={due} onChange={(e) => setDue(e.target.value)} />
      <button className="btn" type="submit">
        Add
      </button>
    </form>
  );
}
