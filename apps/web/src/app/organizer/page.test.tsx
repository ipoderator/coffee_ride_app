import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardWidget } from '@/lib/cabinet/types';
import OrganizerCabinetHomePage from './page';

// `ORGANIZER_WIDGETS` is mutated per-test via `vi.mock` below rather than
// imported directly — proves the page renders whatever the registry
// currently holds (ADR-009), including the zero-widget fallback the page's
// own comment says "can't happen today" but must still render correctly.
vi.mock('@/lib/cabinet/organizer-widgets', () => ({
  ORGANIZER_WIDGETS: [] as DashboardWidget[],
}));

import { ORGANIZER_WIDGETS } from '@/lib/cabinet/organizer-widgets';

describe('OrganizerCabinetHomePage', () => {
  it('renders every widget the registry currently holds', () => {
    ORGANIZER_WIDGETS.splice(
      0,
      ORGANIZER_WIDGETS.length,
      {
        id: 'fake-widget-one',
        order: 10,
        Component: () => <div>Виджет один</div>,
      },
      {
        id: 'fake-widget-two',
        order: 20,
        Component: () => <div>Виджет два</div>,
      },
    );

    render(<OrganizerCabinetHomePage />);

    expect(screen.getByText('Виджет один')).toBeInTheDocument();
    expect(screen.getByText('Виджет два')).toBeInTheDocument();
  });

  it('shows the empty-registry fallback when no widget is registered', () => {
    ORGANIZER_WIDGETS.splice(0, ORGANIZER_WIDGETS.length);

    render(<OrganizerCabinetHomePage />);

    expect(screen.getByText('Пока здесь нечего показать')).toBeInTheDocument();
  });
});
