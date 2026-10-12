# Git Rules

Keep commits focused.

## Branch flow (owner, 2026-10-12)

Never commit to `main` directly. Every task:

1. starts on its own branch off fresh `main` — `feat/…`, `fix/…`, `chore/…`, `docs/…`,
   `test/…` (e.g. `feat/strava-sync`, `fix/s3-init-idempotent`);
2. is pushed and opened as a PR into `main` (`gh pr create`); CI runs on the PR;
3. is merged (squash) only after every check on the PR is green;
4. reaches production only from `main`, after the merge — never deploy a branch.

GitHub enforces it (branch protection on `main`, 2026-10-12): a PR is required, checks
`ci` and `docker-smoke` must pass, admins included, no force pushes or deletion. A
direct push to `main` is rejected — don't try to work around it.

Before commit:

- inspect `git status`;
- inspect `git diff`;
- run relevant checks;
- verify no secrets are included.

Do not rewrite history unless explicitly asked.
Do not mix unrelated refactors with feature work.

Preferred commit style:
`feat: ...`
`fix: ...`
`test: ...`
`refactor: ...`
`docs: ...`
`chore: ...`
