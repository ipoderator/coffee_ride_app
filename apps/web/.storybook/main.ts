import type { StorybookConfig } from '@storybook/nextjs-vite';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// CR-158: Storybook lives in apps/web, not packages/ui — packages/ui ships raw
// TSX with no CSS build of its own; its Tailwind classes only exist once
// apps/web's `globals.css` (`@source` over packages/ui) compiles them. The
// ride components (card, status pill, filter chips) are apps/web feature
// modules anyway.

/** Absolute package path — needed for addon resolution in a pnpm monorepo. */
function getAbsolutePath(value: string): string {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [
    getAbsolutePath('@storybook/addon-vitest'),
    getAbsolutePath('@storybook/addon-a11y'),
    getAbsolutePath('@storybook/addon-docs'),
    getAbsolutePath('@storybook/addon-mcp'),
  ],
  framework: getAbsolutePath('@storybook/nextjs-vite'),
  staticDirs: ['../public'],
  features: {
    // Component manifest (props, stories, docs) served to `@storybook/addon-mcp`.
    componentsManifest: true,
  },
};

export default config;
