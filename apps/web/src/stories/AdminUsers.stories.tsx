import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { ADMIN_TERMS } from 'ui';
import { AdminUserCard } from '@/features/admin/users/components/AdminUserCard';
import { AdminUsersList } from '@/features/admin/users/components/AdminUsersList';
import { makeAdminAction, makeAdminUser } from '@/test-support/admin';
import {
  ACTIONS,
  LONG_EMAIL,
  USERS,
  expectNoSideScroll,
  json,
  problem,
  stubAdmin,
  type AdminHandler,
} from './admin-fixtures';

// CR-231 (ADR-032): `/admin/users` and a user's card.

const meta = {
  title: 'Admin/Users',
  parameters: { layout: 'padded', nextjs: { appDirectory: true } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const USER_ID = USERS[0]!.id;

const listHandler: AdminHandler = (path) =>
  path.startsWith('/users')
    ? json({
        items: path.includes('filter=blocked')
          ? USERS.filter((user) => user.blockedAt)
          : USERS,
        nextCursor: null,
      })
    : undefined;

export const List: Story = {
  render: () => <AdminUsersList />,
  beforeEach: stubAdmin(listHandler),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('link', { name: 'owner@example.com' }),
    ).toHaveAttribute('href', `/admin/users/${USERS[3]!.id}`);
  },
};

/** CR-232: `/admin/users?q=spam&filter=blocked` — the filters come from the
 * URL (Storybook's router mock feeds `useSearchParams`; a change pushes
 * history, which only the real router mirrors — covered by unit tests), and
 * each card link carries them back. */
export const ListFilteredFromUrl: Story = {
  render: () => <AdminUsersList />,
  beforeEach: stubAdmin(listHandler),
  parameters: {
    nextjs: { navigation: { query: { q: 'spam', filter: 'blocked' } } },
  },
  play: async ({ canvas }) => {
    const link = await canvas.findByRole('link', {
      name: 'spam.bot.2026@example.com',
    });
    await expect(link).toHaveAttribute(
      'href',
      `/admin/users/${USERS[2]!.id}?from=q%3Dspam%26filter%3Dblocked`,
    );
    await expect(
      canvas.queryByRole('link', { name: 'owner@example.com' }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole('combobox', { name: ADMIN_TERMS.userFilterLegend }),
    ).toHaveValue('blocked');
    await expect(
      canvas.getByRole('searchbox', { name: ADMIN_TERMS.searchUsersLabel }),
    ).toHaveValue('spam');
  },
};

export const ListEmpty: Story = {
  render: () => <AdminUsersList />,
  beforeEach: stubAdmin(() => json({ items: [], nextCursor: null })),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(ADMIN_TERMS.usersEmpty),
    ).toBeInTheDocument();
  },
};

export const ListBothThemes: Story = {
  render: () => <AdminUsersList />,
  beforeEach: stubAdmin(listHandler),
  globals: { theme: 'both' },
};

function cardHandler(
  user = makeAdminUser({ emailVerified: false }),
  history = ACTIONS.filter((item) => item.targetId === user.id),
): AdminHandler {
  return (path) => {
    if (path === `/users/${user.id}`) return json({ user });
    if (path.startsWith('/actions')) {
      return json({ items: history, nextCursor: null });
    }
    if (path === `/users/${user.id}/block`) {
      return problem(409, 'cannot_block_admin');
    }
    return undefined;
  };
}

export const Card: Story = {
  render: () => <AdminUserCard userId={USER_ID} />,
  beforeEach: stubAdmin(cardHandler()),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('button', { name: ADMIN_TERMS.verifyEmail }),
    ).toBeInTheDocument();
  },
};

export const CardBlocked: Story = {
  render: () => <AdminUserCard userId={USERS[2]!.id} />,
  beforeEach: stubAdmin(
    cardHandler(USERS[2], [
      makeAdminAction({
        targetId: USERS[2]!.id,
        targetLabel: USERS[2]!.email,
      }),
    ]),
  ),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('button', { name: ADMIN_TERMS.unblock }),
    ).toBeInTheDocument();
  },
};

export const CardAdmin: Story = {
  render: () => <AdminUserCard userId={USERS[3]!.id} />,
  beforeEach: stubAdmin(cardHandler(USERS[3], [])),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(ADMIN_TERMS.historyEmpty),
    ).toBeInTheDocument();
  },
};

export const CardNotFound: Story = {
  render: () => <AdminUserCard userId="00000000-0000-4000-8000-000000000000" />,
  beforeEach: stubAdmin((path) =>
    path.startsWith('/actions')
      ? json({ items: [], nextCursor: null })
      : problem(404, 'not_found'),
  ),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(ADMIN_TERMS.userNotFound),
    ).toBeInTheDocument();
  },
};

/** The block dialog, left open: an empty reason first, then a refusal. */
export const BlockDialog: Story = {
  render: () => <AdminUserCard userId={USER_ID} />,
  beforeEach: stubAdmin(cardHandler(makeAdminUser())),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: ADMIN_TERMS.block }),
    );
    const dialog = within(document.body).getByRole('dialog', {
      name: ADMIN_TERMS.blockTitle,
    });
    // CR-232: the dialog names the account it blocks.
    await expect(dialog).toHaveAccessibleDescription(
      expect.stringContaining(USERS[0]!.email),
    );
    await expect(
      within(dialog).getByText(ADMIN_TERMS.reasonHintLogOnly),
    ).toBeInTheDocument();
    const submit = within(dialog).getByRole('button', {
      name: ADMIN_TERMS.block,
    });
    await userEvent.click(submit);
    await expect(
      within(dialog).getByText(ADMIN_TERMS.reasonRequired),
    ).toBeInTheDocument();
    await userEvent.type(
      within(dialog).getByLabelText(ADMIN_TERMS.reasonLabel),
      'Проверка',
    );
    await userEvent.click(submit);
    await expect(
      await within(dialog).findByText(ADMIN_TERMS.adminCannotBeBlocked),
    ).toBeInTheDocument();
  },
};

/** CR-232: a 130-character email wraps inside the block dialog. */
export const BlockDialogLongEmail: Story = {
  render: () => <AdminUserCard userId={USER_ID} />,
  beforeEach: stubAdmin(cardHandler(makeAdminUser({ email: LONG_EMAIL }))),
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(
      await within(canvasElement).findByRole('button', {
        name: ADMIN_TERMS.block,
      }),
    );
    const dialog = within(document.body).getByRole('dialog', {
      name: ADMIN_TERMS.blockTitle,
    });
    await expect(dialog).toHaveAccessibleDescription(
      expect.stringContaining(LONG_EMAIL),
    );
    await expectNoSideScroll(dialog);
  },
};

export const RevokeConfirm: Story = {
  render: () => <AdminUserCard userId={USER_ID} />,
  beforeEach: stubAdmin(cardHandler(makeAdminUser())),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: ADMIN_TERMS.revokeSessions }),
    );
    await expect(
      within(document.body).getByRole('dialog', {
        name: ADMIN_TERMS.revokeSessionsTitle,
      }),
    ).toBeInTheDocument();
  },
};

export const CardBothThemes: Story = {
  render: () => <AdminUserCard userId={USERS[2]!.id} />,
  beforeEach: stubAdmin(cardHandler(USERS[2], ACTIONS.slice(0, 1))),
  globals: { theme: 'both' },
};
