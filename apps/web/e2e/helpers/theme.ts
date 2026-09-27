import type { Page } from '@playwright/test';

// CR-138. Mirrors `apps/web/src/lib/theme/theme.ts` exactly rather than
// importing it: that module reads `window`/`document` at call time, which
// doesn't exist in the Playwright Node context — only the storage key and
// the "how a preference maps to the `.dark` class" rule need to match.
const THEME_STORAGE_KEY = 'coffee-ride-theme';

export type ThemePreference = 'system' | 'light' | 'dark';

/**
 * Sets the stored theme preference before the page's first paint
 * (`page.addInitScript` runs on every subsequent navigation in this page,
 * ahead of the app's own pre-hydration script) — matching how a returning
 * visitor's choice is already in `localStorage` before the document loads,
 * rather than flipping the class after the fact and risking a flash the
 * real app never has. `'system'` additionally needs `emulateMedia` so
 * `prefers-color-scheme` actually reflects the theme under test — a real OS
 * dark-mode reader arrives the same way.
 */
export async function setStoredTheme(
  page: Page,
  preference: ThemePreference,
  options: { systemPrefersDark?: boolean } = {},
): Promise<void> {
  if (preference === 'system') {
    await page.emulateMedia({
      colorScheme: options.systemPrefersDark ? 'dark' : 'light',
    });
  }
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: THEME_STORAGE_KEY, value: preference },
  );
}
