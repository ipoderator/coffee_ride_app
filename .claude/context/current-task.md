# Current task

**CR-134 — CI/production-build P0: Turbo test env + production Docker smoke test**

Status: complete, committed and pushed via `/commit-push`. CR-133 was committed in `765129a`.

## Goal

Make `pnpm test` (and CI) actually receive `TEST_DATABASE_URL`. Add a Docker
production smoke test that catches web → api proxy misrouting.

## Requirements / acceptance criteria

- [x] `turbo.json` `test` env passes `TEST_DATABASE_URL` through without
      replacing `DATABASE_URL` (KI-050). Also passes `RUN_LIVE_S3_TESTS`,
      which was stripped the same way.
- [x] Smoke test builds the API and Web images and runs them on one Docker
      network.
- [x] API publishes no host port, and the test asserts it.
- [x] `GET /api/v1/rides` through Web returns 200. The test also checks for an
      `{ items }` body, so a non-API 200 can't pass.
- [x] Fix the bug the smoke test guards against: web proxied to
      `localhost:4000` because Next bakes rewrites at build time.
      `API_INTERNAL_URL` is now a required build arg.
- [x] The smoke test runs in CI as the `docker-smoke` job.

## Files

`turbo.json`, `package.json`, `.github/workflows/ci.yml`, `apps/web/Dockerfile`,
`apps/web/next.config.ts`, `docker-compose.prod.yml`,
`deploy/smoke/{run.sh,docker-compose.smoke.yml,smoke.env}`,
`docs/deployment.md`, context/docs updates.

## Validation

- `pnpm test` with `TEST_DATABASE_URL` exported: 5/5 tasks (api 438 passed /
  4 skipped).
- Smoke test before the fix: FAIL (500, `Failed to proxy
http://localhost:4000/v1/rides`). After the fix: OK (`200
{"items":[],"nextCursor":null}`). Teardown leaves nothing behind.
- A web build without `API_INTERNAL_URL` fails with a clear message.
- `format:check`, `lint:root` and web typecheck are clean.

## Discovered issues

- Docker Hub's blob CDN (`production.cloudfront.docker.com`) doesn't resolve
  from Docker Desktop's VM on this machine. Workaround: pull from
  `mirror.gcr.io` and retag (archived KI-043).
- The CI jobs have not run on real GitHub Actions yet.
