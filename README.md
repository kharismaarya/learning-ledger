# Learning Ledger — local edition

One home per learning goal: the goal, its milestones, topics, and a log of everything you watch, learn, ask and build.
This edition runs entirely on your computer. No account, no internet, no build step.

## What's in the folder

| File | What it is |
| --- | --- |
| `index.html` | The whole app: markup, styles and plain JavaScript in one file |
| `fonts/` | Familjen Grotesk, IBM Plex Sans, IBM Plex Mono (woff2, SIL Open Font License 1.1) and `fonts.css` |
| `data/learning-ledger-2026-10-10.json` | Your data exported from the claude.ai version: 1 track, 2 topics, 8 milestones, 15 entries |
| `serve.js` | Optional tiny web server (Node.js only, no packages) |
| `start-windows.bat`, `start-mac-linux.sh` | Optional: start the server and open the app |

## Libraries

None. No React, no framework, no npm install. The only outside files are the bundled fonts.

## Services

None required. Optional: Node.js (you already have it) to run `serve.js`, and Git if you want to version your backup files.

## Run it

Pick one way and keep using it. The browser stores your data separately for each way of opening the page,
so data saved at `http://localhost:8765` will not show up if you later double-click `index.html`, and the reverse.

- **Recommended:** double-click `start-windows.bat` (or run `./start-mac-linux.sh`). It opens http://localhost:8765. Keep the black window open while you use the app.
- **Simplest:** double-click `index.html`. Works in Chrome and Edge. Some browsers (Safari) may block storage for files opened this way; the page shows a warning if so.

## First time: load your data

1. Open the app. It starts empty.
2. Click **Import a backup** (or **Import** in the top bar).
3. Choose `data/learning-ledger-2026-10-10.json`.

## Where your data lives

In this browser's local storage under the key `learning-ledger`, saved after every change. The browser allows about 5 MB,
which is room for thousands of entries.

Clearing your browser data, or using a different browser or computer, starts empty. So:

- Click **Export** now and then. It saves `learning-ledger-YYYY-MM-DD.json`. The top bar shows when you last backed up and turns amber after 7 days.
- Keep backup files in a synced folder (OneDrive, Google Drive) if you want them on another device.
- **Import** replaces what is in the browser, after asking you to confirm.

## Data format

One JSON object. Ids link records together: an entry points to its track, topic and (for Build entries) milestone.

```json
{
  "app": "learning-ledger",
  "schema": 1,
  "exportedAt": "2026-10-10T20:05:00Z",
  "tracks":     [{ "id", "title", "outcome", "why", "doneWhen", "startDate", "targetDate", "createdAt" }],
  "topics":     [{ "id", "trackId", "name", "createdAt" }],
  "milestones": [{ "id", "trackId", "order", "title", "status": "todo|doing|done", "due", "doneAt", "nextStep" }],
  "entries":    [{ "id", "trackId", "topicId", "milestoneId", "type": "source|insight|question|build|milestone",
                   "text", "url", "date", "createdAt", "resolved", "answer" }]
}
```

## What changed from the claude.ai version

| Before (claude.ai) | Now (local) |
| --- | --- |
| Data in a claude.ai-hosted database | Data in this browser, plus Export/Import files |
| Same data on phone and laptop | One browser only; move data with Export/Import |
| Claude could log entries from a chat | Not available; you can ask Claude for a JSON snippet and import a merged file, or log by hand |
| claude.ai sign-in decided who can edit | You are the only user |

Everything else works the same: tracks, topics, milestones with next steps, the Now working on box,
Build entries counting toward milestones, question answers, and the Timeline / By topic / By milestone views.

## Changing the code

All data access goes through one block in `index.html` marked `local store`. It offers the same small API the
claude.ai version used (`collection(name).onSnapshot`, `.doc(id).set / update / delete`). To move to a real backend
later, for your own domain, replace only that block with calls to your server.
