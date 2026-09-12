# /test

Run validation for the current task.

Start narrow:

1. affected unit/integration tests;
2. affected E2E tests when applicable;
3. typecheck;
4. lint;
5. build when relevant.

If something fails:

- inspect the failure;
- identify root cause;
- fix it if it belongs to the task;
- rerun the failed check;
- rerun related checks.

Do not weaken tests or suppress errors merely to get green output.

Report exact commands and results.
