import type { CSSProperties } from "react";
import { dayLabel } from "../lib/dates";
import { hostOf } from "../lib/text";
import { useApp } from "../state/AppContext";
import { TMAP, type Entry } from "../types";
import { AnswerForm } from "./AnswerForm";
import { EntryEditForm } from "./EntryEditForm";

export interface EntryOpts {
  /** grouped views show "07 Oct" instead of "07 Mon" */
  full: boolean;
  showTopic: boolean;
  hideMs?: boolean;
}

export function EntryItem({ e, opt }: { e: Entry; opt: EntryOpts }) {
  const app = useApp();
  if (app.ui.editEntry === e.id) return <EntryEditForm e={e} full={opt.full} />;

  const T = TMAP[e.type] || TMAP.insight;
  const delKey = "e:" + e.id;
  const tp = app.topicOf(e);
  const host = hostOf(e.url);
  const lm = e.milestoneId && e.type !== "milestone" ? app.data.milestones.find((x) => x.id === e.milestoneId) : null;

  let topicCtl = null;
  if (opt.showTopic && e.type !== "milestone")
    topicCtl = tp ? (
      <button className="ttag" title="Show only this topic" onClick={() => app.set({ topicFilter: tp.id, topicReq: tp.id })}>
        {tp.name}
      </button>
    ) : (
      <span className="ttag none">No topic</span>
    );

  let answer = null;
  if (e.type === "question") {
    if (app.ui.ansOpen === "l:" + e.id) answer = <AnswerForm q={e} where="l" />;
    else if (e.answer)
      answer = (
        <div className="answer">
          <span className="label">
            Answer
            <button className="icon-btn" onClick={() => app.set({ ansOpen: "l:" + e.id })}>
              Edit
            </button>
          </span>
          <div className="txt">{e.answer}</div>
        </div>
      );
    else
      answer = (
        <button className="link-btn" onClick={() => app.set({ ansOpen: "l:" + e.id })}>
          + Add answer
        </button>
      );
  }

  return (
    <article className="entry" data-t={T.k} style={{ "--c": T.c } as CSSProperties}>
      <div className="d">{dayLabel(e.date, opt.full)}</div>
      <div className="rail" />
      <div className="body">
        <div className="meta">
          <span className="t">{T.n}</span>
          {topicCtl}
          {lm && !opt.hideMs && (
            <span className="mtag" title={"Progress toward: " + lm.title}>
              {"◆ " + lm.title}
            </span>
          )}
          {e.type === "question" && e.resolved && <span className="resolved">Answered</span>}
          <div className="acts">
            {app.ui.confirmDel === delKey ? (
              <>
                <button
                  className="icon-btn danger"
                  onClick={async () => {
                    app.set({ confirmDel: null });
                    await app.write(() => app.db.doc("entries", e.id).delete(), "Entry deleted");
                  }}
                >
                  Confirm delete
                </button>
                <button className="icon-btn" onClick={() => app.set({ confirmDel: null })}>
                  Keep
                </button>
              </>
            ) : (
              <>
                <button className="icon-btn" onClick={() => app.set({ editEntry: e.id })}>
                  Edit
                </button>
                <button className="icon-btn" onClick={() => app.set({ confirmDel: delKey })}>
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
        {e.text && e.text !== e.url && <div className="txt">{e.text}</div>}
        {e.url && (
          <a href={e.url} target="_blank" rel="noopener noreferrer">
            {host || e.url}
            {"  ↗"}
          </a>
        )}
        {answer}
      </div>
    </article>
  );
}
