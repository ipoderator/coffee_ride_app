import type { Metadata } from 'next';
import {
  Golos_Text,
  IBM_Plex_Mono,
  Sofia_Sans_Condensed,
} from 'next/font/google';
import Script from 'next/script';
import { ToastProvider } from 'ui';
import { AppHeader } from '@/components/site/AppHeader';
import { filterEnabled } from '@/lib/cabinet/feature-flags';
import { ORGANIZER_NAV_ITEMS } from '@/lib/cabinet/organizer-nav';
import { PARTICIPANT_NAV_ITEMS } from '@/lib/cabinet/participant-nav';
import { SessionProvider } from '@/lib/auth/session-context';
import { THEME_INIT_SCRIPT } from '@/lib/theme/theme';
import './globals.css';

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

// ADR-021 («Топокарта»): the display face — headings, labels, metric
// numerals, the wordmark (`font-display`). Variable font, so no `weight` list.
// Sofia Sans' default Cyrillic is the Bulgarian form set (в/д/и/т drawn
// like b/g/u/m); the Russian forms come from its `locl` OpenType feature,
// which browsers apply only when the text's language is Russian. That is
// what `<html lang="ru">` below guarantees — do not remove it, and do not set
// a different `lang` on any element rendered in this face.
const sofiaSansCondensed = Sofia_Sans_Condensed({
  subsets: ['cyrillic', 'latin'],
  variable: '--font-sofia-condensed',
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
    // `suppressHydrationWarning`: THEME_INIT_SCRIPT adds `.dark` to this
    // element before hydration on purpose, so its `class` legitimately
    // differs from the server HTML (one level deep only — children are
    // still checked).
    <html
      lang="ru"
      suppressHydrationWarning
      className={`${golosText.variable} ${sofiaSansCondensed.variable} ${ibmPlexMono.variable}`}
    >
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
            widest screens/layouts (the discovery split view).
            CR-108: `AppHeader` sits outside that cap so its bottom border runs
            the full width of the viewport, and caps its own inner nav instead. */}
        <SessionProvider>
          <ToastProvider>
            <AppHeader
              participantNavItems={filterEnabled(PARTICIPANT_NAV_ITEMS)}
              organizerNavItems={filterEnabled(ORGANIZER_NAV_ITEMS)}
            />
            <div className="mx-auto w-full xl:max-w-300">{children}</div>
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
