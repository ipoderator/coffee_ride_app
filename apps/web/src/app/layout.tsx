import type { Metadata } from 'next';
import { Golos_Text, IBM_Plex_Mono } from 'next/font/google';
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
      <body>{children}</body>
    </html>
  );
}
