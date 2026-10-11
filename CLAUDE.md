# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands
- `npm run build` runs `tsc --noEmit && vite build` into `dist/`. It is the only type check, and it covers test files too.
- `npm test` runs Vitest (jsdom). Use `npx vitest run src/App.test.tsx -t "name"` for one test. The first run is slow on this machine (~1 min).
- `npm run lint` runs ESLint (typescript-eslint + react-hooks rules, `eslint.config.js`). Keep it at zero problems.
- A Stop hook (`.claude/hooks/typecheck.mjs`) type-checks at the end of a turn when `src/` has uncommitted changes, and sends errors back for you to fix.
- `npm run dev` (Vite) and `npm start` (`node serve.js`, serves `dist/`) both bind **localhost:8765** with `strictPort`. Only one can run at a time, so stop the other first.
- `serve.js` serves the built `dist/`, not the source. Rebuild before `npm start` or nothing changes.
- `package.json` has `"type": "module"`, so `serve.js` and any new Node script must use `import`, not `require`.

## Data compatibility (don't break the user's saved data)
- All data lives in browser localStorage under the key `learning-ledger` (plus `learning-ledger:lastExport` and `ll.*` view prefs). Never rename these keys.
- Port 8765 is part of compatibility too: localStorage is per origin, so a different port shows an empty app.
- The export/import JSON format (`app: "learning-ledger"`, `schema: 1`, `tracks/topics/milestones/entries`, documented in README) must stay readable. Old backups in `data/` must still import. If the schema changes, bump `schema` and migrate in `norm()` in `src/db/localDb.ts`.
- All reads and writes go through `src/db/localDb.ts` (Firestore-like `collection().doc().set/update/delete` + `onSnapshot`). Components never touch localStorage for records directly. This is the seam for a future backend.
- Completing a milestone creates an entry with the fixed id `ms-<milestoneId>`, and reopening it deletes that entry (`setStatus` in `src/state/AppContext.tsx`).

## Code conventions
- UI state and shared actions live in `src/state/AppContext.tsx` (`useApp()`). Forms keep their drafts in local `useState` so live data updates don't wipe what's being typed.
- Styling is plain CSS in `src/styles.css`, ported verbatim from the original single-file app. Reuse its existing class names rather than adding inline styles or a CSS framework.
- Entry type colours come from CSS vars passed as `style={{ "--c": ... } as CSSProperties}`.

## Tests
- Unit tests sit next to the code (`*.test.ts`). `src/App.test.tsx` renders the whole app with Testing Library and drives it like a user. Add a test there for any new user-facing flow.
- `src/test/setup.ts` resets the ledger with `LocalDB.replaceAll({})` and clears localStorage before each test. It also polyfills what jsdom lacks (`scrollIntoView`, `matchMedia`, `Blob.text`). If a test fails only in jsdom, check for a missing browser API before blaming the app.
- `data/learning-ledger-2026-10-10.json` is the fixture, and tests rely on its ids (`webapp`, `m1`–`m8`, `planning`, `claude-code`). Don't edit it. Add a new backup file instead.
- `user.selectOptions` matches an option's value or its innerHTML, where `&` becomes `&amp;`. Select by value.

## Verifying changes
Run `npm test`, `npm run build` and `npm run lint`, then run the app and click through the affected flow in a browser (use `/verify`). Import `data/learning-ledger-*.json` to get realistic data.

## Git
- Work on a feature branch, then merge into `main` and push only when the user asks (`/ship`).
- The GitHub repo is public. Committing backups in `data/` is fine with the user.

## Working with the user
The user is learning web development through this project. Explain the why as you go, especially React, TypeScript and tooling decisions, rather than only reporting what changed.
