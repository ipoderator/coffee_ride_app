---
name: known-issue
description: Use when a problem must outlive the session or one is resolved — recording a blocker/stop condition, an external limitation (2GIS, email, Docker), deferred tech debt, a flaky check, or closing a KI ("заведи KI", "закрой KI-0NN", "это known issue"). Writes the entry in .claude/context/known-issues.md's house format, or moves a resolved one verbatim to known-issues-archive.md.
---

# Known issue

Files: `.claude/context/known-issues.md` (active risk only),
`.claude/context/known-issues-archive.md` (resolved, verbatim). Read the live file's
header ("Archiving") once; don't read the archive unless a KI number must be resolved.

## Open a KI

1. Check it isn't already there: `grep -n "<keyword>" .claude/context/known-issues.md`.
   If it is, update that entry instead.
2. Next number: highest `KI-NNN` across both files + 1
   (`grep -ho "KI-[0-9]\+" .claude/context/known-issues*.md | sort -t- -k2 -n | tail -1`).
3. Append under `## Open`:
   ```
   ### KI-NNN — <one-line problem>

   Status: open. Discovered: YYYY-MM-DD (CR-XXX).
   Problem: what happens, with file/line or command evidence.
   Impact: who/what it affects; severity.
   Workaround: what to do meanwhile, or "none".
   Next action: the concrete step that would close it, and who owns it (code / owner / external).
   ```
4. Reference the KI where the workaround lives (code comment, test skip reason,
   changelog "Follow-up").

## Resolve a KI

1. Change its `Status:` line to `resolved YYYY-MM-DD (CR-XXX)` plus one sentence of
   how; leave the rest untouched.
2. Move the whole entry verbatim to the bottom of `known-issues-archive.md` and
   delete it from the live file — in the same change, never as a later batch.
3. The _why_ goes in the CR's changelog entry (`close-task`).

An issue that turns out to be someone else's KI's duplicate: note
"duplicate of KI-MMM" and archive it the same way.
