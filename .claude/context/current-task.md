# Current task — CR-215: drop pnpm `minimumReleaseAge` — DONE

Source: owner, 2026-10-07 — "там что-то упало" after CR-214 was pushed (`eadf92f`).

## Result

Three Dependabot npm update jobs failed with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`
(`next`/`eslint-config-next` 16.3.8, 6 days old): Dependabot's updater re-resolves the
whole tree, and security updates skip `cooldown`, so they would always fail. The
setting is removed; the Dependabot `cooldown` is the release-age delay.
`blockExoticSubdeps`/`trustPolicy` stay. `ci` on `eadf92f` failed its coverage gate (`apps/api/src/lib/` 94.48% < 94.77%): the
signature gate left the post-decode allowlist throw uncovered — a test now reaches it.

## Validation

Scratch-copy emulation of a Dependabot bump fails with the setting, passes without it;
frozen install; image-processing 10/10, file at 100%; api tsc/eslint; Prettier.
