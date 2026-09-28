// mockup-to-screen: screenshots key pages at 390/1440/320 against the running dev
// stack (web :3000, api :4000) and prints scrollWidth/innerWidth plus any text
// under 12px. Run from apps/web so @playwright/test resolves:
//   cp ../../.claude/skills/mockup-to-screen/shots.mjs ./.shots.tmp.mjs &&
//   node ./.shots.tmp.mjs <out-dir>; rm ./.shots.tmp.mjs
import { chromium } from '@playwright/test';
const out = process.argv[2];
const b = await chromium.launch();
const pages = [
  ['home', '/'],
  ['login', '/login'],
  ['map', '/?view=map'],
];
const r = await fetch('http://localhost:4000/v1/rides?limit=1')
  .then((r) => r.json())
  .catch(() => null);
if (r?.items?.[0]) pages.push(['ride', '/rides/' + r.items[0].id]);
for (const [w, h] of [
  [390, 844],
  [1440, 900],
  [320, 700],
]) {
  const ctx = await b.newContext({
    viewport: { width: w, height: h },
    colorScheme: 'dark',
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  for (const [n, u] of pages) {
    await p
      .goto('http://localhost:3000' + u, { waitUntil: 'networkidle' })
      .catch(() => {});
    await p.waitForTimeout(800);
    const sw = await p.evaluate(() => [
      document.documentElement.scrollWidth,
      innerWidth,
    ]);
    const small = await p.evaluate(() => {
      const s = new Set();
      for (const el of document.querySelectorAll('body *')) {
        if (!el.childNodes.length) continue;
        const t = [...el.childNodes].some(
          (c) => c.nodeType === 3 && c.textContent.trim(),
        );
        if (!t) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 12 && el.getClientRects().length)
          s.add(
            el.tagName + ':' + fs + ':' + el.textContent.trim().slice(0, 20),
          );
      }
      return [...s].slice(0, 8);
    });
    console.log(
      w,
      n,
      'scroll',
      sw.join('/'),
      'small',
      JSON.stringify(small),
      errs.splice(0).join('|'),
    );
    await p.screenshot({ path: `${out}/${n}-${w}.png`, fullPage: n !== 'map' });
  }
  await ctx.close();
}
await b.close();
