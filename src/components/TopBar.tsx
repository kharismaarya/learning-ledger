import { useState, type ChangeEvent } from "react";
import { BKEY, type DbError } from "../db/db";
import { daysBetween, parseD, today } from "../lib/dates";
import { store } from "../lib/localStore";
import { plural } from "../lib/text";
import { useApp } from "../state/AppContext";

export function TopBar() {
  const app = useApp();
  const { ui, set, db } = app;
  const [lastExport, setLastExport] = useState(() => store.get(BKEY));

  let backup = "",
    warn = false;
  if (!lastExport) {
    warn = db.counts().entries > 0;
    backup = warn ? "Not backed up yet" : "";
  } else {
    const days = daysBetween(parseD(lastExport)!, parseD(today())!);
    backup = days <= 0 ? "Backed up today" : days === 1 ? "Backed up yesterday" : `Backed up ${days} days ago`;
    warn = days > 7;
  }

  function exportFile() {
    const blob = new Blob([JSON.stringify(db.exportData(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `learning-ledger-${today()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    store.set(BKEY, today());
    setLastExport(today());
    app.toast("Backup file saved");
  }

  async function importFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    let d: { tracks: unknown[]; entries: unknown[] };
    try {
      d = JSON.parse(await f.text());
    } catch {
      app.showBanner({ msg: "That file isn't valid JSON. Choose a file saved with Export." });
      return;
    }
    const err = db.validate(d);
    if (err) {
      app.showBanner({ msg: err });
      return;
    }
    const cur = db.counts(),
      inc = { tracks: d.tracks.length, entries: d.entries.length };
    const go = async () => {
      try {
        await db.replaceAll(d);
        set({ cur: null, topicFilter: null, msFilter: null });
        app.hideBanner();
        app.toast(`Imported ${plural(inc.tracks, "track")} and ${plural(inc.entries, "entry", "entries")}`);
      } catch (e) {
        app.showBanner({ msg: "Couldn't import: " + ((e as DbError)?.message || "the server couldn't be reached.") });
      }
    };
    if (!cur.tracks && !cur.entries) {
      go();
      return;
    }
    app.showBanner({
      msg: `Replace what's in the database (${plural(cur.tracks, "track")}, ${plural(cur.entries, "entry", "entries")}) with "${f.name}" (${plural(inc.tracks, "track")}, ${plural(inc.entries, "entry", "entries")})? Export first if you want to keep the current data.`,
      buttons: (
        <>
          <button className="btn primary" onClick={go}>
            Replace
          </button>
          <button className="btn" onClick={app.hideBanner}>
            Cancel
          </button>
        </>
      ),
    });
  }

  return (
    <header className="top">
      <div className="brand">
        <h1>Learning Ledger</h1>
        <span id="savedState" className="mono"></span>
      </div>
      <nav className="tracks" id="trackBar" aria-label="Learning tracks">
        {app.sortedTracks.map((t) => (
          <button key={t.id} className="chip" aria-pressed={t.id === app.curId && !ui.newTrack} onClick={() => app.selectTrack(t.id)}>
            {t.title || "Untitled"}
          </button>
        ))}
        <button className="chip ghost" aria-pressed={ui.newTrack} onClick={() => set({ newTrack: true, editingGoal: true })}>
          + New track
        </button>
      </nav>
      <div className="io">
        <span className={"state" + (warn ? " warn" : "")} id="backupState">
          {backup}
        </span>
        <button className="btn" type="button" id="exportBtn" onClick={exportFile}>
          Export
        </button>
        <button className="btn" type="button" id="importBtn" onClick={() => app.importInput.current?.click()}>
          Import
        </button>
        <input type="file" id="importFile" accept=".json,application/json" hidden ref={app.importInput} onChange={importFile} />
        <span className="state" id="accountEmail" title="Signed in as">
          {app.account.email}
        </span>
        <button className="btn" type="button" onClick={app.signOut}>
          Sign out
        </button>
      </div>
    </header>
  );
}
