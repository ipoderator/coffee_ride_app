import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicRideListItem } from 'types';
import { DiscoveryTabs } from './DiscoveryTabs';
import { listPublicRides } from '../api';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    listPublicRides: vi.fn(),
    getRouteGeometry: vi.fn(),
  };
});

let search = '';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('@/lib/maps/create-map-renderer', () => ({
  createMapRenderer: () => null,
}));

// CR-193: both views also read `phase=archive` («Завершённые и отменённые»).
// Those calls go to `archiveRidesMock` (an empty page unless a test says
// otherwise), so `listPublicRidesMock` keeps seeing the main list's calls only,
// minus the `phase` param itself (asserted directly where it matters).
const listPublicRidesMock = vi.fn<typeof listPublicRides>();
const archiveRidesMock = vi.fn<typeof listPublicRides>();

const RIDE: PublicRideListItem = {
  id: 'ride-1',
  organizerId: 'org-1',
  title: 'Тестовый заезд на выходные',
  description: null,
  coverImageUrl: null,
  bicycleType: 'road',
  startsAt: '2026-10-04T06:00:00.000Z',
  startTimezone: 'Europe/Moscow',
  startLat: null,
  startLng: null,
  participantLimit: 20,
  priceRub: null,
  distanceKm: 69.5,
  elevationGainMeters: 350,
  paceKmh: 30,
  durationMinutes: null,
  difficulty: null,
  participantsVisible: true,
  status: 'registration_open',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  updatedBy: null,
  organizer: {
    id: 'org-1',
    name: 'Тестовый организатор',
    avatarUrl: null,
    rating: null,
    reviewCount: 0,
  },
  registrationsCount: 15,
  startLabel: null,
  startDescription: null,
  routePreview: null,
  groups: [],
  waitlistCount: 0,
};

beforeEach(() => {
  search = '';
  window.history.replaceState(null, '', '/');
  listPublicRidesMock.mockReset();
  archiveRidesMock.mockReset();
  archiveRidesMock.mockResolvedValue({ items: [], nextCursor: null, total: 0 });
  vi.mocked(listPublicRides).mockImplementation(({ phase, ...params } = {}) =>
    phase === 'archive'
      ? archiveRidesMock(params)
      : listPublicRidesMock(params),
  );
  listPublicRidesMock.mockResolvedValue({
    items: [RIDE],
    nextCursor: null,
    total: 1,
  });
});

describe('DiscoveryTabs', () => {
  it('shows the route-cover grid by default', async () => {
    render(<DiscoveryTabs />);
    expect(
      await screen.findByText('Тестовый заезд на выходные'),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Список' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('puts the view switch beside the page heading in both views (CR-152)', async () => {
    render(<DiscoveryTabs />);
    await screen.findByText('Тестовый заезд на выходные');
    const headingRow = () =>
      screen
        .getByRole('heading', { level: 1, name: 'Заезды' })
        .closest('[data-discovery-head]');
    expect(headingRow()).toContainElement(screen.getByRole('tablist'));

    fireEvent.click(screen.getByRole('tab', { name: 'Карта' }));
    await screen.findByTestId('discovery-map-panel');
    expect(headingRow()).toContainElement(screen.getByRole('tablist'));
  });

  it('switches to the map-first list on the "Карта" tab', async () => {
    render(<DiscoveryTabs />);
    await screen.findByText('Тестовый заезд на выходные');

    fireEvent.click(screen.getByRole('tab', { name: 'Карта' }));

    await waitFor(() => {
      expect(screen.getByTestId('discovery-map-panel')).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: 'Карта' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('opens on the map tab for ?view=map (CR-130, the tab bar link)', async () => {
    search = 'view=map';
    render(<DiscoveryTabs />);
    await waitFor(() => {
      expect(screen.getByTestId('discovery-map-panel')).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: 'Карта' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('mirrors the chosen tab into the URL (CR-130)', async () => {
    render(<DiscoveryTabs />);
    await screen.findByText('Тестовый заезд на выходные');

    fireEvent.click(screen.getByRole('tab', { name: 'Карта' }));
    expect(window.location.search).toBe('?view=map');

    fireEvent.click(screen.getByRole('tab', { name: 'Список' }));
    expect(window.location.search).toBe('');
  });

  it('keeps the chosen filters when switching Список ⇄ Карта, and in the URL', async () => {
    render(<DiscoveryTabs />);
    await screen.findByText('Тестовый заезд на выходные');

    fireEvent.click(screen.getByRole('button', { name: /Эта неделя/ }));
    fireEvent.click(screen.getByRole('button', { name: /Бесплатные/ }));
    expect(window.location.search).toBe('?week=1&free=1');

    fireEvent.click(screen.getByRole('tab', { name: 'Карта' }));
    await screen.findByTestId('discovery-map-panel');

    // the map list was fetched with the same filters, not a fresh empty set
    await waitFor(() =>
      expect(listPublicRidesMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ free: true, startsTo: expect.any(String) }),
      ),
    );
    expect(screen.getByRole('button', { name: /Эта неделя/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Список' }));
    await screen.findByText('Тестовый заезд на выходные');
    expect(screen.getByRole('button', { name: /Бесплатные/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(window.location.search).toBe('?week=1&free=1');
  });

  it('restores filters from the URL on load and ignores malformed values', async () => {
    search = 'type=gravel&difficulty=3&free=1&pace=bogus';
    render(<DiscoveryTabs />);
    await screen.findByText('Тестовый заезд на выходные');

    expect(listPublicRidesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bicycleType: 'gravel',
        difficulty: 3,
        free: true,
      }),
    );
    // the malformed `pace` was dropped, not turned into a range
    const query = listPublicRidesMock.mock.calls[0]![0]!;
    expect(query).not.toHaveProperty('paceMin');
    expect(query).not.toHaveProperty('paceMax');
  });

  describe('keyboard and ARIA (WAI-ARIA tabs)', () => {
    it('puts only the selected tab in the Tab order and links it to a labelled tabpanel', async () => {
      render(<DiscoveryTabs />);
      await screen.findByText('Тестовый заезд на выходные');

      const list = screen.getByRole('tab', { name: 'Список' });
      const map = screen.getByRole('tab', { name: 'Карта' });
      expect(list).toHaveAttribute('tabindex', '0');
      expect(map).toHaveAttribute('tabindex', '-1');

      const panel = screen.getByRole('tabpanel');
      expect(list).toHaveAttribute('aria-controls', panel.id);
      expect(map).not.toHaveAttribute('aria-controls');
      expect(panel).toHaveAttribute('aria-labelledby', list.id);
      expect(panel).toContainElement(
        screen.getByText('Тестовый заезд на выходные'),
      );
    });

    it('moves and selects with the arrow keys, keeping focus on the new tab', async () => {
      render(<DiscoveryTabs />);
      await screen.findByText('Тестовый заезд на выходные');

      screen.getByRole('tab', { name: 'Список' }).focus();
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Список' }), {
        key: 'ArrowRight',
      });

      await screen.findByTestId('discovery-map-panel');
      const map = screen.getByRole('tab', { name: 'Карта' });
      expect(map).toHaveAttribute('aria-selected', 'true');
      // the switch was rebuilt inside the map view — focus must follow
      expect(map).toHaveFocus();
      expect(screen.getByRole('tabpanel')).toHaveAttribute(
        'aria-labelledby',
        map.id,
      );
      expect(window.location.search).toBe('?view=map');

      // wraps around, and Left goes back
      fireEvent.keyDown(map, { key: 'ArrowRight' });
      await screen.findByText('Тестовый заезд на выходные');
      expect(screen.getByRole('tab', { name: 'Список' })).toHaveFocus();
    });

    it('jumps with Home and End and ignores other keys', async () => {
      search = 'view=map';
      render(<DiscoveryTabs />);
      await screen.findByTestId('discovery-map-panel');

      const map = screen.getByRole('tab', { name: 'Карта' });
      fireEvent.keyDown(map, { key: 'a' });
      expect(map).toHaveAttribute('aria-selected', 'true');

      fireEvent.keyDown(map, { key: 'Home' });
      await screen.findByText('Тестовый заезд на выходные');
      const list = screen.getByRole('tab', { name: 'Список' });
      expect(list).toHaveFocus();

      fireEvent.keyDown(list, { key: 'End' });
      await screen.findByTestId('discovery-map-panel');
      expect(screen.getByRole('tab', { name: 'Карта' })).toHaveFocus();
    });
  });
});
