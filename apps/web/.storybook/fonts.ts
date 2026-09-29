import localFont from 'next/font/local';

// The same self-hosted faces `src/app/layout.tsx` loads (CR-146) — stories
// render outside the root layout, so without these every component would
// fall back to system fonts. Keep in sync with layout.tsx: a face added there
// belongs here too.
const golosText = localFont({
  src: [
    {
      path: '../src/fonts/GolosText-400.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../src/fonts/GolosText-500.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../src/fonts/GolosText-600.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../src/fonts/GolosText-800.woff2',
      weight: '800',
      style: 'normal',
    },
  ],
  variable: '--font-golos',
  display: 'swap',
});

const ibmPlexMono = localFont({
  src: [
    {
      path: '../src/fonts/IBMPlexMono-400.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../src/fonts/IBMPlexMono-500.woff2',
      weight: '500',
      style: 'normal',
    },
  ],
  variable: '--font-plex-mono',
  display: 'swap',
});

const unbounded = localFont({
  src: [
    {
      path: '../src/fonts/Unbounded-500.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../src/fonts/Unbounded-600.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../src/fonts/Unbounded-700.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-unbounded',
  display: 'swap',
});

const sofiaSansExtraCondensed = localFont({
  src: [
    {
      path: '../src/fonts/SofiaSansExtraCondensed-700.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../src/fonts/SofiaSansExtraCondensed-800.woff2',
      weight: '800',
      style: 'normal',
    },
  ],
  variable: '--font-sofia-extra-condensed',
  display: 'swap',
});

/** The classes layout.tsx puts on `<html>`: they bind the CSS variables
 * `tokens.css` reads as `--font-sans`/`--font-mono`/`--font-title`/`--font-num`. */
export const FONT_VARIABLE_CLASSES = [
  golosText.variable,
  ibmPlexMono.variable,
  unbounded.variable,
  sofiaSansExtraCondensed.variable,
];
