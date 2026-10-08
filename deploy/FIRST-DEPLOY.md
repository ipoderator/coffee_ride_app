# First deploy — verification checklist

The procedure lives in `docs/deployment.md`; this file is the checklist that goes with
the **first** real run of it (CR-210, KI-045). Its reason to exist is that this
repository's deployment artifacts are in two very different states of confidence, and
the procedure document reads the same either way:

- **Smoke-proven** — exercised on every CI run by `deploy/smoke/run.sh` (job
  `docker-smoke`), which layers the same `docker-compose.infra.yml` overlay the server
  uses (ADR-031): the images build, Postgres/Redis/S3 start healthy, the bucket is
  created, migrations apply, `api` starts with no published host port and reports
  `db`/`redis`/`s3` all `ok`, `web` reaches `api` by service name, the rate limiter sees
  real client addresses through the proxy hop, and a `backup` dump restores into a fresh
  database.
- **Never executed** — needs a real host with real public DNS, so no sandbox or CI run
  could ever have covered it: Caddy's config at runtime, ACME/TLS issuance, the
  Caddy → web hop, and the `backup` service's own interval loop on a long-running host.

Below, `dc` means
`docker compose -f docker-compose.prod.yml -f docker-compose.infra.yml` (as in
`docs/deployment.md`), run from the checkout.

Work top to bottom. Each step says what to run and what counts as a pass. Nothing here
is optional on a first deploy — the point of the list is that the never-executed parts
get looked at deliberately instead of being assumed to work because the YAML parses.

## 0. Before touching the host

- [ ] `.env` in the checkout is filled from `deploy/production.env.example`, and
      `pnpm preflight --env /path/to/your/production.env` passes (fill in the three URL
      lines as the overlay would derive them — preflight reads the file, not the overlay).

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

- [ ] The host has enough disk for Postgres, the S3 store and 14 days of dumps on one
      volume set (ADR-031: one host is one failure domain), and ports 80/443 are open.

## 1–2. Deploy

- [ ] `deploy/deploy.sh`

  Pass: exits 0. It builds the images, starts Postgres/Redis/S3 and waits for them to be
  healthy, ensures the bucket, applies migrations before the application starts (never
  on application boot, CR-076), then starts everything and prints `dc ps`. Every step but
  the last is smoke-proven.

- [ ] `dc ps` — `postgres`, `redis`, `s3` `healthy`; `caddy`, `web`, `api`, `backup`
      `running`. `caddy` is not started in the smoke run at all.
- [ ] Read any `Configuration warnings from api` the script printed — they must match
      step 0's preflight warnings and nothing else.

## 3. Caddy and TLS — never executed before this moment

This is the section with no prior evidence behind it. `deploy/Caddyfile` passes
`caddy validate` (CR-145) and proxies to `web` only, never directly to `api` (ADR-018),
but no run has ever obtained a certificate or served a request through it.

- [ ] `dc logs caddy` — a certificate was
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

- [ ] `dc exec web wget -qO- http://api:4000/health`

  Read the JSON body, not the status: `GET /health` always answers `200`, and each
  dependency reports `ok` / `error` / `not_configured` separately (CR-051). With the infra
  overlay all three are configured, so `db`, `redis` and `s3` must each read `ok`; one
  reading `error` is a real failure even though the status is `200`, and one reading
  `not_configured` means the value never reached the container — check `dc config`.

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

- [ ] `dc logs -f api` emits structured JSON with
      a `reqId` on each request (CR-079), and the same id appears as the `X-Request-Id`
      response header.
- [ ] The host retains or ships these logs somewhere. With
      `ERROR_REPORTING_WEBHOOK_URL` unset (ADR-030), container stdout is the **only**
      record of an unexpected 500 or a failed notification job — and it dies with the
      container.
- [ ] The `backup` service has actually produced a dump on this host:
      `dc exec backup ls -l /backups`. The dump → restore round trip itself is
      smoke-proven (CI restores a fresh dump into an empty database on every run); what
      is not is this host's loop and disk.
- [ ] Off-host copy is set up (`docs/deployment.md` → "Backups"): the dumps and the
      `s3_data` volume live on the same disk as the data they protect (ADR-031).

## After the first successful run

Update KI-045 in `.claude/context/known-issues.md` with what this run actually proved —
particularly Caddy/ACME, the one part that has never had evidence behind it. If everything in this file passed, KI-045 can be closed; if a step failed, record
what failed there rather than leaving the issue's text as-is.
