import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor } from 'storybook/test';
import { CabinetSectionTabs } from '@/components/cabinet/CabinetSectionTabs';
import { ADMIN_NAV_ITEMS } from '@/lib/admin/admin-nav';
import { ORGANIZER_NAV_ITEMS } from '@/lib/cabinet/organizer-nav';

// CR-132/CR-232: the cabinets' mobile section row (below `lg`). Framed at a
// 320 px phone width; on a direct load the active tab must be scrolled into
// the row, the page itself never scrolled sideways.

const meta = {
  title: 'Cabinet/SectionTabs',
  component: CabinetSectionTabs,
  parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <div className="w-80 bg-bg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CabinetSectionTabs>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The active link sits fully inside the row's visible box. */
async function expectActiveTabVisible(canvasElement: HTMLElement) {
  const row = canvasElement.querySelector('ul')!;
  const active = row.querySelector<HTMLElement>('[aria-current="page"]')!;
  await waitFor(() => {
    const rowBox = row.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    expect(box.left).toBeGreaterThanOrEqual(rowBox.left);
    expect(box.right).toBeLessThanOrEqual(rowBox.right);
  });
  await expect(document.documentElement.scrollLeft).toBe(0);
}

export const AdminFirstTab: Story = {
  args: { items: ADMIN_NAV_ITEMS },
  parameters: { nextjs: { navigation: { pathname: '/admin' } } },
  play: async ({ canvasElement }) => {
    await expectActiveTabVisible(canvasElement);
    await expect(canvasElement.querySelector('ul')!.scrollLeft).toBe(0);
  },
};

/** `/admin/actions` opened directly — the last tab is scrolled into view. */
export const AdminLastTab: Story = {
  args: { items: ADMIN_NAV_ITEMS },
  parameters: { nextjs: { navigation: { pathname: '/admin/actions' } } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('ul')!.scrollLeft).toBeGreaterThan(
      0,
    );
    await expectActiveTabVisible(canvasElement);
  },
};

/** The organizer cabinet shares the row — its last section too. */
export const OrganizerLastTab: Story = {
  args: { items: ORGANIZER_NAV_ITEMS, badges: { newRegistrations: 3 } },
  parameters: {
    nextjs: {
      navigation: {
        pathname: ORGANIZER_NAV_ITEMS[ORGANIZER_NAV_ITEMS.length - 1]!.href,
      },
    },
  },
  play: async ({ canvasElement }) => {
    await expectActiveTabVisible(canvasElement);
  },
};

export const AdminLastTabDark: Story = {
  ...AdminLastTab,
  globals: { theme: 'dark' },
};
