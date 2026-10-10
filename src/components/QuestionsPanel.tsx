import { useApp } from "../state/AppContext";
import { AnswerForm } from "./AnswerForm";

export function QuestionsPanel() {
  const app = useApp();
  const qs = app.track ? app.tEntries.filter((e) => e.type === "question" && !e.resolved) : [];
  if (!qs.length || app.ui.editingGoal) return null;
  return (
    <section className="panel" id="qPanel">
      <div className="panel-head">
        <h2>Open questions</h2>
        <span className="label" id="qCount">
          {qs.length} open
        </span>
      </div>
      <ul className="qlist" id="qList">
        {qs.map((q) => {
          const open = app.ui.ansOpen === "q:" + q.id;
          return (
            <li key={q.id}>
              <span>{q.text}</span>
              {open ? (
                <AnswerForm q={q} where="q" />
              ) : (
                <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                  <button className="icon-btn" style={{ color: "var(--accent)", fontWeight: 600 }} onClick={() => app.set({ ansOpen: "q:" + q.id })}>
                    Answer
                  </button>
                  <button className="icon-btn" onClick={() => app.write(() => app.db.doc("entries", q.id).update({ resolved: true }), "Marked answered")}>
                    Answered
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
