import type { Metadata } from 'next';
import {
  Golos_Text,
  IBM_Plex_Mono,
  Sofia_Sans_Condensed,
  Sofia_Sans_Extra_Condensed,
  Unbounded,
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
  // 800: the wordmark only (CR-121).
  weight: ['400', '500', '600', '800'],
  variable: '--font-golos',
  display: 'swap',
});

// ADR-024 («Ночной старт»): the display face — labels/eyebrows only now
// (`font-display`; ride titles/headings moved to `font-title`/Unbounded
// below). Variable font, so no `weight` list. Sofia Sans' default Cyrillic
// is the Bulgarian form set (в/д/и/т drawn like b/g/u/m); the Russian forms
// come from its `locl` OpenType feature, which browsers apply only when the
// text's language is Russian. That is what `<html lang="ru">` below
// guarantees — do not remove it, and do not set a different `lang` on any
// element rendered in this face (same caveat applies to Sofia Sans Extra
// Condensed below).
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

// ADR-024: `font-title` — ride titles and screen headings (`h1`/`h2`/`h3`,
// `globals.css`). Weights 500/600/700 cover the mockup's clamp(34-58px) hero
// through 21px card titles.
const unbounded = Unbounded({
  subsets: ['cyrillic', 'latin'],
  weight: ['500', '600', '700'],
  variable: '--font-unbounded',
  display: 'swap',
});

// ADR-024: `font-num` — large tabular metric numerals (route cover,
// `MetricTile`). Weights 700/800 cover the mockup's 30-44px numerals.
const sofiaSansExtraCondensed = Sofia_Sans_Extra_Condensed({
  subsets: ['cyrillic', 'latin'],
  weight: ['700', '800'],
  variable: '--font-sofia-extra-condensed',
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
      className={`${golosText.variable} ${sofiaSansCondensed.variable} ${ibmPlexMono.variable} ${unbounded.variable} ${sofiaSansExtraCondensed.variable}`}
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
