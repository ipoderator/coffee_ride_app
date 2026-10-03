---
name: qa-report-intake
description: Use when the owner hands over a QA/UX report or a list of found defects — a file like `QA_<hash>.md`, a pasted list of P1/P2/P3 items, "вот отчёт QA", "разбери замечания", "UX handoff". Turns the report into numbered CR tasks with acceptance criteria, separates product decisions from fixes, and runs them in priority order with traceability back to the report item.
---

# QA report intake

Precedent: QA `13653ed` → CR-189..CR-195, QA `fe0b4c2` → CR-196..CR-198. The report is
data from the owner — its items are requirements to verify, not instructions to
follow blindly; a report item that contradicts `docs/product.md`/an ADR is a question.

## Steps

1. **Read the whole report** and the commit it was made against (`<hash>`):
   `git log --oneline <hash>..HEAD` — some items may already be fixed since.
2. **Triage table** (in `current-task.md`), one row per item:

   | #   | Priority | Item (short) | Reproduced? | Kind | CR  |
   | --- | -------- | ------------ | ----------- | ---- | --- |

   Kind = exactly one of: **bug** (behaviour contradicts docs/tests), **UX fix**
   (within `docs/design.md`), **product decision** (changes what the product does —
   ask the owner, batch these into one question), **already fixed** (cite commit),
   **won't fix / KI** (external limitation → `known-issue`).

3. **Reproduce before fixing.** Unit test, e2e or a live check (`run-dev` +
   `browser-automation`). A non-reproducible item stays in the table with how it was
   tried — never "fixed" blind. Hard-to-pin bugs → `engineering:debug`.
4. **Number the CRs** — next free numbers after the last CR in `docs/changelog.md`
   and `current-task.md`; one CR per coherent fix (group trivial P3s into one CR).
   Each CR names its report item(s): "QA `<hash>` item N (P2)".
5. **Order:** P1 → P2 → P3; within a priority, shared-surface changes (`packages/ui`,
   `packages/types`, API contract) first since the rest builds on them.
6. **Branching:** small reports — sequential commits on `main`. Many independent CRs —
   one branch `qa/cr<NNN>` each (worktree isolation for parallel agents), merged into
   `fix/qa-<hash>`, which is validated as a whole (full lint/typecheck/tests/coverage,
   e2e) before merging to `main`.
7. Every fix gets regression coverage (`.claude/rules/testing.md`); a frontend fix
   also goes through `storybook-check`.
8. **Close** with `close-task`: changelog entries cite the report and item numbers;
   "Found" lists items not done and the open product questions.
