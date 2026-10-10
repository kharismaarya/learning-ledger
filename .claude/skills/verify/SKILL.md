---
name: verify
description: Verify a change to Learning Ledger works in the real app. Type-check and build, serve dist/ on localhost:8765, smoke-test routes, then click through the affected flows in a browser. Use after changing anything in src/, serve.js, index.html or vite.config.ts, and before saying a change is done.
---

There is no test suite, so verifying means building and driving the app itself.

1. **Build and lint.** Run `npm run build` and `npm run lint`. Any TypeScript or ESLint error is a failure: fix it before continuing.

2. **Serve.** Port 8765 is shared by `npm run dev` and `node serve.js`, and only one can listen at a time. Stop any server this session started, then start `node serve.js` in the background. It refuses to start if `dist/index.html` is missing.

3. **Smoke-test.** `curl` must return 200 for `/`, `/fonts/fonts.css` and the JS file under `/assets/` (read its name from `dist/index.html`).

4. **Drive it in a browser.** Use a fresh browser profile, never the user's own, because their real data lives in localStorage at this origin.
   - Prefer a browser tool if this session has one (the Playwright plugin, Claude in Chrome, or the built-in browser).
   - Otherwise install `playwright-core` in the scratchpad (not the project) and launch the installed Edge with `chromium.launch({ channel: "msedge" })`.
   - Import `data/learning-ledger-*.json` through `#importFile`, then exercise the flows the change touches. Useful selectors: `#addForm`, `#typePick`, `#msList > li[data-s]`, `#topicList`, `#log article.entry`, `#viewSeg`, `#filters`, `#logSearch`, `#toast`, `#exportBtn`.
   - Watch for `pageerror` and console errors, and take a screenshot and look at it.
   - Note: `.label` text is uppercased by CSS, so `innerText` returns e.g. "19 ENTRIES". Compare case-insensitively.

5. **If storage or the export format was touched,** also check: reload keeps the data, Export downloads valid JSON (`app`, `schema`, four arrays), and an old backup from `data/` still imports.

6. **Report** exactly what passed and what failed, with the evidence. Leave the server running and tell the user it's at http://localhost:8765.
