# Current task — CR-216: no Dependabot `cooldown` for npm — DONE

Source: owner, 2026-10-07 — "бот упал красным" after CR-215 (`fdd188e`); owner chose
"remove cooldown for npm only".

## Result

The npm Dependabot job (run 37599372433) still failed: Dependabot runs
`pnpm update … -r --config.minimum-release-age=10080` to implement `cooldown`, which
re-checks the whole lockfile (`next`/`eslint-config-next` 16.3.8, 6 days old). The npm
entry has no `cooldown` now; actions/docker/docker-compose keep 7 days.

## Validation

Dependabot's exact command in a scratch copy: fails with the flag, resolves without it.
Prettier.
