import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { ADMIN_TERMS } from 'ui';
import { AdminActionsLog } from '@/features/admin/actions/components/AdminActionsLog';
import { ACTIONS, json, stubAdmin } from './admin-fixtures';

/** Answers `/actions` with the fixture rows, narrowed by `?targetType=&action=`. */
const filtered = stubAdmin((path) => {
  const params = new URLSearchParams(path.split('?')[1]);
  const targetType = params.get('targetType');
  const action = params.get('action');
  return json({
    items: ACTIONS.filter(
      (item) =>
        (!targetType || item.targetType === targetType) &&
        (!action || item.action === action),
    ),
    nextCursor: null,
  });
});

// CR-231 (ADR-032): `/admin/actions` — the append-only log.

const meta = {
  title: 'Admin/ActionLog',
  component: AdminActionsLog,
  parameters: { layout: 'padded', nextjs: { appDirectory: true } },
} satisfies Meta<typeof AdminActionsLog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  beforeEach: stubAdmin(() => json({ items: ACTIONS, nextCursor: null })),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(ADMIN_TERMS.actorCli),
    ).toBeInTheDocument();
    // CR-232: a deleted target keeps its id.
    await expect(
      canvas.getByText(
        ADMIN_TERMS.targetMissingWithId('66666666-6666-4666-8666-666666666666'),
      ),
    ).toBeInTheDocument();
  },
};

/** CR-232: `/admin/actions?targetType=ride&action=ride_cancelled` — read from
 * the URL; the action choices narrow to ride actions. */
export const FilteredFromUrl: Story = {
  beforeEach: filtered,
  parameters: {
    nextjs: {
      navigation: {
        query: { targetType: 'ride', action: 'ride_cancelled' },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(ADMIN_TERMS.actionLabels.ride_cancelled),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByText(ADMIN_TERMS.actionLabels.user_blocked),
    ).toBeNull();
    const action = canvas.getByRole('combobox', {
      name: ADMIN_TERMS.actionsFilterAction,
    });
    await expect(action).toHaveValue('ride_cancelled');
    await expect(action.querySelectorAll('option')).toHaveLength(4);
  },
};

/** A filter that matches nothing says so and suggests changing it. */
export const FilteredEmpty: Story = {
  beforeEach: filtered,
  parameters: {
    nextjs: { navigation: { query: { action: 'review_unhidden' } } },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(ADMIN_TERMS.actionsEmptyFiltered),
    ).toBeInTheDocument();
  },
};

/** A next page exists; it fails once — the error line sits above the button. */
export const LoadMoreFailed: Story = {
  beforeEach: stubAdmin((path) =>
    path.includes('cursor=')
      ? json({ code: 'internal' }, 500)
      : json({ items: ACTIONS.slice(0, 3), nextCursor: 'next' }),
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: ADMIN_TERMS.loadMore }),
    );
    await expect(
      await canvas.findByText(ADMIN_TERMS.loadMoreError),
    ).toBeInTheDocument();
  },
};

export const Empty: Story = {
  beforeEach: stubAdmin(() => json({ items: [], nextCursor: null })),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(ADMIN_TERMS.actionsEmpty),
    ).toBeInTheDocument();
  },
};

export const BothThemes: Story = {
  ...Default,
  play: undefined,
  globals: { theme: 'both' },
};
