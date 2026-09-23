// CR-110. `packages/ui`'s `tokens.css` has carried a full `.dark` palette
// since CR-063, and `app/layout.tsx` has applied it from
// `prefers-color-scheme` since — but with no way for a viewer to override
// that. `docs/design.md` §3 calls dark theme "not optional or later" for an
// app used before dawn and after dusk; the same reasoning applies to a rider
// who wants the dark palette on a bright phone screen regardless of what the
// OS is set to.

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** Read by the pre-hydration script in `app/layout.tsx` too — exported so the
 * two cannot drift apart into different keys. */
export const THEME_STORAGE_KEY = 'coffee-ride-theme';

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === 'string' &&
    (THEME_PREFERENCES as readonly string[]).includes(value)
  );
}

/**
 * Applies a preference to the document. `system` removes the override and
 * falls back to `prefers-color-scheme`, which is why this reads the media
 * query rather than just clearing the class.
 *
 * Every `localStorage` access is guarded: it throws outright in a private
 * window with site data blocked, and a theme control is not worth taking the
 * page down over.
 */
export function applyTheme(preference: ThemePreference): void {
  const prefersDark =
    preference === 'dark' ||
    (preference === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  document.documentElement.classList.toggle('dark', prefersDark);

  try {
    if (preference === 'system') {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // Storage unavailable — the class above still applied, so the choice
    // holds for this page view and simply does not survive a reload.
  }
}

export function readStoredTheme(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

/**
 * The pre-hydration script `app/layout.tsx` injects. Runs from the initial
 * HTML, before paint, so the stored theme is already applied on first frame —
 * without it a viewer who chose dark would get a flash of light on every
 * navigation to a fresh document.
 */
export const THEME_INIT_SCRIPT = `
  try {
    var stored = window.localStorage.getItem('${THEME_STORAGE_KEY}');
    var dark = stored === 'dark' ||
      (stored !== 'light' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
`;
