---
name: ship
description: Merge the current feature branch into main and push to GitHub. Optional argument is the branch to ship (defaults to the current branch).
disable-model-invocation: true
---

Ship branch `$ARGUMENTS` (if empty, use the current branch) to `main`.

1. Run `git status --short`. If there are uncommitted changes, stop and ask the user whether to commit them first. Don't commit on your own.
2. If the branch to ship is `main` itself, stop. There is nothing to merge.
3. Run `npm test`, `npm run build` and `npm run lint`. If any fails, stop and report the errors. Never ship a broken build.
4. `git checkout main`, `git pull --ff-only origin main`, then `git merge --ff-only <branch>`.
   - If fast-forward isn't possible, stop and explain why: `main` moved since the branch was made. Ask the user whether to rebase the branch or do a merge commit.
5. `git push origin main`. If git asks for credentials, suggest the user run `! gh auth login`.
6. Report the commit range pushed (e.g. `ef44161..3ea451d`). Mention that the repo is public. Offer to delete the merged branch locally, but don't delete it unasked.
