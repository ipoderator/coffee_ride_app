'use client';

import { useEffect } from 'react';
import { SYSTEM_STATUS_TERMS } from 'ui';
import { SystemStatusScreen } from '@/components/site/SystemStatusScreen';
import { applyTheme, readStoredTheme } from '@/lib/theme/theme';
import './globals.css';

// CR-265: the root layout itself failed, so this draws its own document — the
// same unexpected-error screen, full height, with no header (the header is part of
// what failed). Dark by default like the layout (ADR-024 §4), then the viewer's
// stored theme; the layout's fonts are not loaded here, the tokens' fallbacks are.
// The `error` prop is deliberately unused — nothing about the cause is shown.
export default function GlobalError() {
  useEffect(() => {
    applyTheme(readStoredTheme());
  }, []);

  return (
    <html lang="ru" className="dark" suppressHydrationWarning>
      <body>
        <title>{SYSTEM_STATUS_TERMS.error.metaTitle}</title>
        <SystemStatusScreen kind="error" fullScreen />
      </body>
    </html>
  );
}
