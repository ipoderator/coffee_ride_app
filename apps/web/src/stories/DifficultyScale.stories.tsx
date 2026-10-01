import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { DifficultyScale } from 'ui';

// Difficulty as a 1–5 segment scale plus a word (`docs/design.md` §6).
// CR-170: `animated` fills the filled segments left to right once, when the
// scale first scrolls into view; reduced motion shows the final state at once.
const meta = {
  title: 'Rides/DifficultyScale',
  component: DifficultyScale,
  tags: ['autodocs'],
  args: { level: 3 },
  argTypes: {
    level: { control: 'inline-radio', options: [1, 2, 3, 4, 5] },
    size: { control: 'inline-radio', options: ['md', 'sm'] },
  },
} satisfies Meta<typeof DifficultyScale>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Static: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText('Средний')).toBeVisible();
    await expect(
      canvasElement.querySelector('[class*="animate-segment-fill"]'),
    ).toBeNull();
  },
};

/** The ride page's chip: fills in as it scrolls into view. */
export const AnimatedFill: Story = {
  args: { level: 4, size: 'sm', animated: true },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText('Сложный')).toBeVisible();
    const filling = canvasElement.querySelectorAll(
      '[class*="motion-safe:animate-segment-fill"]',
    );
    await expect(filling).toHaveLength(4);
  },
};

export const EveryLevel: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {([1, 2, 3, 4, 5] as const).map((level) => (
        <DifficultyScale key={level} level={level} animated />
      ))}
    </div>
  ),
};

export const BothThemes: Story = {
  args: { level: 5, animated: true },
  globals: { theme: 'both' },
};
