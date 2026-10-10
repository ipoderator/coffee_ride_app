import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { ADMIN_TERMS } from 'ui';
import { AdminRidesList } from '@/features/admin/rides/components/AdminRidesList';
import { makeAdminRide } from '@/test-support/admin';
import {
  LONG_TITLE,
  RIDES,
  expectNoSideScroll,
  json,
  pending,
  problem,
  stubAdmin,
} from './admin-fixtures';

// CR-231 (ADR-032): `/admin/rides` — hide/unhide and cancel any ride.

const meta = {
  title: 'Admin/Rides',
  component: AdminRidesList,
  parameters: { layout: 'padded', nextjs: { appDirectory: true } },
} satisfies Meta<typeof AdminRidesList>;
export default meta;
type Story = StoryObj<typeof meta>;

const list = stubAdmin((path) => {
  if (path.endsWith('/cancel')) return problem(409, 'ride_not_cancellable');
  if (path.startsWith('/rides'))
    return json({ items: RIDES, nextCursor: 'next' });
  return undefined;
});

export const Default: Story = {
  beforeEach: list,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(ADMIN_TERMS.reasonLine('Реклама вместо заезда')),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: ADMIN_TERMS.loadMore }),
    ).toBeInTheDocument();
  },
};

/** CR-232: `/admin/rides?q=…&status=bogus&visibility=hidden` — the URL fills
 * the controls; an unknown status falls back to «Любой». */
export const FilteredFromUrl: Story = {
  beforeEach: list,
  parameters: {
    nextjs: {
      navigation: {
        query: { q: 'сотка', status: 'bogus', visibility: 'hidden' },
      },
    },
  },
  play: async ({ canvas }) => {
    await canvas.findByText(ADMIN_TERMS.reasonLine('Реклама вместо заезда'));
    await expect(
      canvas.getByRole('searchbox', { name: ADMIN_TERMS.searchRidesLabel }),
    ).toHaveValue('сотка');
    await expect(
      canvas.getByRole('combobox', { name: ADMIN_TERMS.rideStatusLabel }),
    ).toHaveValue('any');
    await expect(
      canvas.getByRole('radio', { name: ADMIN_TERMS.visibility.hidden }),
    ).toBeChecked();
  },
};

export const Loading: Story = { beforeEach: stubAdmin(pending) };

export const LoadError: Story = {
  beforeEach: stubAdmin(() => json({ code: 'internal' }, 500)),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(ADMIN_TERMS.loadError),
    ).toBeInTheDocument();
  },
};

/** The hide dialog, left open with a reason typed in. */
export const HideDialog: Story = {
  beforeEach: list,
  play: async ({ canvas, userEvent }) => {
    const [hide] = await canvas.findAllByRole('button', {
      name: ADMIN_TERMS.hideRide,
    });
    await userEvent.click(hide!);
    const dialog = within(document.body).getByRole('dialog', {
      name: ADMIN_TERMS.hideRideTitle,
    });
    // CR-232: the dialog names the ride it hides.
    await expect(dialog).toHaveAccessibleDescription(
      expect.stringContaining(RIDES[0]!.title),
    );
    await expect(
      within(dialog).getByText(ADMIN_TERMS.reasonHintOrganizerVisible),
    ).toBeInTheDocument();
    await userEvent.type(
      within(dialog).getByLabelText(ADMIN_TERMS.reasonLabel),
      'Дубль заезда',
    );
  },
};

/** CR-232: an unbroken 150-character title wraps inside the cancel dialog. */
export const CancelDialogLongTitle: Story = {
  beforeEach: stubAdmin((path) =>
    path.startsWith('/rides')
      ? json({
          items: [makeAdminRide({ title: LONG_TITLE })],
          nextCursor: null,
        })
      : undefined,
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: ADMIN_TERMS.cancelRide }),
    );
    const dialog = within(document.body).getByRole('dialog', {
      name: ADMIN_TERMS.cancelRideTitle,
    });
    await expect(dialog).toHaveAccessibleDescription(
      expect.stringContaining(LONG_TITLE),
    );
    await expect(
      within(dialog).getByText(ADMIN_TERMS.reasonHintLogOnly),
    ).toBeInTheDocument();
    await expectNoSideScroll(dialog);
  },
};

/** The API refuses the cancellation — the dialog stays, in Russian. */
export const CancelRefused: Story = {
  beforeEach: list,
  play: async ({ canvas, userEvent }) => {
    const [cancel] = await canvas.findAllByRole('button', {
      name: ADMIN_TERMS.cancelRide,
    });
    await userEvent.click(cancel!);
    const dialog = within(document.body).getByRole('dialog', {
      name: ADMIN_TERMS.cancelRideTitle,
    });
    await userEvent.type(
      within(dialog).getByLabelText(ADMIN_TERMS.reasonLabel),
      'Организатор не выходит на связь',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: ADMIN_TERMS.cancelRide }),
    );
    await expect(
      await within(dialog).findByText(ADMIN_TERMS.rideNotCancellable),
    ).toBeInTheDocument();
  },
};

export const Empty: Story = {
  beforeEach: stubAdmin(() => json({ items: [], nextCursor: null })),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(ADMIN_TERMS.ridesEmpty),
    ).toBeInTheDocument();
  },
};

export const BothThemes: Story = {
  beforeEach: list,
  globals: { theme: 'both' },
};
