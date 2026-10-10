import { useEffect, useRef, useState } from "react";
import { fmtD } from "../lib/dates";
import { scrollToLog, useApp } from "../state/AppContext";
import type { Milestone } from "../types";

const SHOW = 4;

/** "Now working on": the milestone in progress, its next step and what's been logged toward it. */
export function NextPanel() {
  const app = useApp();
  const { track: t, curMs: cur } = app;
  if (!t || app.ui.editingGoal) return null;

  const nxt = cur ? null : app.upNext;
  let label: string, now;
  if (cur) {
    label = "Now working on";
    now = <span>{cur.title}</span>;
  } else if (nxt) {
    label = "Up next";
    now = (
      <>
        <span>{nxt.title}</span>
        <div>
          <button
            className="btn"
            style={{ marginTop: 6 }}
            onClick={async () => {
              app.focusNow.current = true;
              await app.write(() => app.db.doc("milestones", nxt.id).update({ status: "doing" }), "Started");
            }}
          >
            Start this milestone
          </button>
        </div>
      </>
    );
  } else if (app.tMs.length) {
    label = "All milestones done";
    now = <span>Check the goal's finish line above.</span>;
  } else {
    label = "Get started";
    now = <span>Add milestones below, then start the first one.</span>;
  }

  const last = app.tEntries[0];
  const lastText = last
    ? `Last logged ${fmtD(last.date)}: ${(last.text || "").split("\n")[0].slice(0, 90)}${(last.text || "").length > 90 ? "…" : ""}`
    : "Nothing logged yet. Add your first entry on the right.";

  return (
    <section className="next" id="nextPanel">
      <span className="label" id="nowLabel">
        {label}
      </span>
      <div className="now-ms" id="nowMs">
        {now}
      </div>
      {cur && <Achieved m={cur} />}
      {cur && (
        <div className="field" id="nextField">
          <label className="label" htmlFor="nextInput">
            Next step
          </label>
          <NextStepInput key={cur.id} m={cur} />
        </div>
      )}
      <span className="lastseen" id="lastSeen">
        {lastText}
      </span>
    </section>
  );
}

function Achieved({ m }: { m: Milestone }) {
  const app = useApp();
  const items = app.msLog(m);
  return (
    <div className="ach" id="nowAch">
      <span className="label">{"Achieved so far" + (items.length ? ` · ${items.length}` : "")}</span>
      {items.length ? (
        <>
          <ul>
            {items.slice(0, SHOW).map((x) => (
              <li key={x.id}>
                <span className="x">
                  {(x.text || "").split("\n")[0].replace(/\*\*/g, "").slice(0, 160)}
                  <small className="mono">{fmtD(x.date)}</small>
                </span>
              </li>
            ))}
          </ul>
          <button
            className="more"
            onClick={() => {
              app.set({ msFilter: m.id });
              scrollToLog();
            }}
          >
            {items.length > SHOW ? `See all ${items.length} in the log` : "See in the log"}
          </button>
        </>
      ) : (
        <span className="none">Nothing yet. Log a Build and pick this milestone to record progress.</span>
      )}
    </div>
  );
}

function NextStepInput({ m }: { m: Milestone }) {
  const app = useApp();
  const ref = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(m.nextStep || "");
  /* follow outside changes unless the user is typing here */
  useEffect(() => {
    if (document.activeElement !== ref.current) setV(m.nextStep || "");
  }, [m.nextStep]);
  useEffect(() => {
    if (app.focusNow.current) {
      app.focusNow.current = false;
      ref.current?.focus();
    }
  });
  async function save() {
    const nv = v.trim();
    if (nv === (m.nextStep || "")) return;
    await app.write(() => app.db.doc("milestones", m.id).update({ nextStep: nv }), "Next step saved");
  }
  return (
    <input
      ref={ref}
      type="text"
      id="nextInput"
      placeholder="What's the very next thing you'll do for this milestone?"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}
