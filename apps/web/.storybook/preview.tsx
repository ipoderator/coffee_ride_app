import type { Decorator, Preview } from '@storybook/nextjs-vite';
import { FONT_VARIABLE_CLASSES } from './fonts';
import '../src/app/globals.css';

// CR-158. Themes: the app toggles `.dark` on `<html>` (`src/lib/theme/
// theme.ts`); `tokens.css` redefines its variables under `.dark` and maps
// them through `@theme inline`, so the class works on any wrapper element
// too — which is what `both` uses to show the two themes side by side.
export type StoryTheme = 'light' | 'dark' | 'both';

const withAppShell: Decorator = (Story, context) => {
  const theme = (context.globals.theme ?? 'light') as StoryTheme;
  const root = document.documentElement;
  // `lang="ru"` matters beyond a11y: Sofia Sans only draws Russian (not
  // Bulgarian) letterforms under it (layout.tsx).
  root.lang = 'ru';
  root.classList.add(...FONT_VARIABLE_CLASSES);
  root.classList.toggle('dark', theme === 'dark');

  // `parameters.shellPadding: false` for a story that brings its own page
  // padding (the discovery-list compositions).
  const pad = context.parameters.shellPadding === false ? '' : 'p-6';

  if (theme === 'both') {
    return (
      <div className="grid min-h-screen lg:grid-cols-2">
        <div data-story-theme="light" className={`bg-bg text-text ${pad}`}>
          <Story />
        </div>
        <div data-story-theme="dark" className={`dark bg-bg text-text ${pad}`}>
          <Story />
        </div>
      </div>
    );
  }

  return (
    <div
      data-story-theme={theme}
      className={`min-h-screen bg-bg text-text ${pad}`}
    >
      <Story />
    </div>
  );
};

const preview: Preview = {
  decorators: [withAppShell],
  globalTypes: {
    theme: {
      description: 'Тема оформления',
      toolbar: {
        title: 'Тема',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Светлая', icon: 'sun' },
          { value: 'dark', title: 'Тёмная', icon: 'moon' },
          { value: 'both', title: 'Обе рядом', icon: 'sidebyside' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'light',
  },
  parameters: {
    // The decorator paints the themed ground; Storybook's own padding would
    // leave an unthemed frame around it.
    layout: 'fullscreen',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // Axe violations fail the story's Vitest test (and show red in the
      // Accessibility panel) — WCAG 2.1 AA, docs/design.md §12.
      test: 'error',
      options: {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
        },
      },
    },
  },
};

export default preview;
