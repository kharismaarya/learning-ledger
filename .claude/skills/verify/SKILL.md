---
name: verify
description: Verify a change to Learning Ledger works in the real app, not just in tests. Runs tests, type-check, build and lint, serves dist/ on localhost:8765, then drives the affected flows in a real browser (Playwright plugin) and reports a pass/fail checklist with screenshots. Use after changing anything in src/, serve.js, index.html or vite.config.ts, before saying a change is done or before shipping, and whenever the user asks to check, test or confirm that something works in the app.
---

Vitest covers logic and core flows in jsdom, but jsdom isn't a browser: it has missed real bugs here (missing `File.text()`, no layout, no CSS). Verifying means building the real app and using it the way the user does.

## 1. Find what changed

Run `git diff --stat main...HEAD` plus `git status --short` to list changed files. Pick the flows to drive from this map. Several files mean the union of their flows. When unsure, do the core flow.

| Changed | Drive these flows |
| --- | --- |
| `db/localDb.ts`, `TopBar.tsx`, the export format | import, add entry, **reload** (data persists), Export (valid JSON: `app`, `schema`, four arrays), re-import an old `data/` backup |
| `AppContext.tsx` (`setStatus`, `createTopic`) | complete a milestone (milestone entry appears, next starts, next-step input focused), reopen it, add an entry with a new topic |
| `MilestonePanel.tsx`, `NextPanel.tsx` | cycle a milestone's status, edit one, set a next step with Enter, "Start this milestone" |
| `AddEntryForm.tsx` | log each type, the topic-required toast, pasting a URL switches to Source, Build + "completes the milestone" |
| `LogPanel.tsx`, `EntryItem.tsx`, `EntryEditForm.tsx` | Timeline / By topic / By milestone, search, type and topic filters, edit and delete an entry |
| `TopicsPanel.tsx`, `QuestionsPanel.tsx`, `AnswerForm.tsx` | rename a topic, topic filter + sources, answer a question (Ctrl+Enter) |
| `GoalPanel.tsx` | create a track, edit the goal, pace bar and days left |
| `styles.css`, `index.html`, fonts | screenshots at 1280px and 390px (no horizontal scroll), fonts loaded |
| `serve.js`, `vite.config.ts`, `package.json` | step 3 routes, plus the core flow |

**Core flow** (always do it): import the backup, add one entry, complete the in-progress milestone, check the log.

## 2. Test, build and lint

Run `npm test`, `npm run build` and `npm run lint`. If one fails, stop and fix it. A browser check on a broken build proves nothing. The test run is slow on this machine (~1 min), so give it a long timeout.

## 3. Serve and smoke-test

Port 8765 is shared by `npm run dev` and `node serve.js`, and only one can listen at a time. Stop any server this session started, then start `node serve.js` in the background (it serves the fresh `dist/`). `curl` must return 200 for `/`, `/fonts/fonts.css` and the JS file named in `dist/index.html`.

## 4. Drive it with the Playwright plugin

Load the `mcp__plugin_playwright_playwright__*` tools (ToolSearch) and use them. Prefer `browser_snapshot` refs over guessing selectors: the snapshot shows the accessible names. They're what the user sees, and they're stable across class changes.

1. **Start clean.** The plugin's browser keeps its profile between runs. It's separate from the user's own browser, so their real data is safe, but data from the previous verify run is still there. `browser_navigate` to http://localhost:8765, then `browser_evaluate` `() => { localStorage.clear(); location.reload(); }`.
2. **Load realistic data.** Click **Import**. A file chooser opens. Call `browser_file_upload` with the absolute path of `data/learning-ledger-2026-10-10.json`. If a "Replace what's in this browser…" banner appears, click **Replace**. Expect the toast "Imported 1 track and 15 entries".
3. **Drive the flows from step 1.** After each action, confirm the result the user would see: the counts (`15 entries`, `1 of 8 done`), which milestone is in progress, the new row in the log. Clicking without checking the outcome isn't verification.
   - Read several outcomes in one `browser_evaluate` call. It's much faster than a snapshot per step. For example: `() => ({ toast: document.getElementById('toast')?.textContent, log: document.getElementById('logCount')?.textContent, ms: document.getElementById('msCount')?.textContent, doing: document.querySelector('#msList > li[data-s="doing"] .mt-btn')?.textContent, focused: document.activeElement?.id })`.
   - Toasts disappear after 2.2 s, so an empty toast a few calls later doesn't mean failure. Trust the counts, or use `browser_wait_for` with the toast text right after the action.
   - Use snapshots to find what to click. Stable selectors also work as targets: `#addTopic`, `#addTopicNew`, `#addText`, `#msList > li[data-s="doing"] button.state`, `#logSearch`, `#viewSeg`, `#filters`.
4. **Check for errors.** Call `browser_console_messages` (level `warning`, `all: true`) at the end. Any error is a failure, even if the UI looked right.
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
Server: running at http://localhost:8765
```

Report failures plainly and don't soften them. Leave the server running so the user can look for themselves.
