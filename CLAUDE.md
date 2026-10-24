# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands
- `npm run build` type-checks the app (`tsconfig.json`) and the server (`server/tsconfig.json`), then runs `vite build` into `dist/`. It is the only type check, and it covers test files too.
- `npm test` runs Vitest in two projects: **app** (`src/`, jsdom, with the fake API) and **server** (`server/`, plain Node). Use `npx vitest run src/App.test.tsx -t "name"` for one test, or `--project server`. The first run is slow on this machine (~1 min).
- `npm run lint` runs ESLint (typescript-eslint + react-hooks rules, `eslint.config.js`). Keep it at zero problems.
- A Stop hook (`.claude/hooks/typecheck.mjs`) type-checks at the end of a turn when `src/` has uncommitted changes, and sends errors back for you to fix.
- `npm start` runs `node server/index.ts`: it serves the built `dist/` plus the `/api` routes on **localhost:8765**. Rebuild before `npm start` or the app doesn't change.
- For live reload, run `npm run dev:api` (API only, port 8766, `node --watch`) and `npm run dev` (Vite on 8765, proxies `/api` to 8766). `npm run dev` and `npm start` both bind 8765 with `strictPort`, so only one can run at a time.
- The server is TypeScript run directly by Node 24's type stripping (no build step). Only erasable syntax works: no `enum`, `namespace` or constructor parameter properties. Relative imports in `server/` need the `.ts` extension, and type-only imports must use `import type`.
- `package.json` has `"type": "module"`, so any new Node script must use `import`, not `require`.
- The server needs `DATABASE_URL` (Neon Postgres) in `.env`; see `.env.example`. **Never commit `.env`**, because the repo is public. If you need a database for testing, run PGlite (a dev dependency): `npx pglite-server --port=5499 --max-connections=5` and set `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5499/postgres`. Don't point tests at the user's Neon data.

## Deployment (Render)
- `render.yaml` is a Render Blueprint: free web service in `singapore` (next to Neon's `ap-southeast-1`), `npm ci && npm run build`, then `npm start`. Render deploys from `main`, so **pushing `main` (`/ship`) deploys to production**.
- Neon branches: **main** = live data, used only by Render (its `DATABASE_URL` lives in Render's dashboard). **dev** = the local `.env`. Never point local runs or tests at main.
- `HOST` (default `127.0.0.1`) is set only on Render. A non-loopback `HOST` also makes the session cookie `Secure` with the `__Host-` prefix (`{ secure: PUBLIC }` passed to `handleApi`), so the deployed app must be served over HTTPS (Render is). `APP_PASSWORD` and Basic Auth are gone (Phase 3).
- `/healthz` (Render's health check) answers before the API and never queries the database, so health checks don't wake Neon.
- The API's Host allowlist (`allowedHosts` in `server/auth.ts`) is localhost, 127.0.0.1, `RENDER_EXTERNAL_HOSTNAME` (set by Render automatically) and `PUBLIC_HOSTNAME`, our own domain (Phase 4), set in `render.yaml`. When both are set, `canonicalRedirect` makes `server/index.ts` answer GET/HEAD on the onrender.com name with a 301 to `PUBLIC_HOSTNAME` (after `/healthz`), so there's one origin for cookies and localStorage. Ship a `PUBLIC_HOSTNAME` change before moving DNS, or the API answers 403. Setup steps are in README ("Your own domain").
- Accounts (Phase 3): email + password, scrypt hashes (`server/auth.ts`), and a random session token in an `HttpOnly; SameSite=Lax` cookie; the `sessions` table stores only its SHA-256. The client never touches the cookie. `src/db/auth.ts` calls `/api/auth/{signup,signin,signout,me}`; `src/App.tsx` shows `SignInForm` or the app. A 401 becomes `DbError.code === "unauthenticated"` and sends the user back to sign-in; sign-out calls `db.reset()`. `GET /api/auth/me` answers `200 { email: null }` when nobody is signed in, not 401, because browsers log every 4xx as a console error and this one is expected on every visit.
- CSRF defences: writes must be `application/json` (`readJson` in `server/api.ts`), a cross-site `Origin` is refused, and the cookie is `SameSite=Lax`. Keep all three. Sign-in/sign-up are rate-limited in memory (`RateLimiter`): per email for failed sign-ins, per IP via `CF-Connecting-IP` only (Render's `X-Forwarded-For` can be faked by the client).
- Email verification and password reset aren't built yet (no email service). Hooks: `server/mail.ts` (explains both), `users.email_verified_at`, `db.deleteSessionsForUser`, and `TODO`s in `server/api.ts`.

## Data compatibility (don't break the user's saved data)
- The data lives in Postgres on Neon. The browser reaches it only through the server's `/api` (`server/api.ts`), never directly.
- localStorage key `learning-ledger` holds data from the earlier browser-only version. `db.load()` moves it into the signed-in account if that account is empty, once per browser (`learning-ledger:moved` records it), and leaves it in place as a spare copy. `learning-ledger:lastExport` and the `ll.*` view prefs stay in localStorage. Never rename these keys.
- Keep port 8765, because the one-time move can only read localStorage from the same origin.
- All reads and writes in the app go through `src/db/db.ts` (Firestore-like `collection().doc().set/update/delete` + `onSnapshot`, over an in-memory cache). Writes reach the cache only after the server confirms them. Components never call `fetch` for records themselves.
- `src/db/format.ts` (`norm`, `validate`, `COLS`) is shared by the app and the server. Keep it free of browser and Node APIs.
- Tables are created by the numbered `MIGRATIONS` in `server/rows.ts`; `schema_migrations` records which ran (`migrate()` in `server/db.ts`, one transaction, advisory lock). Any schema change is a **new** migration at the end; never edit one that has run on Neon. A new field needs a column (in a migration) and an entry in `FIELDS`. Fields not listed in `FIELDS` are silently dropped.
- Every record table has `user_id` and the key `(user_id, id)`, with composite foreign keys (`on delete set null (topic_id)` clears only the link). `user_id` is never in `FIELDS`: it always comes from the session. Every function in `server/db.ts` that touches records takes `userId` first and filters on it. Migration 1 moved the pre-accounts tables into the `legacy` schema. On Neon main the data was imported into the user's account and `legacy` was dropped (2026-10-11); dev still has its `legacy` copy.
- Empty strings are stored as NULL. NULL comes back as `""`, or as a missing key for optional fields (`nextStep`, `resolved`, `answer`).
- The export/import JSON format (`app: "learning-ledger"`, `schema: 1`, `tracks/topics/milestones/entries`, documented in README) must stay readable. Old backups in `data/` must still import. If the schema changes, bump `schema` and migrate in `norm()` in `src/db/format.ts`.
- Import (`PUT /api/ledger`) replaces all of the signed-in user's records in one transaction (other users untouched). `linkSafe` drops records whose track is missing and clears links to missing topics or milestones, so the foreign keys don't reject old backups.
- SQL uses `$1` parameters only. Table and column names come from `FIELDS`, never from the request.
- Completing a milestone creates an entry with the fixed id `ms-<milestoneId>`, and reopening it deletes that entry (`setStatus` in `src/state/AppContext.tsx`).

## Code conventions
- UI state and shared actions live in `src/state/AppContext.tsx` (`useApp()`). Forms keep their drafts in local `useState` so live data updates don't wipe what's being typed.
- Styling is plain CSS in `src/styles.css`, ported verbatim from the original single-file app. Reuse its existing class names rather than adding inline styles or a CSS framework.
- Entry type colours come from CSS vars passed as `style={{ "--c": ... } as CSSProperties}`.

## Tests
- Unit tests sit next to the code (`*.test.ts`). `src/App.test.tsx` renders the whole app with Testing Library and drives it like a user. Add a test there for any new user-facing flow.
- `src/test/setup.ts` replaces `fetch` with `src/test/fakeApi.ts`, an in-memory fake of `/api`, and resets it, the cache and localStorage before each test. Tests start signed in as `ME` (`me@example.com`). Seed data with `fakeApi.data = norm(...)` before `render(<App />)`, then wait for the UI. That way the app loads it the way it does on a real start, with no stray reload partway through the test. Make the server fail with `fakeApi.fail = "network" | 503`; end the session with `fakeApi.switchTo(null)` (each fake account keeps its own data).
- `server/rows.test.ts` covers the SQL mapping without a database. `server/db.test.ts` runs the real SQL and the HTTP API against an in-process PGlite (port 5498), starting from the pre-accounts schema so migrations are tested too. Add a test there for any new query, and keep the cross-user isolation tests passing.
- setup.ts also polyfills what jsdom lacks (`scrollIntoView`, `matchMedia`, `Blob.text`). If a test fails only in jsdom, check for a missing browser API before blaming the app.
- `testTimeout` is 20 s because the whole-app tests take about 6 s each on this machine.
- `data/learning-ledger-2026-10-10.json` is the fixture, and tests rely on its ids (`webapp`, `m1`–`m8`, `planning`, `claude-code`). Don't edit it. Add a new backup file instead.
- `user.selectOptions` matches an option's value or its innerHTML, where `&` becomes `&amp;`. Select by value.

## Verifying changes
Run `npm test`, `npm run build` and `npm run lint`, then run the app and click through the affected flow in a browser (use `/verify`). Import `data/learning-ledger-*.json` to get realistic data.

## Git
- Work on a feature branch, then merge into `main` and push only when the user asks (`/ship`).
- The GitHub repo is public. Committing backups in `data/` is fine with the user.

## Working with the user
The user is learning web development through this project. Explain the why as you go, especially React, TypeScript and tooling decisions, rather than only reporting what changed.
