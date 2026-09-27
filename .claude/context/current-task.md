# Current task

**CR-140 — Replace MinIO with SeaweedFS for local dev + CI S3 (KI-068)**

Status: committed and pushed. Awaiting the first GitHub `ci` run.

## Goal

Get the `ci` job running again. Every `main` run since 2026-09-19 failed before checkout:
until ~2026-09-24 the MinIO `services:` container never became healthy (GitHub
`services:` can't pass `server /data`, so the image's bare `minio` CMD never serves),
and since ~2026-09-26 the image itself is gone (`quay.io/minio/minio` and
`docker.io/minio/minio` both 401 anonymously). Owner decision 2026-09-27: SeaweedFS
everywhere (CI, load-test workflow, local `docker-compose.yml`).

## Requirements / acceptance criteria

- [x] `ci.yml` + `load-test.yml`: `minio` service → `ghcr.io/chrislusf/seaweedfs:4.47`
      (default CMD `mini -dir=/data` serves S3 on 8333, credentials from
      `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`), healthcheck on `/healthz`; bucket
      step unchanged (`aws s3 mb`). App env (`S3_*`) unchanged.
- [x] `docker-compose.yml`: `minio`/`minio-init` → `s3`/`s3-init` (same image, same
      host port 9000, `weed shell` `s3.bucket.create`), new `s3_data` volume.
- [x] Existing dev objects (6, 0.3 MB in `coffee-ride`) copied from MinIO to the new
      service; `/health` reports `s3: ok`.
- [x] Docs/rules/skills/README references updated; ADR-025 appended (amends ADR-005's
      "Local MinIO").
- [x] Live S3 suites pass against the new compose service.
- [x] KI-068 updated (closes once a GitHub `ci` run gets past service start — pending push).

## Evidence gathered

- Registry check (anonymous manifests): quay/hub `minio/minio` 401; `bitnami/minio` 404;
  `bitnamilegacy/minio` 200 (frozen); `chrislusf/seaweedfs` 200 on Docker Hub and ghcr.io.
- This machine can't pull Docker Hub blobs (`production.cloudfront.docker.com` doesn't
  resolve); ghcr.io works → pin ghcr.io in both compose and CI.
- SeaweedFS 4.47 (native binary and container): anonymous `/` → 403, `/healthz` → 200,
  `route-storage.live` + `file-storage.live` 3/3 pass, object survives a restart,
  `s3.bucket.create` is idempotent (exit 0 on existing bucket).

## Progress

(see checkboxes)

## Validation results

- Compose `s3`: live S3 + degraded-dependencies + health tests 9/9; dev `/health` → `s3: ok`;
  migrated GPX downloaded through the API byte-for-byte; `s3-init` re-run idempotent.
- `pnpm format:check`, `pnpm lint:root`, api typecheck, `env.test.ts` 11/11, workflow YAML parses.
- Not run: Playwright upload specs locally (would reuse the running dev servers/DB), GitHub `ci`.

## Discovered issues

- Main has been red for 9 days / ~20 pushes: nothing since CR-080 was checked by CI.

## Final result

Committed. Dev objects backed up at `packages/db/backups/minio-coffee-ride-20260927/`;
old `coffeeride_minio_data` volume untouched. Next: push, triage first `ci` run.
