# Learning Ledger

One home per learning goal: the goal, its milestones, topics, and a log of everything you watch, learn, ask and build.
The app and its small server run on your computer for development, and on [Render](https://render.com) for everyday use.
Your data is saved in a Postgres database on [Neon](https://neon.tech): the **main** branch holds the live data that Render uses,
and the **dev** branch is a separate copy for working on the code locally.
Everyone signs in with their own account (email and password) and sees only their own data.

## What's in the folder

| File | What it is |
| --- | --- |
| `src/` | The app: React components (`components/`), app state (`state/AppContext.tsx`), the data module that talks to the server (`db/db.ts`), styles (`styles.css`) |
| `server/` | The server: serves the app and the `/api` routes (`index.ts`, `api.ts`), accounts and sessions (`auth.ts`), and saves to Postgres (`db.ts`, tables and migrations in `rows.ts`) |
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
The server creates its tables the first time it connects, and updates them when a new version needs it (migrations, listed in `server/rows.ts`).
Accounts live in the database too, so the account you make locally is in **dev** and the one on Render is in **main**: they're separate.

## Run it

Double-click `start-windows.bat` (or run `./start-mac-linux.sh`). The first time, it runs `npm install` and `npm run build`.
After that, it opens http://localhost:8765. Keep the black window open while you use the app.
The first time, click **Create an account** and choose an email and a password (at least 10 characters).

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

The deployed app runs on Render's free plan at `https://<name>.onrender.com` and uses the Neon **main** branch.
`render.yaml` describes the service; Render reads it from the `main` branch on GitHub and deploys again after every push to `main`.

Once:

1. In Neon, pick the **main** branch, click **Connect** and copy its connection string.
2. Sign in at https://render.com with GitHub, then **New** → **Blueprint**, and choose this repository.
3. Render asks for `DATABASE_URL`: paste the main-branch string. Click **Apply**.
4. When the deploy finishes, open the address Render shows and click **Create an account**.
5. Click **Import** and choose your latest Export. (The browser-data move doesn't apply here: the Render address has its own, empty browser storage.)

Good to know:

- The free plan sleeps after 15 minutes without visits. The next visit wakes it, which takes about a minute.
- Anyone who finds the address can create an account. They get an empty ledger of their own and can't see yours.
- A sign-in lasts 30 days on that browser, or until you click **Sign out**.

### Your own domain

`PUBLIC_HOSTNAME` in `render.yaml` is the app's own address. The API only answers requests addressed to localhost,
the onrender.com name or `PUBLIC_HOSTNAME`, and pages opened on the onrender.com name redirect there.
Change `PUBLIC_HOSTNAME` and push **before** pointing DNS at Render, or every `/api` request answers 403 "Forbidden host."

1. In Render, open the service → **Settings** → **Custom Domains** → **+ Add Custom Domain**, and enter the same hostname.
2. At your DNS provider, add a **CNAME** from that name (e.g. `ledger`) to the service's `onrender.com` name.
   For a bare domain (`example.com`), use an ALIAS/ANAME record or an **A** record to `216.24.57.1`; on Cloudflare, a CNAME `@`.
   Delete any **AAAA** records and parking/forwarding records for the name. If the domain has CAA records, allow `letsencrypt.org` and `pki.goog`.
   On Cloudflare, set **Proxy status** to **DNS only** (grey cloud).
3. Back in Render, click **Verify**. Render then issues and renews the HTTPS certificate itself and redirects http to https.
   A 502 right after verifying means routing is still updating: wait a few minutes.
4. Open the new address and sign in again. Your records are in the database, but the sign-in cookie, the view settings and
   the "last export" reminder belong to each address, so they start fresh there.

### Moving to accounts (once, when this version first deploys)

Before accounts, the data had no owner. The first time this version starts, it moves the old tables into a Postgres
schema called `legacy` (nothing is deleted) and creates new, empty tables where every record belongs to an account.
To bring your data across:

1. **Before** pushing this version, open the live app and click **Export**. Keep the file.
2. Push (`/ship`). Render deploys the new version.
3. Open the app, click **Create an account**, then **Import** the file from step 1.
4. In Render, open the service's **Environment** tab and delete `APP_PASSWORD`. It isn't used any more.
5. Once you're happy everything is there, you can delete the old copy in Neon's **SQL Editor**: `drop schema legacy cascade;`

If you forget step 1, the old data is still in `legacy.tracks`, `legacy.entries` and so on, and can be exported from there.

### Coming later

Email verification and password reset need a service that sends email. The hooks are ready: `server/mail.ts`
explains both, `users.email_verified_at` is in the schema, and the `TODO`s in `server/api.ts` mark where the routes go.
Until then, there's no "forgot password": keep yours in a password manager.

## First time: load your data

If you used the browser-only version before, there's nothing to do. The first time you sign in on that browser with an empty account,
the app moves the data saved in the browser into it and says "Moved your browser data into your account".
Your browser keeps its old copy too. It only happens once per browser, so a second account made there starts empty.

Otherwise, click **Import a backup** (or **Import** in the top bar) and choose `data/learning-ledger-2026-10-10.json`.

## Where your data lives

In your Neon Postgres database, in four tables: `tracks`, `topics`, `milestones` and `entries`. Every row has a `user_id`: the account it belongs to.
Accounts are in `users`, and sign-ins in `sessions`. Each change is saved as soon as you make it.
The app shows a change only after the server confirms it was saved. If the server or database can't be reached, you get a message and nothing changes.
Clearing your browser data doesn't touch it (it only signs you out), and any browser where you sign in shows the same data.

You can look at the data in Neon's **SQL Editor**, for example `select type, text from entries order by date desc;`.

- Click **Export** now and then. It saves `learning-ledger-YYYY-MM-DD.json`. The top bar shows when you last backed up and turns amber after 7 days.
- **Import** replaces everything in your account, after asking you to confirm. Other accounts aren't touched.
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
| Same data on phone and laptop | Same data anywhere you sign in, through the Render address |
| Claude could log entries from a chat | Not available; you can ask Claude for a JSON snippet and import a merged file, or log by hand |
| claude.ai sign-in decided who can edit | Each person has their own account and their own data |

Everything else works the same: tracks, topics, milestones with next steps, the Now working on box,
Build entries counting toward milestones, question answers, and the Timeline / By topic / By milestone views.

## Changing the code

All data access in the app goes through `src/db/db.ts`. It offers the same small API the claude.ai version used
(`collection(name).onSnapshot`, `.doc(id).set / update / delete`) and sends each change to the server:

| Route | Does |
| --- | --- |
| `POST /api/auth/signup` | `{ email, password }`: create an account and sign in |
| `POST /api/auth/signin` | `{ email, password }`: sign in |
| `POST /api/auth/signout` | End this session |
| `GET /api/auth/me` | `{ email }` of who is signed in, or `{ email: null }` |
| `GET /api/ledger` | All of your records, in the export format |
| `PUT /api/ledger` | Replace all of your records (Import) |
| `PUT /api/<collection>/<id>` | Create or replace one record |
| `PATCH /api/<collection>/<id>` | Change some fields of one record |
| `DELETE /api/<collection>/<id>` | Delete one record |
| `GET /api/health` | `{ ok, db }`: is the server up, and can it reach the database |
| `GET /healthz` | `ok`, with no database query: Render's health check |

The record routes answer 401 unless you're signed in. How the server protects your data:
- **Only your rows.** The account comes from the session, never from the request, and every query has `user_id = $1`.
  Each table's key is `(user_id, id)`, and links between tables include `user_id`, so a record can't point at someone else's.
- **Passwords** are stored only as scrypt hashes (slow and memory-hungry on purpose, with a random salt per account).
- **Sessions** are a random token in a cookie that page scripts can't read (`HttpOnly`), that other sites' requests don't
  carry (`SameSite=Lax`) and that, on Render, only travels over HTTPS (`Secure`). The database stores only a hash of the token.
- **Guessing** is slowed down: 10 wrong passwords for one email blocks sign-in to it for 15 minutes; there are per-address limits too.
  A wrong password and an unknown email get the same answer, in the same time.
- **Other websites** can't make changes: writes must be JSON (which needs a CORS preflight that the server never approves),
  and a request whose `Origin` is another site is refused.
- Locally, it only listens on 127.0.0.1, and it rejects requests addressed to any host other than localhost, its Render address or its own domain (`PUBLIC_HOSTNAME`).

Tests: `server/db.test.ts` runs the real SQL against PGlite (Postgres in WebAssembly) inside `npm test`, including
the checks that one account can't read, change or delete another's records.
