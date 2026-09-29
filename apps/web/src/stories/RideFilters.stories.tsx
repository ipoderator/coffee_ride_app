import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { expect, fn, waitFor } from 'storybook/test';
import { RIDE_CREATE_TERMS, RIDE_DISCOVERY_TERMS, UI_TERMS } from 'ui';
import { DiscoveryFilters } from '@/features/participant/discovery/components/DiscoveryFilters';
import { RideGrid } from '@/features/participant/discovery/components/RideGrid';
import {
  NO_DISCOVERY_FILTERS,
  type DiscoveryFilters as Filters,
} from '@/features/participant/discovery/lib/discovery-filters';
import { KI_080_DANGER_CONTRAST } from './a11y-known-issues';
import { SAMPLE_RIDES, listResponse } from './fixtures';

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

/** Every `GET /api/v1/rides` query string the stubbed list received. */
const ridesRequests = fn<(search: string) => void>();

function stubRides(respond: () => Promise<Response>) {
  return () => {
    const original = globalThis.fetch;
    ridesRequests.mockClear();
    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      const url = new URL(raw, window.location.href);
      if (url.pathname !== '/api/v1/rides') return original(input, init);
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
  parameters: { ...inList.parameters, ...KI_080_DANGER_CONTRAST },
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

export const InListDark: Story = {
  ...inList,
  globals: { theme: 'dark' },
  beforeEach: stubRides(() => json(listResponse(SAMPLE_RIDES))),
};
