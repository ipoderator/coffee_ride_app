import type { Metadata } from 'next';
import { Golos_Text, IBM_Plex_Mono } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

// `docs/design.md` "Dark theme": "not optional or later." `packages/ui/src/
// tokens.css` defines the `.dark` token set but nothing ever applied the
// class — this is that activation. `beforeInteractive` runs from the initial
// HTML, before hydration/paint, so the correct theme is there on first paint
// (no flash of the wrong theme). No manual toggle: design.md only requires
// the theme to exist and respond to the system preference, not a switch.
const THEME_INIT_SCRIPT = `
  try {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
`;

// docs/design.md §4: Golos Text (Cyrillic-first grotesque) for UI text, IBM
// Plex Mono for tabular/data text (hex values, IDs). Both bundle a
// `cyrillic`/`cyrillic-ext` subset (verified against next/font's Google Fonts
// metadata before adopting — CR-063). `variable` binds the loaded webfont to
// the CSS custom property packages/ui's tokens.css reads as its `--font-sans`/
// `--font-mono` source (see tokens.css's `var(--font-golos, ...)` fallback).
const golosText = Golos_Text({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-golos',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Coffee Ride',
  description:
    'Платформа для поиска, организации и участия в групповых велозаездах.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${golosText.variable} ${ibmPlexMono.variable}`}>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body>
        {/* docs/design.md §11: "xl (>= 1280): max content width 1200px, centered" —
            one shared cap here rather than repeated per-page, per
            `.claude/context/current-task.md`'s CR-044 finding. Every page's own
            (narrower) container still applies inside it; this only bounds the
            widest screens/layouts (cabinet side nav, discovery split view). */}
        <div className="mx-auto w-full xl:max-w-300">{children}</div>
      </body>
    </html>
  );
}
