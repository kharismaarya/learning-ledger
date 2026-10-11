# Learning Ledger

One home per learning goal: the goal, its milestones, topics, and a log of everything you watch, learn, ask and build.
The app and its small server run on your computer for development, and on [Render](https://render.com) for everyday use.
Your data is saved in a Postgres database on [Neon](https://neon.tech): the **main** branch holds the live data that Render uses,
and the **dev** branch is a separate copy for working on the code locally.
No user accounts yet: locally the server only accepts requests from your own computer, and on Render it asks for a single password.

## What's in the folder

| File | What it is |
| --- | --- |
| `src/` | The app: React components (`components/`), app state (`state/AppContext.tsx`), the data module that talks to the server (`db/db.ts`), styles (`styles.css`) |
| `server/` | The server: serves the app and the `/api` routes (`index.ts`, `api.ts`), and saves to Postgres (`db.ts`, tables in `rows.ts`) |
| `index.html` | Vite entry page |
| `public/fonts/` | Familjen Grotesk, IBM Plex Sans, IBM Plex Mono (woff2, SIL Open Font License 1.1) and `fonts.css` |
| `data/learning-ledger-2026-10-10.json` | Your data exported from the claude.ai version: 1 track, 2 topics, 8 milestones, 15 entries |
| `.env.example` | Template for `.env`, which holds your database connection string |
| `render.yaml` | How Render builds and runs the deployed app |
| `start-windows.bat`, `start-mac-linux.sh` | Build on first run, then start the server and open the app |

## Libraries

React 18 with TypeScript, built with Vite. The server uses [node-postgres](https://node-postgres.com) (`pg`) to talk to the database. The only other outside files are the bundled fonts.

## Services

- Node.js 24 or newer, to install, build and run the server. Node 24 runs the server's TypeScript directly.
- A free Neon account for the Postgres database.
- Git, if you want to version your backup files.

## Set up the database (once)

1. Sign up at https://neon.tech and create a project. It starts with a `main` branch; create a `dev` branch from it too.
2. In the project, pick the **dev** branch, click **Connect** and copy the connection string. It starts with `postgresql://`.
3. In this folder, copy `.env.example` to `.env` and paste the string after `DATABASE_URL=`.

Your computer uses **dev**, so trying things out while coding never touches your live data on **main**.

`.env` contains your database password. It's listed in `.gitignore`, so Git won't commit it. Keep it that way, because this repo is public.
The server creates its tables the first time it connects.

## Run it

Double-click `start-windows.bat` (or run `./start-mac-linux.sh`). The first time, it runs `npm install` and `npm run build`.
After that, it opens http://localhost:8765. Keep the black window open while you use the app.

From a terminal:

| Command | What it does |
| --- | --- |
| `npm install` | Install React, Vite and TypeScript (once) |
| `npm run build` | Type-check the app and server, and build the app into `dist/` |
| `npm start` | Run the server: the app at http://localhost:8765, plus the API |
| `npm run dev:api` + `npm run dev` | For changing the code: the API on port 8766, and the app with live reload at http://localhost:8765 (run each in its own terminal) |
| `npm run lint` | Check the code with ESLint |
| `npm test` | Run the tests once (`npm run test:watch` reruns them as you edit) |

Both `npm run dev` and `npm start` use http://localhost:8765, so only run one at a time.
After you change the code, run `npm run build` again before `npm start`.

## Deploy on Render

The deployed app runs on Render's free plan at `https://<name>.onrender.com`, uses the Neon **main** branch, and asks for one password.
`render.yaml` describes the service; Render reads it from the `main` branch on GitHub and deploys again after every push to `main`.

Once:

1. Choose a password of at least 16 characters (a password manager can make one). It's never stored in this repo.
2. In Neon, pick the **main** branch, click **Connect** and copy its connection string.
3. Sign in at https://render.com with GitHub, then **New** → **Blueprint**, and choose this repository.
4. Render asks for `DATABASE_URL` (paste the main-branch string) and `APP_PASSWORD` (paste the password). Click **Apply**.
5. When the deploy finishes, open the address Render shows. The browser asks you to sign in: type anything as the username, and your password.
6. If main is empty, click **Import** and choose your latest Export. (The browser-data move doesn't apply here: the Render address has its own, empty browser storage.)

Good to know:

- The free plan sleeps after 15 minutes without visits. The next visit wakes it, which takes about a minute.
- To change the password, edit `APP_PASSWORD` under the service's **Environment** tab in Render. It restarts with the new one.
- On Render, the server only starts if `APP_PASSWORD` is set, because `HOST=0.0.0.0` opens it to the internet.

## First time: load your data

If you used the browser-only version before, there's nothing to do. The first time the app finds an empty database,
it moves the data saved in your browser into it and says "Moved your browser data into the database".
Your browser keeps its old copy too.

Otherwise, click **Import a backup** (or **Import** in the top bar) and choose `data/learning-ledger-2026-10-10.json`.

## Where your data lives

In your Neon Postgres database, in four tables: `tracks`, `topics`, `milestones` and `entries`. Each change is saved as soon as you make it.
The app shows a change only after the server confirms it was saved. If the server or database can't be reached, you get a message and nothing changes.
Clearing your browser data doesn't touch it, and any browser on this computer shows the same data.

You can look at the data in Neon's **SQL Editor**, for example `select type, text from entries order by date desc;`.

- Click **Export** now and then. It saves `learning-ledger-YYYY-MM-DD.json`. The top bar shows when you last backed up and turns amber after 7 days.
- **Import** replaces everything in the database, after asking you to confirm.
- Neon's free plan pauses the database when it's idle, so the first request after a break can take a second or two.

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
| Data in a claude.ai-hosted database | Data in your own Postgres database on Neon, plus Export/Import files |
| Same data on phone and laptop | Same data anywhere, through the password-protected Render address |
| Claude could log entries from a chat | Not available; you can ask Claude for a JSON snippet and import a merged file, or log by hand |
| claude.ai sign-in decided who can edit | You are the only user |

Everything else works the same: tracks, topics, milestones with next steps, the Now working on box,
Build entries counting toward milestones, question answers, and the Timeline / By topic / By milestone views.

## Changing the code

All data access in the app goes through `src/db/db.ts`. It offers the same small API the claude.ai version used
(`collection(name).onSnapshot`, `.doc(id).set / update / delete`) and sends each change to the server:

| Route | Does |
| --- | --- |
| `GET /api/ledger` | Everything, in the export format |
| `PUT /api/ledger` | Replace everything (Import) |
| `PUT /api/<collection>/<id>` | Create or replace one record |
| `PATCH /api/<collection>/<id>` | Change some fields of one record |
| `DELETE /api/<collection>/<id>` | Delete one record |
| `GET /api/health` | `{ ok, db }`: is the server up, and can it reach the database |
| `GET /healthz` | `ok`, with no password and no database query: Render's health check |

Without user accounts, the server protects your data like this:
- Locally, it only listens on 127.0.0.1.
- On Render, every request needs `APP_PASSWORD` (HTTP Basic Auth).
- It only accepts writes sent as JSON, which other websites can't send to it.
- It rejects requests addressed to any host other than localhost or its Render address.
