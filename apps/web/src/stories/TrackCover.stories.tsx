import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { TrackCover } from '@/features/participant/ride-detail/components/TrackCover';
import { buildRouteTrack } from '@/features/participant/ride-detail/lib/route-track';
import { makeRide } from './fixtures';

// The ride hero's «Трек» face (CR-151). CR-170: the track draws itself in
// from the start, the pins settle in as the line reaches them; reduced
// motion draws it at once.
const preview = makeRide().routePreview!;
const track = buildRouteTrack(
  preview.map(([lat, lng]) => ({ lat, lng, elevationMeters: null })),
);
const start = preview[0]!;
const finish = preview[preview.length - 1]!;

const meta = {
  title: 'Rides/TrackCover',
  component: TrackCover,
  tags: ['autodocs'],
  args: {
    track,
    marks: [
      { id: 'start', point: { lat: start[0], lng: start[1] }, kind: 'start' },
      {
        id: 'finish',
        point: { lat: finish[0], lng: finish[1] },
        kind: 'finish',
      },
    ],
    hoverKm: null,
    seed: 'ride-1',
    label: 'Трек маршрута',
  },
  decorators: [
    (Story) => (
      <div className="relative h-80 w-full max-w-3xl overflow-hidden rounded-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TrackCover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DrawIn: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole('img', { name: 'Трек маршрута' }),
    ).toBeVisible();
    const line = canvasElement.querySelector('[data-track]')!;
    await expect(line.getAttribute('pathLength')).toBe('1');
    await expect(line.getAttribute('class')).toContain(
      'motion-safe:animate-track-draw',
    );
  },
};

/** Pins only, never joined — nothing to draw in. */
export const NoTrack: Story = {
  args: { track: null },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-track]')).toBeNull();
  },
};

export const Cancelled: Story = {
  args: { cancelled: true },
};
