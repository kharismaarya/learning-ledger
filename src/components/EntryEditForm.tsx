import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { dayLabel, today } from "../lib/dates";
import { submitOnModEnter } from "../lib/text";
import { useApp } from "../state/AppContext";
import { PICK, TMAP, type Entry, type Milestone } from "../types";

export function MilestoneOptions({ ms }: { ms: Milestone[] }) {
  return (
    <>
      <option value="">None</option>
      {ms.map((m) => (
        <option key={m.id} value={m.id}>
          {(m.status === "done" ? "✓ " : m.status === "doing" ? "▶ " : "") + m.title}
        </option>
      ))}
    </>
  );
}

export function EntryEditForm({ e, full }: { e: Entry; full: boolean }) {
  const app = useApp();
  const [D, setD] = useState({
    type: e.type || "insight",
    topicId: e.topicId || "",
    milestoneId: e.milestoneId || "",
    text: e.text || "",
    url: e.url || "",
    date: e.date || today(),
    resolved: !!e.resolved,
    answer: e.answer || "",
  });
  const patch = (p: Partial<typeof D>) => setD((d) => ({ ...d, ...p }));
  const txtRef = useRef<HTMLTextAreaElement>(null);
  const topicRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    txtRef.current?.focus();
    txtRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const T = TMAP[D.type] || TMAP.insight;
  const isMs = e.type === "milestone";
  const ts = app.tTopics,
    ms = app.tMs;
  const close = () => app.set({ editEntry: null });

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const text = D.text.trim(),
      u = D.url.trim();
    if (!isMs && !D.topicId) {
      app.toast("Pick a topic for this entry.");
      topicRef.current?.focus();
      return;
    }
    if (!text && !u) {
      app.toast("Add a line about what you got from it.");
      txtRef.current?.focus();
      return;
    }
    const body: Partial<Entry> = isMs
      ? { text: text || u, url: u, date: D.date || e.date || today() }
      : { type: D.type, topicId: D.topicId, milestoneId: D.type === "build" ? D.milestoneId || "" : "", text: text || u, url: u, date: D.date || e.date || today() };
    if (D.type === "question") {
      body.resolved = !!D.resolved;
      body.answer = (D.answer || "").trim();
    }
    if (await app.write(() => app.db.doc("entries", e.id).update(body), "Entry updated")) close();
  }

  return (
    <article className="entry" data-t={T.k} data-edit={e.id} style={{ "--c": T.c } as CSSProperties}>
      <div className="d">{dayLabel(e.date, full)}</div>
      <div className="rail" />
      <form style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0 14px 10px", minWidth: 0 }} onSubmit={submit}>
        {isMs ? (
          <span className="hint">Milestone entry. Add a link to your evidence: a repo, live URL or screenshot.</span>
        ) : (
          <div className="field">
            <label className="label" htmlFor="ed_topic">
              Topic
            </label>
            <select
              id="ed_topic"
              aria-label="Topic"
              ref={topicRef}
              value={ts.some((x) => x.id === D.topicId) ? D.topicId : ""}
              onChange={(ev) => patch({ topicId: ev.target.value })}
            >
              <option value="" disabled>
                Choose a topic…
              </option>
              {ts.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {!isMs && (
          <div className="types" role="group" aria-label="Entry type">
            {PICK.map((t) => (
              <button key={t.k} type="button" className="type" style={{ "--c": t.c } as CSSProperties} aria-pressed={D.type === t.k} onClick={() => patch({ type: t.k })}>
                <span className="dot" />
                {t.n}
              </button>
            ))}
          </div>
        )}
        {!isMs && D.type === "build" && (
          <div className="field">
            <label className="label" htmlFor="ed_ms">
              Progress toward milestone
            </label>
            <select
              id="ed_ms"
              aria-label="Progress toward milestone"
              value={ms.some((m) => m.id === D.milestoneId) ? D.milestoneId : ""}
              onChange={(ev) => patch({ milestoneId: ev.target.value })}
            >
              <MilestoneOptions ms={ms} />
            </select>
          </div>
        )}
        <div className="field">
          <textarea
            id="ed_text"
            ref={txtRef}
            aria-label="Entry text"
            rows={Math.min(12, Math.max(3, Math.ceil((D.text || "").length / 70)))}
            value={D.text}
            onChange={(ev) => patch({ text: ev.target.value })}
            onKeyDown={submitOnModEnter}
          />
        </div>
        <div className="row">
          <div className="field">
            <input type="url" id="ed_url" placeholder="Link (optional)" aria-label="Link" value={D.url} onChange={(ev) => patch({ url: ev.target.value })} />
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <input type="date" id="ed_date" aria-label="Date" value={D.date} onChange={(ev) => patch({ date: ev.target.value })} />
          </div>
        </div>
        {D.type === "question" && (
          <div className="field">
            <label className="label" htmlFor="ed_answer">
              Answer
            </label>
            <textarea
              id="ed_answer"
              rows={3}
              placeholder="Answer (optional)"
              aria-label="Answer"
              value={D.answer}
              onChange={(ev) => {
                const v = ev.target.value;
                patch(v.trim() && !D.resolved ? { answer: v, resolved: true } : { answer: v });
              }}
            />
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" id="ed_resolved" checked={D.resolved} onChange={(ev) => patch({ resolved: ev.target.checked })} />
              Answered
            </label>
          </div>
        )}
        <div className="row">
          <button className="btn primary" type="submit">
            Save changes
          </button>
          <button className="btn" type="button" onClick={close}>
            Cancel
          </button>
        </div>
      </form>
    </article>
  );
}
