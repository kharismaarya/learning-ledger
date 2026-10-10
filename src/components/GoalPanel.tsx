import { useState, type FormEvent } from "react";
import { daysBetween, fmtD, parseD, today } from "../lib/dates";
import { store } from "../lib/localStore";
import { useApp } from "../state/AppContext";
import type { Track } from "../types";

export function GoalPanel() {
  const app = useApp();
  const { ui, set, track: t } = app;

  let body;
  if (ui.editingGoal) {
    body = (
      <>
        <div className="panel-head">
          <h2>{t ? "Edit goal" : "New learning track"}</h2>
        </div>
        <GoalForm key={t ? t.id : "new"} t={t} />
      </>
    );
  } else if (!t) {
    const ready = app.data.loaded.tracks;
    body = (
      <div className="empty">
        <strong>{ready ? "No learning track yet" : "Loading your tracks…"}</strong>
        <span>
          {ready
            ? "A track holds one goal, the milestones toward it, and a log of everything you watch, learn, ask, and build."
            : "Your goals, milestones and log appear here."}
        </span>
        {ready && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn primary" onClick={() => set({ newTrack: true, editingGoal: true })}>
              Start a track
            </button>
            <button className="btn" onClick={() => app.importInput.current?.click()}>
              Import a backup
            </button>
          </div>
        )}
      </div>
    );
  } else {
    body = <GoalView t={t} />;
  }
  return (
    <section className="panel goal" id="goalPanel" aria-label="Goal">
      {body}
    </section>
  );
}

function GoalView({ t }: { t: Track }) {
  const app = useApp();
  const ms = app.tMs,
    done = ms.filter((m) => m.status === "done").length,
    pct = ms.length ? Math.round((done / ms.length) * 100) : 0;
  const start = parseD(t.startDate),
    end = parseD(t.targetDate),
    now = parseD(today())!;
  let left: number | null = null,
    timePct: number | null = null;
  if (end) {
    left = daysBetween(now, end);
    if (start) {
      const tot = Math.max(1, daysBetween(start, end));
      timePct = Math.min(100, Math.max(0, Math.round((daysBetween(start, now) / tot) * 100)));
    }
  }
  let pace: [string, string] | null = null;
  if (timePct != null && ms.length) {
    const gap = pct - timePct;
    pace = gap >= -5 ? ["good", "On pace"] : gap >= -20 ? ["warn", "Slightly behind"] : ["bad", "Behind"];
  }
  return (
    <>
      <div className="panel-head">
        <span className="label">Goal</span>
        <button className="icon-btn" onClick={() => app.set({ editingGoal: true })}>
          Edit
        </button>
      </div>
      <h2 className="outcome">{t.outcome || t.title}</h2>
      {t.why && (
        <p className="why" style={{ margin: 0 }}>
          {t.why}
        </p>
      )}
      {t.doneWhen && (
        <div className="field">
          <span className="label">Done when</span>
          <span>{t.doneWhen}</span>
        </div>
      )}
      <div className="facts">
        <div className="fact">
          <small>Target</small>
          <b className="mono">{end ? fmtD(t.targetDate, { day: "numeric", month: "short", year: "2-digit" }) : "—"}</b>
        </div>
        <div className="fact">
          <small>{left != null && left < 0 ? "Days over" : "Days left"}</small>
          <b className="mono">{left == null ? "—" : String(Math.abs(left))}</b>
        </div>
        <div className="fact">
          <small>Milestones</small>
          <b className="mono">{ms.length ? done + "/" + ms.length : "—"}</b>
        </div>
      </div>
      {ms.length > 0 && (
        <div className="pace">
          <div className="bar" role="img" aria-label={`${pct}% of milestones done, ${timePct ?? 0}% of time used`}>
            <i style={{ width: pct + "%" }} />
            {timePct != null && <em style={{ left: `calc(${timePct}% - 1px)` }} />}
          </div>
          <div className="pace-legend">
            <span>{pct}% of milestones done</span>
            {timePct != null && <span>{timePct}% of time used</span>}
            {pace && <span className={"pill " + pace[0]}>{pace[1]}</span>}
          </div>
        </div>
      )}
    </>
  );
}

function GoalForm({ t }: { t: Track | null }) {
  const app = useApp();
  const [f, setF] = useState({
    title: t?.title || "",
    outcome: t?.outcome || "",
    why: t?.why || "",
    doneWhen: t?.doneWhen || "",
    startDate: t?.startDate || today(),
    targetDate: t?.targetDate || "",
  });
  const fld = (id: string, lab: string, k: keyof typeof f, kind: "text" | "textarea" | "date" = "text") => (
    <div className="field">
      <label className="label" htmlFor={id}>
        {lab}
      </label>
      {kind === "textarea" ? (
        <textarea id={id} rows={2} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      ) : (
        <input id={id} type={kind} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      )}
    </div>
  );

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const body = {
      title: f.title.trim() || "Untitled track",
      outcome: f.outcome.trim(),
      why: f.why.trim(),
      doneWhen: f.doneWhen.trim(),
      startDate: f.startDate || today(),
      targetDate: f.targetDate || "",
    };
    if (t) {
      if (await app.write(() => app.db.doc("tracks", t.id).update(body), "Goal saved")) app.set({ editingGoal: false });
    } else {
      const ref = app.db.collection("tracks").doc();
      if (await app.write(() => ref.set({ ...body, nextStep: "", createdAt: Date.now() }), "Track created")) {
        store.set("ll.track", ref.id);
        app.set({ cur: ref.id, newTrack: false, editingGoal: false });
      }
    }
  }

  return (
    <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={submit}>
      {fld("g_title", "Track name", "title")}
      {fld("g_outcome", "Outcome — I can…", "outcome", "textarea")}
      {fld("g_why", "Why it matters", "why", "textarea")}
      {fld("g_done", "Done when (a testable finish line)", "doneWhen", "textarea")}
      <div className="row">
        {fld("g_start", "Started", "startDate", "date")}
        {fld("g_target", "Target date", "targetDate", "date")}
      </div>
      <div className="row">
        <button className="btn primary" type="submit">
          {t ? "Save goal" : "Create track"}
        </button>
        <button className="btn" type="button" onClick={() => app.set({ editingGoal: false, newTrack: false })}>
          Cancel
        </button>
      </div>
    </form>
  );
}
