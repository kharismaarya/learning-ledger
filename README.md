# Learning Ledger — local edition

One home per learning goal: the goal, its milestones, topics, and a log of everything you watch, learn, ask and build.
This edition runs entirely on your computer. No account, no internet once it's installed.

## What's in the folder

| File | What it is |
| --- | --- |
| `src/` | The app: React components (`components/`), app state (`state/AppContext.tsx`), the local data store (`db/localDb.ts`), styles (`styles.css`) |
| `index.html` | Vite entry page |
| `public/fonts/` | Familjen Grotesk, IBM Plex Sans, IBM Plex Mono (woff2, SIL Open Font License 1.1) and `fonts.css` |
| `data/learning-ledger-2026-10-10.json` | Your data exported from the claude.ai version: 1 track, 2 topics, 8 milestones, 15 entries |
| `serve.js` | Tiny web server for the built app in `dist/` (Node.js only, no packages) |
| `start-windows.bat`, `start-mac-linux.sh` | Build on first run, then start the server and open the app |

## Libraries

React 18 with TypeScript, built with Vite. The only other outside files are the bundled fonts.

## Services

Node.js to install, build and serve. Git if you want to version your backup files.

## Run it

Double-click `start-windows.bat` (or run `./start-mac-linux.sh`). The first time, it runs `npm install` and `npm run build`.
After that, it opens http://localhost:8765. Keep the black window open while you use the app.

From a terminal:

| Command | What it does |
| --- | --- |
| `npm install` | Install React, Vite and TypeScript (once) |
| `npm run dev` | Dev server with live reload at http://localhost:8765, for changing the code |
| `npm run build` | Type-check and build the app into `dist/` |
| `npm start` | Serve `dist/` at http://localhost:8765 |
| `npm run lint` | Check the code with ESLint |

Both `npm run dev` and `npm start` use http://localhost:8765, so they see the same saved data. Only run one at a time.
The browser keeps data separately for each address, so opening the app any other way starts empty.
After you change the code, run `npm run build` again before `npm start`.

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

All data access goes through `src/db/localDb.ts`. It offers the same small API the claude.ai version used
(`collection(name).onSnapshot`, `.doc(id).set / update / delete`). To move to a real backend later, for your own domain,
replace only that module with calls to your server.
