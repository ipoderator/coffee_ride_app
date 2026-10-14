# Vendored: Lictor security suite

The four `lictor-*` skills in `.claude/skills/` (`lictor-security-check`,
`lictor-explain`, `lictor-fix-it`, `lictor-rotate`) are an unmodified copy of the
Lictor AI security suite.

- Source: https://github.com/Raffa-jarrl/Lictor-AI,
  `skills/plugins/lictor-security-suite/skills/`
- Pinned commit: `cfe8c00130ea972b66af23af7042bc8f503b4092` (2026-07-08), plugin
  version 0.1.0
- License: Apache-2.0 (`LICENSE` next to this file). Upstream NOTICE: "Lictor AI,
  Copyright 2026 Lictor AI. This product includes software developed at Lictor AI
  (https://lictor-ai.com)."
- Not copied: `lictor-security-check/benchmark/` — a scoring harness plus an OWASP
  Benchmark corpus under GPL-2.0; not used by the skill. README links into it are
  dead here on purpose.

Vendored rather than installed as a plugin so the instructions an agent follows are
pinned and reviewed: the plugin route tracks upstream `main` unpinned. The files are
kept byte-identical to upstream (excluded from Prettier in `.prettierignore`) so an
update is a plain diff. Project rules override the skills — see "Skill routing" in
`.claude/CLAUDE.md`.

## Updating

1. Clone upstream into a scratch directory and read the diff against the pinned commit
   (`git diff cfe8c00 HEAD -- skills/plugins/lictor-security-suite/skills`) — these are
   instructions an agent executes; review them before they land.
2. Copy the four skill directories over, again without `benchmark/`.
3. Bump the pinned commit above and record the update in `docs/changelog.md`.
