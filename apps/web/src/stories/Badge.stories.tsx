import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { Skeleton, StatusBadge, type StatusTone } from 'ui';

// The project's badge is `StatusBadge` (packages/ui): there is no separate
// generic `Badge` primitive (StatusBadge.tsx explains why, KI-020). Colour
// never carries meaning alone — every badge has its text label.
const meta = {
  title: 'UI/Badge',
  component: StatusBadge,
  tags: ['autodocs'],
  args: { label: 'Регистрация открыта', tone: 'success' },
  argTypes: {
    tone: {
      control: 'inline-radio',
      options: ['neutral', 'success', 'warning', 'info', 'danger'],
    },
  },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {
  play: async ({ canvas }) => {
    const badge = canvas.getByText('Регистрация открыта');
    // A tinted chip, not a solid fill — only `danger` is filled (§1).
    await expect(badge).toHaveClass('bg-success/10');
    await expect(badge).not.toHaveClass('bg-danger');
  },
};

export const Neutral: Story = {
  args: { label: 'Черновик', tone: 'neutral' },
};

export const Warning: Story = {
  args: { label: 'Мало мест', tone: 'warning' },
};

export const Info: Story = {
  args: { label: 'Список ожидания', tone: 'info' },
};

/** Error: the one solid-filled tone. */
export const Danger: Story = {
  args: { label: 'Отменён', tone: 'danger' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Отменён')).toHaveClass('bg-danger');
  },
};

/** Disabled / inactive: a neutral chip in muted ink. */
export const Inactive: Story = {
  args: { label: 'Завершён', tone: 'neutral' },
};

/** While the data loads: a chip-sized skeleton, hidden from screen readers. */
export const Loading: Story = {
  render: () => <Skeleton className="h-6 w-28 rounded-md" />,
};

/** Empty: no status to show — the badge is simply not rendered (never an
 * empty chip); the surrounding text says what's missing. */
export const Empty: Story = {
  render: () => (
    <p className="text-body-sm text-text-muted">Статус не указан</p>
  ),
};

const TONES: Array<{ tone: StatusTone; label: string }> = [
  { tone: 'neutral', label: 'Черновик' },
  { tone: 'success', label: 'Регистрация открыта' },
  { tone: 'warning', label: 'Мало мест' },
  { tone: 'info', label: 'Список ожидания' },
  { tone: 'danger', label: 'Отменён' },
];

function AllTones() {
  return (
    <div className="flex flex-wrap gap-2">
      {TONES.map(({ tone, label }) => (
        <StatusBadge key={tone} tone={tone} label={label} />
      ))}
    </div>
  );
}

export const Dark: Story = {
  globals: { theme: 'dark' },
  render: () => <AllTones />,
};

export const BothThemes: Story = {
  globals: { theme: 'both' },
  render: () => <AllTones />,
};
