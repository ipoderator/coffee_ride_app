---
name: commit-push
description: Commit the current task's changes and push them to GitHub (origin). Use when the user says "/commit-push", "коммит и пуш", "закоммить и запушь", "push to github", or otherwise asks to commit and push finished work. Follows .claude/rules/git.md — reviews status/diff, checks for secrets, stages only task-related files, writes a conventional commit message, pushes the current branch.
---

# Commit and push

Read first: `.claude/rules/git.md`. Invoking this skill **is** the user's explicit
request to commit and push — do not ask again for routine confirmation. Stop and ask
only on a stop condition below.

## Steps

1. **Inspect state.**
   `git status --short`, `git diff --stat`, `git log --oneline -5`,
   `git status -sb` (branch + ahead/behind `origin`).
2. **Pick the files.** Stage only files that belong to the finished task(s) — the
   ones named in `.claude/context/current-task.md` / the latest `docs/changelog.md`
   entry, plus their context/doc updates. Leave anything unrelated unstaged
   (e.g. an untracked `references/` scratch folder) and mention it in the report.
   Never `git add -A` / `git add .` blindly.
3. **Check for secrets** in what is being staged: no `.env` (only `.env.example`),
   no keys/tokens/passwords, no private participant data. Quick scan:
   `git diff --cached | grep -inE "secret|token|password|api[_-]?key|BEGIN .*PRIVATE"`
   — inspect each hit; test-only placeholders are fine, real values are a stop.
4. **Confirm checks were run** for this change (tests/typecheck/lint per the task's
   validation record). If the task record shows no validation, run the narrowest
   relevant checks now. Do not commit over a known failing check.
5. **Fix stale status wording before committing.** If `.claude/context/
project-state.md` or `current-task.md` call this work "uncommitted", change that to
   "committed" (no hash — it doesn't exist yet) and stage those files, so the commit
   doesn't ship a snapshot that is wrong the moment it lands.
6. **Review the staged diff** (`git diff --cached`) once more for accidental edits.
7. **Commit.** Conventional style from `rules/git.md` (`feat:`/`fix:`/`test:`/
   `refactor:`/`docs:`/`chore:`), CR id(s) in the subject, e.g.
   `fix: CR-134 CI test env + production Docker smoke test`. Body: short bullets of
   what changed and why. End with the attribution trailer the session's
   system-reminder specifies. Use a heredoc so formatting survives:
   `git commit -F - <<'EOF' ... EOF`.
   If a hook (husky/lint-staged) fails: fix the root cause, re-stage, create a
   **new** commit — never `--no-verify`, never `--amend` a commit that's already
   pushed.
8. **Push** the current branch: `git push origin HEAD`. This project commits
   directly to `main` (no PR workflow so far) — keep that unless the user asks for a
   branch/PR. If the push is rejected as non-fast-forward: `git pull --rebase origin
<branch>`, re-run the affected checks if the rebase pulled in code, push again.
   Never force-push unless the user explicitly asks.

## Stop conditions (ask the user)

- a real secret or `.env` would be committed;
- a check is failing and the fix is outside the task's scope;
- push rejected for a reason other than non-fast-forward (auth, protected branch);
- it's unclear which of several unrelated change sets belong in this commit.

## Report

Commit hash + subject, branch, push result (`origin/<branch>` updated), and any files
deliberately left uncommitted.
