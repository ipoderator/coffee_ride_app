# Current task — CR-219 first production deploy to coffeeride.site — DONE

Source: owner, 2026-10-08 — "нужно залить проект на мой сервер и там его развернуть"
(server 72.56.110.108, domain coffeeride.site). Owner choices: commit + push, then
git clone on the server; keys from the dev `.env`.

## Steps done

- CR-217/218 committed as `1f741cf` and pushed; CI `ci` + `docker-smoke` green.
- `deploy/Caddyfile`: `www.{$DOMAIN}` → 301 to the bare domain (`c43ce63`);
  `caddy validate` on the server.
- Access: root SSH is disabled; `gleb` + key `~/.ssh/hermes-server`, passwordless
  sudo. fail2ban banned this machine after one failed key attempt (owner whitelisted).
- Server: cloned to `/opt/deployments/coffee-ride` (host convention, see
  `/opt/deployments/README.md`); `.env` (600, root) with generated hex secrets,
  2GIS demo + Unisender keys from the dev `.env`, `ACME_EMAIL=admin@coffeeride.site`,
  `EMAIL_FROM_ADDRESS` empty. Old Sept-27 verification stack in `/opt/coffee-ride`
  stopped (`down`, volumes kept). ufw: 80/tcp, 443/tcp, 443/udp opened.
- `deploy/deploy.sh` exit 0.

## Validation (FIRST-DEPLOY)

- §2: 7 services up; postgres/redis/s3 healthy. Warnings: email sender empty,
  error webhook empty (both expected).
- §3: Caddy "certificate obtained successfully" for coffeeride.site and www;
  `curl` without `-k`: `/` 200, www 301, http 308, `/api/v1/rides` 200.
  Headless browser: `/`, `/login` — 0 console errors, 0 failed requests.
- §4: `/health` db/redis/s3 `ok`.
- §6: `X-Request-Id` = api `reqId`; real client IP in api logs; first dump in
  `/backups`.
- Not done: §5 email flow (no verified sender); off-host backup copy.

## Final result

coffeeride.site live. KI-045 narrowed to §5 + off-host backups. Context closed
(changelog CR-219, tasks, project-state, deployment.md "Production host").
