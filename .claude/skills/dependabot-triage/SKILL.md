---
name: dependabot-triage
description: Use when Dependabot PRs/branches have piled up or one needs a decision — "разбери dependabot", "обнови зависимости", "что с PR от dependabot", a security advisory on a dependency. Groups the open updates by risk, merges safe ones after green CI, and routes majors (Next, Node, Postgres, TypeScript) to their own planned task/ADR instead of merging them blind.
---

# Dependabot triage

Read first: `.claude/rules/security.md` → "Dependencies", `.github/dependabot.yml`
(grouping and the `ignore` rules with their KI/PR reasons). Merging a PR is an
outward-facing action: present the plan and get the owner's go-ahead before merging.

## Steps

1. **Inventory:** `gh pr list --author app/dependabot --json number,title,headRefName,statusCheckRollup,createdAt`
   and `gh api /repos/{owner}/{repo}/dependabot/alerts --jq '.[] | select(.state=="open")'`
   (security alerts first). Stale remote branches without a PR are noise — list them.
2. **Classify** each update:

| Class                   | Examples                                                                 | Action                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Security fix            | any with an open alert                                                   | first; patch even if a minor bump                                                                                                        |
| Grouped dev minor/patch | `dev-dependencies-*`                                                     | merge when CI is green                                                                                                                   |
| GitHub Actions major    | `actions/checkout`, `setup-node`, `upload-artifact`, `pnpm/action-setup` | read the release notes for breaking inputs; CI green → merge                                                                             |
| Runtime/framework major | Next 16, Node 25/26 images, Postgres 18, TypeScript major                | **don't merge** — a planned CR (+ ADR if it changes the stack, `adr` skill); Node must stay on the LTS pinned in `packageManager`/CR-067 |
| Infra image             | SeaweedFS (ADR-025), Caddy, Redis                                        | check compose + `pnpm smoke:docker`; data-format changes → planned CR                                                                    |

3. **Red CI on a Dependabot PR** → `ci-triage`. Don't fix a major's fallout inside the
   bump PR unless it's trivial; otherwise close it with a pointer to the planned CR
   and, if it will keep reappearing, add an `ignore` entry with the reason (KI/PR #)
   like the existing `eslint-config-next` one.
4. **Merge** approved ones one at a time (`gh pr merge <n> --squash`), letting CI run
   between them when they touch the same lockfile; rebase the rest
   (`@dependabot rebase` comment).
5. Record: a changelog entry (`close-task`) listing merged/deferred updates; a
   deferred major with real risk → `known-issue`.
