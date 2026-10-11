---
name: verify
description: Verify a change to Learning Ledger works in the real app, not just in tests. Runs tests, type-check, build and lint, serves dist/ and the API on localhost:8765 against a throwaway Postgres, then drives the affected flows in a real browser (Playwright plugin) and reports a pass/fail checklist with screenshots. Use after changing anything in src/, server/, index.html or vite.config.ts, before saying a change is done or before shipping, and whenever the user asks to check, test or confirm that something works in the app.
---

Vitest covers logic and core flows in jsdom, but jsdom isn't a browser: it has missed real bugs here (missing `File.text()`, no layout, no CSS). Verifying means building the real app and using it the way the user does.

## 1. Find what changed

Run `git diff --stat main...HEAD` plus `git status --short` to list changed files. Pick the flows to drive from this map. Several files mean the union of their flows. When unsure, do the core flow.

| Changed | Drive these flows |
| --- | --- |
| `db/db.ts`, `db/format.ts`, `TopBar.tsx`, the export format | import, add entry, **reload** (data persists), Export (valid JSON: `app`, `schema`, four arrays), re-import an old `data/` backup, one-time move of localStorage data into an empty database |
| `server/db.ts`, `server/rows.ts`, `server/api.ts` | step 3 API checks, then import, add, edit and delete an entry and compare `GET /api/ledger` with what the page shows; stop the database and check the Retry banner |
| `AppContext.tsx` (`setStatus`, `createTopic`) | complete a milestone (milestone entry appears, next starts, next-step input focused), reopen it, add an entry with a new topic |
| `MilestonePanel.tsx`, `NextPanel.tsx` | cycle a milestone's status, edit one, set a next step with Enter, "Start this milestone" |
| `AddEntryForm.tsx` | log each type, the topic-required toast, pasting a URL switches to Source, Build + "completes the milestone" |
| `LogPanel.tsx`, `EntryItem.tsx`, `EntryEditForm.tsx` | Timeline / By topic / By milestone, search, type and topic filters, edit and delete an entry |
| `TopicsPanel.tsx`, `QuestionsPanel.tsx`, `AnswerForm.tsx` | rename a topic, topic filter + sources, answer a question (Ctrl+Enter) |
| `GoalPanel.tsx` | create a track, edit the goal, pace bar and days left |
| `styles.css`, `index.html`, fonts | screenshots at 1280px and 390px (no horizontal scroll), fonts loaded |
| `server/index.ts`, `vite.config.ts`, `package.json` | step 3 routes, plus the core flow |
| `server/auth.ts`, `src/db/auth.ts`, `SignInForm.tsx`, `App.tsx` | step 3 account checks, then: create account A, import, reload (still signed in), sign out (sign-in form, no data); create account B (empty, the same backup imports without clashing); sign back in as A (A's data intact); wrong password shows the error |

**Core flow** (always do it): import the backup, add one entry, complete the in-progress milestone, check the log.

## 2. Test, build and lint

Run `npm test`, `npm run build` and `npm run lint`. If one fails, stop and fix it. A browser check on a broken build proves nothing. The test run is slow on this machine (~1 min), so give it a long timeout.

## 3. Serve and smoke-test

**Never verify against the user's Neon database.** The flows below Import with Replace, which wipes everything. Use a throwaway PGlite database (real Postgres compiled to WebAssembly) instead:

1. PGlite is a dev dependency of the project, so there's nothing to install.
2. Start it in the background: `npx pglite-server --port=5499 --max-connections=5`. It's in-memory, so a restart starts empty.
3. Port 8765 is shared by `npm run dev` and `npm start`, and only one can listen at a time. Stop any server this session started.
4. Start the app server in the background with the variable set inline. It overrides `.env`, because `process.loadEnvFile` doesn't replace variables that are already set: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5499/postgres node server/index.ts`.

Then `curl`:
- 200 for `/`, `/fonts/fonts.css` and the JS file named in `dist/index.html`;
- `/api/health` must say `{"ok":true,"db":true}`.

If the server changed, also check the guard rails with `curl` (keep a cookie jar: `-c jar -b jar`):
- `/api/ledger` with no cookie → 401;
- `POST /api/auth/signup` with `{"email":"a@example.com","password":"a long password"}` → 200 and a `Set-Cookie: ll_session=…; HttpOnly; SameSite=Lax` header; then `/api/ledger` with the jar → 200;
- `POST /api/auth/signin` with a wrong password → 401 `Email or password is wrong.`;
- a PUT with `Content-Type: text/plain` → 415; a `Host: evil.example` header → 403; a PUT with `Origin: https://evil.example` → 403; `/api/users/x` signed in → 404;
- `/healthz` → 200 `ok`.

If `server/index.ts`, `server/auth.ts` or `render.yaml` changed, also restart once with `HOST=0.0.0.0` inline (still on PGlite) and check that sign-up's cookie is now `__Host-ll_session=…; …; Secure`. Browsers drop Secure cookies on plain http, so restart without `HOST` before the browser steps.

To watch a migration run, seed the PGlite database with the old schema first (see `OLD_SCHEMA` in `server/db.test.ts`), then start the server: it logs `Database: ran migration N.`

The app always starts at the sign-in form, so step 4 begins by creating an account.

## 4. Drive it with the Playwright plugin

Load the `mcp__plugin_playwright_playwright__*` tools (ToolSearch) and use them. Prefer `browser_snapshot` refs over guessing selectors: the snapshot shows the accessible names. They're what the user sees, and they're stable across class changes.

1. **Start clean.** The plugin's browser keeps its profile between runs. It's separate from the user's own browser, so their real data is safe, but data from the previous verify run is still there. `browser_navigate` to http://localhost:8765, then `browser_evaluate` `() => { localStorage.clear(); location.reload(); }`. If the app is still signed in from last time, click **Sign out**. Then click **Create an account** and sign up with a fresh email (e.g. `verify-<time>@example.com`) and a 10+ character password. PGlite is in-memory, so accounts vanish when it restarts.
2. **Load realistic data.** Click **Import**. A file chooser opens. Call `browser_file_upload` with the absolute path of `data/learning-ledger-2026-10-10.json`. If a "Replace what's in the database…" banner appears, click **Replace**. Expect the toast "Imported 1 track and 15 entries".
   - Clearing localStorage in step 1 matters: if the database is empty and localStorage has old data, the app moves that data in first.
3. **Drive the flows from step 1.** After each action, confirm the result the user would see: the counts (`15 entries`, `1 of 8 done`), which milestone is in progress, the new row in the log. Clicking without checking the outcome isn't verification.
   - Check that a change was actually saved, not just shown. `browser_evaluate` can call `await fetch('/api/ledger').then(r => r.json())` and count records. Reloading the page after a change must keep it.
   - Read several outcomes in one `browser_evaluate` call. It's much faster than a snapshot per step. For example: `() => ({ toast: document.getElementById('toast')?.textContent, log: document.getElementById('logCount')?.textContent, ms: document.getElementById('msCount')?.textContent, doing: document.querySelector('#msList > li[data-s="doing"] .mt-btn')?.textContent, focused: document.activeElement?.id })`.
   - Toasts disappear after 2.2 s, so an empty toast a few calls later doesn't mean failure. Trust the counts, or use `browser_wait_for` with the toast text right after the action.
   - Use snapshots to find what to click. Stable selectors also work as targets: `#addTopic`, `#addTopicNew`, `#addText`, `#msList > li[data-s="doing"] button.state`, `#logSearch`, `#viewSeg`, `#filters`.
4. **Check for errors.** Call `browser_console_messages` (level `warning`, `all: true`) at the end. Any error is a failure, even if the UI looked right. The exception is failed `/api` requests from an outage you caused on purpose (stopping the database to test the Retry banner).
5. **Look at it.** The plugin's window is ~914px wide by default, so first `browser_resize` to 1280×900. Then `browser_take_screenshot` with `fullPage: true` and `filename: ".playwright-mcp/verify-desktop.png"`. If layout or CSS changed, repeat at 390×844 as `verify-phone.png`. Open the images and actually look: blank panels, overlapping text and unstyled fonts only show up here.

Gotchas:
- `.label` text is uppercased by CSS, so it appears as "19 ENTRIES" in snapshots. Compare case-insensitively.
- The plugin writes snapshots and screenshots to `.playwright-mcp/` in the project. That folder is gitignored, so keep verify output there and never commit it.

**No plugin?** Fall back to `playwright-core` installed in the scratchpad (never the project), launching the installed Edge with `chromium.launch({ channel: "msedge" })` in a fresh context, and do the same steps in a script.

## 5. Report

Use this shape so the user can scan it:

```
Verified: <what changed, one line>
✅ npm test (N passed) · build · lint
✅ <flow>: <what you saw, e.g. "toast 'Milestone reached…', m3 now in progress">
❌ <flow>: <what went wrong, with the console error or screenshot>
Screenshots: <paths>
Server: running at http://localhost:8765 (on the throwaway PGlite database, not Neon)
```

Report failures plainly and don't soften them. Leave the server running so the user can look for themselves, and tell them it's using test data, not their Neon database. When they want their real data, stop it and run `npm start`.
