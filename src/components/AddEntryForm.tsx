import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { today } from "../lib/dates";
import { store } from "../lib/localStore";
import { submitOnModEnter } from "../lib/text";
import { useApp } from "../state/AppContext";
import { PICK, type Entry, type EntryType } from "../types";
import { MilestoneOptions } from "./EntryEditForm";

/** "Log something": the quick-add form. */
export function AddEntryForm() {
  const app = useApp();
  const { track: t, tTopics: ts, tMs, ui } = app;

  const [topic, setTopic] = useState("");
  const [newChosen, setNewChosen] = useState(false);
  const [newName, setNewName] = useState("");
  const [type, setType] = useState<EntryType>("insight");
  const [typeTouched, setTypeTouched] = useState(false);
  const [ms, setMs] = useState("");
  const [msTouched, setMsTouched] = useState(false);
  const [completes, setCompletes] = useState(false);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const topicRef = useRef<HTMLSelectElement>(null);
  const newRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  /* which topic is selected: keep the user's choice while it's valid, else the topic filter,
     else the last topic used on this track, else "new topic" when the track has none */
  let topicV = "";
  if (topic && ((topic === "__new" && newChosen) || ts.some((x) => x.id === topic))) topicV = topic;
  else {
    const pref = (app.topicFilter && app.topicFilter !== "__none" ? app.topicFilter : null) || store.get("ll.topic." + app.curId);
    if (pref && ts.some((x) => x.id === pref)) topicV = pref;
    else if (!ts.length) topicV = "__new";
  }
  useEffect(() => {
    if (topicV !== topic) setTopic(topicV);
  }, [topicV, topic]);
  /* another panel asked for a topic (e.g. one just created): switch once it exists */
  useEffect(() => {
    if (ui.topicReq && ts.some((x) => x.id === ui.topicReq)) {
      setTopic(ui.topicReq);
      setNewChosen(false);
      app.set({ topicReq: null });
    }
  }, [ui.topicReq, ts, app]);

  const msV = tMs.some((m) => m.id === ms) ? ms : "";
  const msSel = app.data.milestones.find((x) => x.id === msV);
  const showDone = !!msSel && msSel.status !== "done";

  if (!t || ui.editingGoal) return null;

  function pickType(k: EntryType) {
    setType(k);
    setTypeTouched(true);
    if (k === "build" && !msTouched && app.curMs) setMs(app.curMs.id);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!t) return;
    const tx = text.trim(),
      u = url.trim();
    let topicId = topicV;
    if (!topicId) {
      topicRef.current?.focus();
      app.toast("Pick a topic for this entry.");
      return;
    }
    if (topicId === "__new" && !newName.trim()) {
      newRef.current?.focus();
      app.toast("Name the new topic.");
      return;
    }
    if (!tx && !u) {
      textRef.current?.focus();
      app.toast("Add a line about what you got from it.");
      return;
    }
    setBusy(true);
    try {
      if (topicId === "__new") {
        const id = await app.createTopic(t.id, newName.trim());
        if (!id) return;
        topicId = id;
      }
      const msId = type === "build" ? msV : "",
        done = type === "build" && completes && showDone;
      const body: Omit<Entry, "id"> = { trackId: t.id, topicId, milestoneId: msId, type, text: tx || u, url: u, date: date || today(), createdAt: Date.now() };
      if (type === "question") body.resolved = false;
      if (await app.write(() => app.db.collection("entries").doc().set(body), done ? null : "Logged")) {
        if (done) {
          const m = app.data.milestones.find((x) => x.id === msId);
          if (m) await app.setStatus(m, "done");
        }
        setMs("");
        setMsTouched(false);
        setCompletes(false);
        store.set("ll.topic." + t.id, topicId);
        app.set({ topicReq: topicId });
        setNewName("");
        setText("");
        setUrl("");
        setDate(today());
        setTypeTouched(false);
        setType("insight");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" id="addPanel">
      <div className="panel-head">
        <h2>Log something</h2>
        <span className="hint">Takes 5 seconds. Future you will thank you.</span>
      </div>
      <form id="addForm" style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={submit}>
        <div className="row">
          <div className="field">
            <label className="label" htmlFor="addTopic">
              Topic <span className="req">*</span>
            </label>
            <select
              id="addTopic"
              ref={topicRef}
              value={topicV}
              onChange={(e) => {
                const v = e.target.value;
                setTopic(v);
                setNewChosen(v === "__new");
                if (v === "__new") setTimeout(() => newRef.current?.focus());
              }}
            >
              <option value="" disabled>
                {ts.length ? "Choose a topic…" : "Create your first topic…"}
              </option>
              {ts.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
              <option value="__new">+ New topic…</option>
            </select>
          </div>
          {topicV === "__new" && (
            <div className="field" id="newTopicField">
              <label className="label" htmlFor="addTopicNew">
                New topic name
              </label>
              <input type="text" id="addTopicNew" ref={newRef} placeholder="e.g. Git & GitHub" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
          )}
        </div>
        <div className="types" id="typePick" role="group" aria-label="Entry type">
          {PICK.map((x) => (
            <button key={x.k} type="button" className="type" style={{ "--c": x.c } as CSSProperties} aria-pressed={type === x.k} onClick={() => pickType(x.k)}>
              <span className="dot" />
              {x.n}
            </button>
          ))}
        </div>
        {type === "build" && (
          <div className="row" style={{ alignItems: "center" }} id="addMsRow">
            <div className="field">
              <label className="label" htmlFor="addMs">
                Progress toward milestone{" "}
                <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--faint)" }}>optional</span>
              </label>
              <select
                id="addMs"
                value={msV}
                onChange={(e) => {
                  setMs(e.target.value);
                  setMsTouched(true);
                }}
              >
                <MilestoneOptions ms={tMs} />
              </select>
            </div>
            {showDone && (
              <label id="addDoneWrap" className="chk">
                <input type="checkbox" id="addDone" checked={completes} onChange={(e) => setCompletes(e.target.checked)} /> This completes the milestone
              </label>
            )}
          </div>
        )}
        <div className="field">
          <textarea
            id="addText"
            ref={textRef}
            placeholder="What did you get from it? One line is enough."
            aria-label="What you learned or did"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={submitOnModEnter}
          />
        </div>
        <div className="row">
          <div className="field">
            <input
              type="url"
              id="addUrl"
              placeholder="Link (video, article, chat, repo) — optional"
              aria-label="Link"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (!typeTouched && e.target.value.trim() && type !== "source") setType("source");
              }}
            />
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <input type="date" id="addDate" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <button className="btn primary" type="submit" id="addBtn" disabled={busy}>
            Add to log
          </button>
        </div>
      </form>
      <div className="claude-tip">
        Saved in this browser as you go. Use <code>Export</code> now and then to keep a backup file you can import anywhere.
      </div>
    </section>
  );
}
