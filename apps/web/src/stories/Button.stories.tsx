import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn } from 'storybook/test';
import { Button, EmptyState, RIDE_DISCOVERY_TERMS } from 'ui';

const meta = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  args: {
    children: 'Записаться',
    variant: 'primary',
    isLoading: false,
    disabled: false,
    onClick: fn(),
  },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['primary', 'secondary', 'danger', 'danger-filled'],
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Записаться' });
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
    // Keyboard activation works too (docs/design.md §12).
    button.focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Показать ещё' },
};

export const Danger: Story = {
  args: { variant: 'danger', children: 'Отменить заезд' },
};

export const DangerFilled: Story = {
  args: { variant: 'danger-filled', children: 'Да, отменить' },
};

/** Duplicate-submit protection: `isLoading` disables and shows a spinner. */
export const Loading: Story = {
  args: { isLoading: true },
  play: async ({ args, canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Записаться' });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Записаться' });
    await expect(button).toBeDisabled();
    await expect(button).not.toHaveAttribute('aria-busy');
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

/** The error pattern used under «Показать ещё» (`RideGrid`): an alert line
 * above the button, which stays enabled so the user can retry. */
export const WithError: Story = {
  args: {
    variant: 'secondary',
    children: RIDE_DISCOVERY_TERMS.showMoreFallback,
  },
  render: (args) => (
    <div className="flex flex-col items-center gap-3">
      <p role="alert" className="text-body-sm text-danger">
        {RIDE_DISCOVERY_TERMS.loadMoreError}
      </p>
      <Button {...args} />
    </div>
  ),
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      RIDE_DISCOVERY_TERMS.loadMoreError,
    );
    await userEvent.click(canvas.getByRole('button'));
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

/** The button as an empty state's next action («Сбросить фильтры»). */
export const InEmptyState: Story = {
  args: {
    variant: 'secondary',
    children: RIDE_DISCOVERY_TERMS.resetFiltersLabel,
  },
  render: (args) => (
    <EmptyState
      title={RIDE_DISCOVERY_TERMS.emptyFilteredTitle}
      action={<Button {...args} />}
    />
  ),
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent(
      RIDE_DISCOVERY_TERMS.emptyFilteredTitle,
    );
    await userEvent.click(
      canvas.getByRole('button', {
        name: RIDE_DISCOVERY_TERMS.resetFiltersLabel,
      }),
    );
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

const VARIANTS = ['primary', 'secondary', 'danger', 'danger-filled'] as const;

function Matrix() {
  return (
    <div className="grid gap-4">
      {VARIANTS.map((variant) => (
        <div key={variant} className="flex flex-wrap items-center gap-3">
          <Button variant={variant}>Кнопка</Button>
          <Button variant={variant} isLoading>
            Сохраняем
          </Button>
          <Button variant={variant} disabled>
            Недоступно
          </Button>
        </div>
      ))}
    </div>
  );
}

/** Every variant × default/loading/disabled, dark theme. */
export const Dark: Story = {
  globals: { theme: 'dark' },
  render: () => <Matrix />,
};

/** Every variant × default/loading/disabled, light and dark side by side. */
export const BothThemes: Story = {
  globals: { theme: 'both' },
  render: () => <Matrix />,
};
