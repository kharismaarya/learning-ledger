import { useState, type FormEvent } from "react";
import { fmtD } from "../lib/dates";
import { hostOf, plural } from "../lib/text";
import { useApp } from "../state/AppContext";
import type { Entry, Topic } from "../types";

export function TopicsPanel() {
  const app = useApp();
  const { track: t } = app;
  const [name, setName] = useState("");
  if (!t || app.ui.editingGoal) return null;
  const ts = app.tTopics,
    es = app.tEntries;
  const loose = es.filter((e) => !app.topicOf(e) && e.type !== "milestone");

  async function add(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!t || !n) return;
    const id = await app.createTopic(t.id, n);
    if (id) {
      setName("");
      app.toast("Topic added");
      app.set({ topicReq: id });
    }
  }

  return (
    <section className="panel" id="topicPanel">
      <div className="panel-head">
        <h2>Topics</h2>
        <span className="label" id="topicCount">
          {ts.length ? plural(ts.length, "topic") : ""}
        </span>
      </div>
      <div className="topics" id="topicList">
        {!ts.length && (
          <div className="empty">
            <strong>No topics yet</strong>
            <span>
              Topics group what you learn, like Git, HTML & CSS or databases. Every log entry belongs to one. Add a topic here or while logging.
            </span>
          </div>
        )}
        {ts.map((tp) => (
          <TopicRow key={tp.id} k={tp.id} name={tp.name || "Untitled"} mine={es.filter((e) => e.topicId === tp.id)} tp={tp} />
        ))}
        {loose.length > 0 && <TopicRow k="__none" name="No topic" mine={loose} tp={null} />}
      </div>
      <form className="ms-add" id="topicForm" onSubmit={add}>
        <input type="text" id="topicName" placeholder="New topic, e.g. HTML & CSS" aria-label="New topic name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" type="submit">
          Add topic
        </button>
      </form>
    </section>
  );
}

function TopicRow({ k, name, mine, tp }: { k: string; name: string; mine: Entry[]; tp: Topic | null }) {
  const app = useApp();
  if (tp && app.ui.editTopic === tp.id) return <TopicRename tp={tp} />;

  const srcs = mine.filter((e) => e.type === "source"),
    last = mine[0],
    on = app.topicFilter === k,
    delKey = "p:" + k;
  const meta = [plural(srcs.length, "source"), plural(mine.length, "entry", "entries"), last ? "last " + fmtD(last.date) : "nothing logged yet"].join(" · ");
  return (
    <div className="topic">
      <button
        className="topic-btn"
        aria-pressed={on}
        title={on ? "Show all topics" : "Show only this topic"}
        onClick={() => app.set({ topicFilter: on ? null : k, ...(!on && tp ? { topicReq: tp.id } : {}) })}
      >
        <span className="topic-name">{name}</span>
        <span className="topic-meta mono">{meta}</span>
      </button>
      {tp ? (
        <div className="acts" style={{ display: "flex", gap: 2 }}>
          {app.ui.confirmDel === delKey ? (
            <>
              <button
                className="icon-btn danger"
                onClick={async () => {
                  app.set({ confirmDel: null, ...(app.topicFilter === k ? { topicFilter: null } : {}) });
                  await app.write(() => app.db.doc("topics", tp.id).delete(), "Topic deleted");
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
              <button className="icon-btn" onClick={() => app.set({ editTopic: tp.id })}>
                Rename
              </button>
              <button
                className="icon-btn"
                onClick={() => {
                  if (mine.length) {
                    app.toast(`Move or delete its ${plural(mine.length, "entry", "entries")} first.`);
                    return;
                  }
                  app.set({ confirmDel: delKey });
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      ) : (
        <span />
      )}
      {on && (
        <div className="topic-detail">
          <span className="label">Sources</span>
          {srcs.length ? (
            <ul>
              {srcs.map((s) => {
                const host = hostOf(s.url);
                const titled = s.text && s.text !== s.url;
                return (
                  <li key={s.id}>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        {titled ? s.text : host}
                      </a>
                    ) : (
                      s.text
                    )}
                    {s.url && titled && <span className="hint">{" · " + host}</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="hint">No sources yet. Log a video, article or course under this topic.</p>
          )}
        </div>
      )}
    </div>
  );
}

function TopicRename({ tp }: { tp: Topic }) {
  const app = useApp();
  const [n, setN] = useState(tp.name || "");
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const v = n.trim();
    if (!v) return;
    if (await app.write(() => app.db.doc("topics", tp.id).update({ name: v }), "Topic renamed")) app.set({ editTopic: null });
  }
  return (
    <div className="topic" data-edit={tp.id}>
      <form className="ms-add" style={{ gridColumn: "1/-1" }} onSubmit={submit}>
        <input type="text" aria-label="Topic name" autoFocus value={n} onChange={(e) => setN(e.target.value)} />
        <button className="btn primary" type="submit">
          Save
        </button>
        <button className="btn" type="button" onClick={() => app.set({ editTopic: null })}>
          Cancel
        </button>
      </form>
    </div>
  );
}
