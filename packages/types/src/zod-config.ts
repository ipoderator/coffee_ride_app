import { z } from 'zod';

// QA live audit 2026-10-08, item 8: the web pages' CSP has no `'unsafe-eval'`.
// Zod 4 probes for it with `Function("")` the first time a schema parses and
// falls back on its own when that throws — but the probe still fires a CSP
// violation on every page. In a browser, skip the probe and the JIT; `apps/api`
// (Node, no CSP) keeps both.
// `globalThis` lookup: this package's tsconfig has no DOM types.
if ('document' in globalThis) z.config({ jitless: true });
