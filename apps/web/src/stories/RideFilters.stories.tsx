import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { expect, fn, waitFor, within } from 'storybook/test';
import { RIDE_CREATE_TERMS, RIDE_DISCOVERY_TERMS, UI_TERMS } from 'ui';
import { DiscoveryFilters } from '@/features/participant/discovery/components/DiscoveryFilters';
import { RideGrid } from '@/features/participant/discovery/components/RideGrid';
import {
  NO_DISCOVERY_FILTERS,
  type DiscoveryFilters as Filters,
} from '@/features/participant/discovery/lib/discovery-filters';
import { SAMPLE_RIDES, listResponse, makeRide } from './fixtures';

// `/`'s filter chips (`DiscoveryFilters`, CR-153). Standalone stories drive
// the chips themselves; the `InList*` stories render them inside the real
// `RideGrid` with `GET /api/v1/rides` stubbed, so loading / error / empty
// are the list's actual states, not look-alikes.

function ControlledFilters({
  filters: initial,
  onChange,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <DiscoveryFilters
      filters={filters}
      onChange={(next) => {
        setFilters(next);
        onChange(next);
      }}
    />
  );
}

/** Every `GET /api/v1/rides?phase=active` query string the stubbed list
 * received — the rides a visitor can still join (CR-193). */
const ridesRequests = fn<(search: string) => void>();

/** CR-193: `phase=archive` (finished/cancelled) is its own request, answered
 * by `archive` — empty unless a story gives it rides. */
function stubRides(
  respond: () => Promise<Response>,
  archive: () => Promise<Response> = () => json(listResponse([])),
) {
  return () => {
    const original = globalThis.fetch;
    ridesRequests.mockClear();
    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      const url = new URL(raw, window.location.href);
      if (url.pathname !== '/api/v1/rides') return original(input, init);
      if (url.searchParams.get('phase') === 'archive') return archive();
      ridesRequests(url.search);
      return respond();
    };
    return () => {
      globalThis.fetch = original;
    };
  };
}

function json(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

const meta = {
  title: 'Rides/RideFilters',
  component: DiscoveryFilters,
  tags: ['autodocs'],
  args: { filters: NO_DISCOVERY_FILTERS, onChange: fn() },
  render: (args) => (
    <ControlledFilters
      key={JSON.stringify(args.filters)}
      filters={args.filters}
      onChange={args.onChange}
    />
  ),
} satisfies Meta<typeof DiscoveryFilters>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const free = canvas.getByRole('button', {
      name: RIDE_DISCOVERY_TERMS.filterFree,
    });
    await expect(free).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(free);
    await expect(free).toHaveAttribute('aria-pressed', 'true');
    await expect(args.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ free: true }),
    );

    await userEvent.selectOptions(
      canvas.getByRole('combobox', {
        name: RIDE_CREATE_TERMS.bicycleTypeLabel,
      }),
      'gravel',
    );
    await expect(args.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ bicycleType: 'gravel', free: true }),
    );

    // Toggling back off clears it again.
    await userEvent.click(free);
    await expect(free).toHaveAttribute('aria-pressed', 'false');
  },
};

export const Active: Story = {
  args: {
    filters: {
      bicycleType: 'road',
      thisWeek: true,
      pace: 'from25to30',
      difficulty: 3,
      free: true,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: RIDE_DISCOVERY_TERMS.filterThisWeek }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      canvas.getByRole('combobox', {
        name: RIDE_CREATE_TERMS.bicycleTypeLabel,
      }),
    ).toHaveValue('road');
  },
};

/** `DiscoveryFilters` has no `disabled` prop of its own; a native
 * `<fieldset disabled>` around it disables every chip at once. */
export const Disabled: Story = {
  parameters: {
    // The product never disables the row; with every chip disabled, its
    // phone-width horizontal scroller has nothing focusable to scroll with.
    a11y: {
      config: {
        rules: [{ id: 'scrollable-region-focusable', enabled: false }],
      },
    },
  },
  render: (args) => (
    <fieldset disabled className="m-0 min-w-0 border-0 p-0">
      <ControlledFilters filters={args.filters} onChange={args.onChange} />
    </fieldset>
  ),
  play: async ({ args, canvas, userEvent }) => {
    const free = canvas.getByRole('button', {
      name: RIDE_DISCOVERY_TERMS.filterFree,
    });
    await expect(free).toBeDisabled();
    await expect(
      canvas.getByRole('combobox', {
        name: RIDE_CREATE_TERMS.bicycleTypeLabel,
      }),
    ).toBeDisabled();
    await userEvent.click(free);
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  args: {
    filters: { ...NO_DISCOVERY_FILTERS, thisWeek: true, bicycleType: 'gravel' },
  },
};

export const BothThemes: Story = {
  globals: { theme: 'both' },
  args: {
    filters: { ...NO_DISCOVERY_FILTERS, free: true, difficulty: 2 },
  },
};

// ---- Inside the ride list (real `RideGrid`, stubbed API) ----

const inList = {
  parameters: { shellPadding: false },
  render: () => <RideGrid />,
} satisfies Partial<Story>;

/** The filters stay usable while the list is loading. */
export const InListLoading: Story = {
  ...inList,
  beforeEach: stubRides(() => new Promise<Response>(() => {})),
  play: async ({ canvas }) => {
    await waitFor(() => expect(ridesRequests).toHaveBeenCalledTimes(1));
    await expect(
      canvas.getByRole('button', { name: RIDE_DISCOVERY_TERMS.filterFree }),
    ).toBeEnabled();
  },
};

export const InListError: Story = {
  ...inList,
  beforeEach: stubRides(() =>
    json(
      {
        type: 'about:blank',
        title: 'Internal Server Error',
        status: 500,
        code: 'internal_error',
      },
      500,
    ),
  ),
  play: async ({ canvas, userEvent }) => {
    const alert = await canvas.findByRole('alert');
    await expect(alert).toHaveTextContent(RIDE_DISCOVERY_TERMS.loadError);
    await userEvent.click(canvas.getByRole('button', { name: UI_TERMS.retry }));
    await waitFor(() => expect(ridesRequests).toHaveBeenCalledTimes(2));
    await expect(await canvas.findByRole('alert')).toBeVisible();
  },
};

/** No rides at all → a filter narrows to nothing → «Сбросить фильтры». */
export const InListEmpty: Story = {
  ...inList,
  beforeEach: stubRides(() => json(listResponse([]))),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByText(RIDE_DISCOVERY_TERMS.emptyTitle),
    ).toBeVisible();

    const free = canvas.getByRole('button', {
      name: RIDE_DISCOVERY_TERMS.filterFree,
    });
    await userEvent.click(free);
    await waitFor(() =>
      expect(ridesRequests).toHaveBeenLastCalledWith(
        expect.stringContaining('free=true'),
      ),
    );
    await expect(
      await canvas.findByText(RIDE_DISCOVERY_TERMS.emptyFilteredTitle),
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole('button', {
        name: RIDE_DISCOVERY_TERMS.resetFiltersLabel,
      }),
    );
    await expect(free).toHaveAttribute('aria-pressed', 'false');
    await expect(
      await canvas.findByText(RIDE_DISCOVERY_TERMS.emptyTitle),
    ).toBeVisible();
  },
};

/** A chip change re-queries the API with the matching params. */
export const InListWithResults: Story = {
  ...inList,
  beforeEach: stubRides(() => json(listResponse(SAMPLE_RIDES))),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole('heading', {
        name: 'Шоссейный круг до Звенигорода',
      }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole('button', { name: RIDE_DISCOVERY_TERMS.filterThisWeek }),
    );
    await waitFor(() =>
      expect(ridesRequests).toHaveBeenLastCalledWith(
        expect.stringContaining('startsTo='),
      ),
    );
  },
};

/** CR-193: finished and cancelled rides are not mixed in with the open ones —
 * a collapsed «Завершённые и отменённые» section under the list; opened, their
 * cards show the status, never «Осталось N мест». */
export const InListWithArchive: Story = {
  ...inList,
  beforeEach: stubRides(
    () => json(listResponse(SAMPLE_RIDES)),
    () =>
      json(
        listResponse([
          makeRide({
            id: 'ride-finished',
            title: 'Утренний круг по Крылатским холмам',
            status: 'finished',
          }),
          makeRide({
            id: 'ride-cancelled',
            title: 'Гравий до Истры',
            status: 'cancelled',
          }),
        ]),
      ),
  ),
  play: async ({ canvas, userEvent }) => {
    const archive = await canvas.findByRole('region', {
      name: RIDE_DISCOVERY_TERMS.archiveTitle,
    });
    await expect(
      canvas.queryByRole('heading', {
        name: 'Утренний круг по Крылатским холмам',
      }),
    ).not.toBeInTheDocument();

    const toggle = within(archive).getByRole('button', {
      name: RIDE_DISCOVERY_TERMS.archiveShow(2),
    });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(
      within(archive).getByRole('heading', {
        name: 'Утренний круг по Крылатским холмам',
      }),
    ).toBeVisible();
    await expect(within(archive).getByText('Гравий до Истры')).toBeVisible();
    await expect(within(archive).queryByText(/Осталось/)).toBeNull();
  },
};

export const InListDark: Story = {
  ...inList,
  globals: { theme: 'dark' },
  beforeEach: stubRides(() => json(listResponse(SAMPLE_RIDES))),
};
