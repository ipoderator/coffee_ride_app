import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { NAV_MENU_ITEM_CLASSNAME, NavMenu } from 'ui';

// `packages/ui`'s header menu primitive (CR-108). CR-243: an optional
// `header` sits above the items, outside `role="menu"`, as its description;
// `menuitemradio` items take part in the arrow-key navigation.

const meta = {
  title: 'UI/NavMenu',
  component: NavMenu,
  tags: ['autodocs'],
  args: { label: 'Организатору', children: null },
  decorators: [
    (Story) => (
      <div className="flex h-80 justify-end p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NavMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

const LINKS = (
  <>
    <a href="#overview" role="menuitem" className={NAV_MENU_ITEM_CLASSNAME}>
      Обзор
    </a>
    <a href="#rides" role="menuitem" className={NAV_MENU_ITEM_CLASSNAME}>
      Заезды
    </a>
  </>
);

export const Open: Story = {
  args: { children: LINKS },
  globals: { theme: 'both' },
  play: async ({ canvas, userEvent }) => {
    const [trigger] = canvas.getAllByRole('button', { name: 'Организатору' });
    await userEvent.click(trigger!);
    await expect(canvas.getAllByRole('menuitem')).toHaveLength(2);
  },
};

export const WithHeaderAndRadios: Story = {
  args: {
    label: 'Аккаунт',
    header: (
      <p className="truncate px-3 py-2 text-xs text-text-secondary">
        rider@example.test
      </p>
    ),
    children: (
      <>
        <button
          type="button"
          role="menuitemradio"
          aria-checked="true"
          className={NAV_MENU_ITEM_CLASSNAME}
        >
          Светлая
        </button>
        <button
          type="button"
          role="menuitemradio"
          aria-checked="false"
          className={NAV_MENU_ITEM_CLASSNAME}
        >
          Тёмная
        </button>
      </>
    ),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Аккаунт' }));
    await expect(canvas.getByRole('menu')).toHaveAccessibleDescription(
      'rider@example.test',
    );
    await userEvent.keyboard('{ArrowDown}');
    await expect(
      canvas.getByRole('menuitemradio', { name: 'Тёмная' }),
    ).toBeInTheDocument();
  },
};
