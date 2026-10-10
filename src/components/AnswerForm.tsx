import { useEffect, useRef, useState, type FormEvent } from "react";
import { submitOnModEnter } from "../lib/text";
import { useApp } from "../state/AppContext";
import type { Entry } from "../types";

/** Answer box for a question entry; the answer is stored on the question itself. */
export function AnswerForm({ q, where }: { q: Entry; where: "q" | "l" }) {
  const app = useApp();
  const [v, setV] = useState(q.answer || "");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.scrollIntoView({ block: "nearest" });
  }, []);
  const close = () => app.set({ ansOpen: null });
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const a = v.trim();
    if (await app.write(() => app.db.doc("entries", q.id).update(a ? { answer: a, resolved: true } : { answer: "" }), a ? "Answer saved" : "Answer cleared"))
      close();
  }
  return (
    <form className="ans-form" onSubmit={submit}>
      <textarea
        ref={ref}
        id={(where === "q" ? "qa_" : "ed_ans_") + q.id}
        rows={3}
        placeholder="What's the answer? Where did you find it?"
        aria-label="Answer"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(k) => {
          submitOnModEnter(k);
          if (k.key === "Escape") close();
        }}
      />
      <div className="row">
        <button className="btn primary" type="submit">
          Save answer
        </button>
        <button className="btn" type="button" onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  );
}
