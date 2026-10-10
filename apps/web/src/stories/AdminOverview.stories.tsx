import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { ADMIN_TERMS } from 'ui';
import { AdminOverview } from '@/features/admin/overview/components/AdminOverview';
import { makeAdminOverview } from '@/test-support/admin';
import { json, pending, stubAdmin } from './admin-fixtures';

// CR-231 (ADR-032): `/admin` — platform counters and dependency states.

const meta = {
  title: 'Admin/Overview',
  component: AdminOverview,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AdminOverview>;
export default meta;
type Story = StoryObj<typeof meta>;

const ready = stubAdmin((path) =>
  path === '/overview' ? json({ overview: makeAdminOverview() }) : undefined,
);

export const Default: Story = {
  beforeEach: ready,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('1 240')).toBeInTheDocument();
    await expect(canvas.getByText('Ошибка')).toBeInTheDocument();
    // CR-232: exact-filter counters are links; «Обновлено …» and «Обновить».
    await expect(
      canvas.getByRole('link', {
        name: new RegExp(ADMIN_TERMS.usersBlocked, 'i'),
      }),
    ).toHaveAttribute('href', '/admin/users?filter=blocked');
    await expect(canvas.getAllByRole('link')).toHaveLength(4);
    await expect(canvas.getByText(/^Обновлено /)).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: ADMIN_TERMS.servicesRefresh }),
    ).toBeEnabled();
  },
};

/** CR-232: a refresh that fails keeps the numbers and says so. */
export const RefreshFailed: Story = {
  beforeEach: () => {
    let calls = 0;
    return stubAdmin((path) => {
      if (path !== '/overview') return undefined;
      calls += 1;
      return calls === 1
        ? json({ overview: makeAdminOverview() })
        : json({ code: 'internal' }, 500);
    })();
  },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByText('1 240');
    await userEvent.click(
      canvas.getByRole('button', { name: ADMIN_TERMS.servicesRefresh }),
    );
    await expect(
      await canvas.findByText(ADMIN_TERMS.servicesRefreshFailed),
    ).toBeInTheDocument();
    await expect(canvas.getByText('1 240')).toBeInTheDocument();
  },
};

export const Loading: Story = {
  beforeEach: stubAdmin(pending),
};

export const LoadError: Story = {
  beforeEach: stubAdmin(() => json({ code: 'internal' }, 500)),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('button', { name: ADMIN_TERMS.retry }),
    ).toBeInTheDocument();
  },
};

export const BothThemes: Story = {
  beforeEach: ready,
  globals: { theme: 'both' },
};
