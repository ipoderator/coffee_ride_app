import { readdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';

// CR-212. e2e serves the app with `next dev` (`playwright.config.ts`), which
// compiles each route on its first request. Under Next 16 (webpack) that
// compile, landing while a browser is already on the page, ends in a full
// page reload: `[Fast Refresh] rebuilding` → a fresh document → `[HMR]
// connected`, and the page restarts from `CabinetShell`'s session skeleton.
// On a cold CI runner the reload landed mid-journey — a click lost, a heading
// never shown — and `critical-journeys.spec.ts`'s organizer journey failed
// every retry (traces of run 37421468828), while a warm local `.next` hid it.
// Requesting every route once, before any browser connects, does the
// compiling up front; `next.config.ts`'s `onDemandEntries` keeps the result
// for the whole run.
//
// Routes come from `src/app` itself, so a new page is warmed without a list
// to keep in step. Dynamic segments get a placeholder id: the page compiles
// either way, and nothing it fetches with that id matters here.

const APP_DIR = resolve(__dirname, '../src/app');
const PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000000';

function appRoutes(): string[] {
  return readdirSync(APP_DIR, { recursive: true, encoding: 'utf8' })
    .filter((file) => file === 'page.tsx' || file.endsWith(`${sep}page.tsx`))
    .map((file) => {
      const segments = file
        .split(sep)
        .slice(0, -1)
        .filter((segment) => !/^\(.+\)$/.test(segment))
        .map((segment) =>
          /^\[.+\]$/.test(segment) ? PLACEHOLDER_ID : segment,
        );
      return `/${segments.join('/')}`;
    });
}

export default async function warmup() {
  const baseUrl = `http://localhost:${process.env.E2E_WEB_PORT ?? '3000'}`;
  for (const route of appRoutes()) {
    const response = await fetch(`${baseUrl}${route}`, { redirect: 'manual' });
    await response.arrayBuffer();
  }
}
