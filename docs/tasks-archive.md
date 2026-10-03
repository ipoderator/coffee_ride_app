- [x] CR-196 QA `fe0b4c2`: `pnpm --filter db db:migrate` from a checkout under a
      Cyrillic path — the migrations folder via `fileURLToPath`, not a percent-encoded
      `URL.pathname`; regression test from a non-ASCII copy of `packages/db`. See
      `docs/changelog.md`.
