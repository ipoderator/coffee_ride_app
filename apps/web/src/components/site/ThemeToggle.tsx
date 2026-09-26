'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { cn, NavMenu, NAV_MENU_ITEM_CLASSNAME, THEME_TERMS } from 'ui';
import {
  applyTheme,
  readStoredTheme,
  THEME_PREFERENCES,
  type ThemePreference,
} from '@/lib/theme/theme';

const ICONS: Record<ThemePreference, ReactNode> = {
  system: <Monitor className="h-4 w-4" aria-hidden="true" />,
  light: <Sun className="h-4 w-4" aria-hidden="true" />,
  dark: <Moon className="h-4 w-4" aria-hidden="true" />,
};

const LABELS: Record<ThemePreference, string> = {
  system: THEME_TERMS.system,
  light: THEME_TERMS.light,
  dark: THEME_TERMS.dark,
};

/**
 * CR-110: the light/dark/system control in the global header. Three states
 * rather than a two-way switch, so choosing a theme does not permanently throw
 * away the "follow the OS" behavior `docs/design.md` §3 asks for.
 *
 * The stored preference is applied before paint by `app/layout.tsx`'s
 * pre-hydration script; this component only reads it back to show which option
 * is current, and that read has to happen in an effect — `localStorage` does
 * not exist during the server render, and seeding state from it directly would
 * make the server and client markup disagree.
 *
 * CR-132: split into a hook and the option list so the organizer header's
 * account menu can list the same three options inline instead of nesting a
 * second menu inside its own.
 */
export function useThemePreference(): [
  ThemePreference,
  (next: ThemePreference) => void,
] {
  const [preference, setPreference] = useState<ThemePreference>('system');

  useEffect(() => {
    setPreference(readStoredTheme());
  }, []);

  // A viewer on `system` should follow the OS switching mid-session, not stay
  // on whatever it was when the page loaded.
  useEffect(() => {
    if (preference !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyTheme('system');
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, [preference]);

  function choose(next: ThemePreference) {
    setPreference(next);
    applyTheme(next);
  }

  return [preference, choose];
}

/** The three theme options as `role="menuitem"` buttons, for any `NavMenu`. */
export function ThemeMenuItems({
  preference,
  onChoose,
}: {
  preference: ThemePreference;
  onChoose: (next: ThemePreference) => void;
}) {
  return (
    <>
      {THEME_PREFERENCES.map((option) => (
        <button
          key={option}
          type="button"
          role="menuitem"
          aria-current={option === preference ? 'true' : undefined}
          onClick={() => onChoose(option)}
          className={cn(
            NAV_MENU_ITEM_CLASSNAME,
            option === preference && 'bg-surface text-text',
          )}
        >
          {ICONS[option]}
          {LABELS[option]}
        </button>
      ))}
    </>
  );
}

export function ThemeToggle() {
  const [preference, choose] = useThemePreference();

  return (
    <NavMenu label={THEME_TERMS.menuLabel} icon={ICONS[preference]} labelHidden>
      <ThemeMenuItems preference={preference} onChoose={choose} />
    </NavMenu>
  );
}
