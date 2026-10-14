# Current task — CR-252 — vendor the Lictor security-audit skills

Source: owner, 2026-10-14 ("внедри вот это в наш проект",
git@github.com:Raffa-jarrl/Lictor-AI.git). Branch `chore/lictor-security-skills`.

## Goal

Make the Lictor security suite (Claude Code skills: `lictor-security-check`,
`lictor-explain`, `lictor-fix-it`, `lictor-rotate`) available in this project.

## Requirements / acceptance

1. The four skills live in `.claude/skills/`, pinned to a reviewed upstream commit,
   with the Apache-2.0 license and provenance.
2. Nothing untrusted lands unread: every vendored file reviewed for hidden
   instructions, network calls, telemetry.
3. The audit report can't be committed to the public repo.
4. CI gates stay green (`format:check` in particular).
5. CLAUDE.md routes the skills and says where project rules override them.

## Investigation

- Upstream `cfe8c00` (2026-07-08), plugin 0.1.0: Markdown skills only; 48 check files,
  a report template. Only write: `./SECURITY-AUDIT.md`. No invisible Unicode, no
  agent-directed HTML comments; URLs are examples, vendor dashboards, lictor-ai.com.
- `benchmark/` holds a GPL-2.0 OWASP corpus + Python scorer — not part of the skill.
- Conflicts with project rules: English "friendly founder" voice (we reply in
  Russian), report in repo root (public repo), `lictor-fix-it` "don't run tests"
  (our loop requires validation) — resolved in CLAUDE.md routing, files untouched.

## Progress

- [x] vendor - [x] ignore rules - [x] routing - [x] validation - [x] close-task

## Validation results

- `prettier --check .` clean; without the ignore 56 vendored files would fail.
- `touch SECURITY-AUDIT.md` → not in `git status`.

## Final result

Done on `chore/lictor-security-skills`; PR into `main`.
