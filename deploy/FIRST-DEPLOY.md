# First deploy — verification checklist

The procedure lives in `docs/deployment.md`; this file is the checklist that goes with
the **first** real run of it (CR-210, KI-045). Its reason to exist is that this
repository's deployment artifacts are in two very different states of confidence, and
the procedure document reads the same either way:

- **Smoke-proven** — exercised on every CI run by `deploy/smoke/run.sh` (job
  `docker-smoke`): the images build, migrations apply, `api` starts with no published
  host port, `web` reaches `api` by service name, and the rate limiter sees real client
  addresses through the proxy hop.
- **Never executed** — needs a real host with real public DNS, so no sandbox or CI run
  could ever have covered it: Caddy's config at runtime, ACME/TLS issuance, the
  Caddy → web hop, and the `backup` service.

Work top to bottom. Each step says what to run and what counts as a pass. Nothing here
is optional on a first deploy — the point of the list is that the never-executed parts
get looked at deliberately instead of being assumed to work because the YAML parses.

## 0. Before touching the host

- [ ] `pnpm preflight --env /path/to/your/production.env`

  Reports two tiers (`apps/api/scripts/preflight.ts`). An **ERROR** means `apps/api`
  would refuse to boot — a required value is missing, malformed, or still a local-dev
  placeholder; fix it before going further. A **WARNING** means the configuration boots
  but a user-facing feature is non-functional. Warnings do not block the deploy, and
  they exit 0, but each one is a deliberate choice you are making — read them.

  Expected warnings at launch, if you have not resolved these yet:

  - `EMAIL_FROM_ADDRESS` empty → email verification and password reset are dead ends for
    real users (KI-026, KI-042). The screens exist; the link never arrives. If you intend
    real users to sign up, resolve this **before** the first deploy, not after.
  - `ERROR_REPORTING_WEBHOOK_URL` empty → accepted for launch per ADR-030, provided the
    host retains container logs (step 6).

- [ ] DNS `A`/`AAAA` for `DOMAIN` already resolves to this host, verified from somewhere
      other than the host itself: `dig +short <DOMAIN>`

  Caddy attempts ACME on first request to a hostname it has no certificate for. A record
  that does not resolve yet, or resolves elsewhere, produces a failed challenge and a
  rate-limited retry at Let's Encrypt — not an error message on the deploy command.

- [ ] Postgres, and (if configured) Redis and the S3 store, are reachable **from this
      host** — not just "provisioned". `docker-compose.prod.yml` starts none of them
      (ADR-018).

## 1. Migrate before serving traffic

- [ ] `docker compose -f docker-compose.prod.yml --profile migrate run --rm migrate`

  Pass: exits 0. Smoke-proven — this exact service builds and applies migrations in CI.
  Run it before `up`, every time the release adds migrations, and never rely on
  application boot to apply them (CR-076).

## 2. Start

- [ ] `docker compose -f docker-compose.prod.yml up -d --build`
- [ ] `docker compose -f docker-compose.prod.yml ps` — `caddy`, `web`, `api`, `backup`
      all `running`.

  Partly smoke-proven: `api`/`web`/`migrate` are covered, `caddy` and `backup` are not
  started in the smoke run at all.

## 3. Caddy and TLS — never executed before this moment

This is the section with no prior evidence behind it. `deploy/Caddyfile` passes
`caddy validate` (CR-145) and proxies to `web` only, never directly to `api` (ADR-018),
but no run has ever obtained a certificate or served a request through it.

- [ ] `docker compose -f docker-compose.prod.yml logs caddy` — a certificate was
      actually **obtained**, not merely attempted. Look for the issuance line; a started
      container is not evidence.
- [ ] `curl -sI https://<DOMAIN>/` returns `200` over a valid certificate (no
      `-k`/`--insecure`: using it here would hide exactly what this step checks).
- [ ] `curl -s https://<DOMAIN>/` serves `apps/web`, not a Caddy default page.
- [ ] A ride page loads end to end in a real browser, so the Caddy → web → api chain is
      exercised by a real request and not just by `curl` against the shell.

  If issuance fails, stop here rather than retrying in a loop — Let's Encrypt rate-limits
  failed challenges per hostname, and repeated attempts make the next hour worse, not
  better.

## 4. The API, from inside the network

`api` publishes no host port by design, so it is checked from inside the Compose network
rather than from outside.

- [ ] `docker compose -f docker-compose.prod.yml exec web wget -qO- http://api:4000/health`

  Read the JSON body, not the status: `GET /health` always answers `200`, and each
  dependency reports `ok` / `error` / `not_configured` separately (CR-051). A dependency
  you deliberately left unconfigured must read `not_configured`; one reading `error` is a
  real failure even though the status is `200`.

- [ ] Every dependency's state matches what step 0's preflight told you to expect. A
      dependency you configured but which reports `not_configured` means the value never
      reached the container — check `docker compose -f docker-compose.prod.yml config`.

## 5. The one flow that cannot be verified by any check above

- [ ] Register a real account against the deployed site, with a real mailbox, and
      complete email verification by clicking the link that arrives.

  This is the one path that nothing in CI, no smoke run and no health check covers,
  because it depends on a verified Unisender Go sender and on DNS reachability to the
  vendor (KI-055). If step 0 warned about `EMAIL_FROM_ADDRESS`, this check fails by
  construction — and so does password reset, for every real user.

- [ ] Request a password reset for that same account and complete it from the emailed
      link.

## 6. Logs and backups — the parts with no automated proof

- [ ] `docker compose -f docker-compose.prod.yml logs -f api` emits structured JSON with
      a `reqId` on each request (CR-079), and the same id appears as the `X-Request-Id`
      response header.
- [ ] The host retains or ships these logs somewhere. With
      `ERROR_REPORTING_WEBHOOK_URL` unset (ADR-030), container stdout is the **only**
      record of an unexpected 500 or a failed notification job — and it dies with the
      container.
- [ ] The `backup` service has actually produced a backup file, and
      `packages/db/scripts/restore.sh` has been run once against a throwaway database
      from that file. Never executed in any session: a backup that has never been
      restored is not a backup.

## After the first successful run

Update KI-045 in `.claude/context/known-issues.md` with what this run actually proved —
particularly Caddy/ACME and `backup`, the two items that have never had evidence behind
them. If everything in this file passed, KI-045 can be closed; if a step failed, record
what failed there rather than leaving the issue's text as-is.
