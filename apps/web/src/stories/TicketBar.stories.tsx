import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useRef } from 'react';
import { expect, waitFor } from 'storybook/test';
import { REGISTRATION_ACTION_TERMS, RIDE_TICKET_TERMS } from 'ui';
import {
  TicketBar,
  type TicketBarContent,
} from '@/features/participant/ride-detail/components/TicketBar';

// The ride page's phone bar (CR-151): it shows once the ticket has scrolled
// up out of view. Each story scrolls a stand-in ticket away first.

function Page({ content }: { content: TicketBarContent }) {
  const ticketRef = useRef<HTMLElement>(null);
  return (
    <div>
      <section ref={ticketRef} className="h-40 rounded-2xl border p-4">
        Билет
      </section>
      <div className="h-[200vh]" />
      <TicketBar ticketRef={ticketRef} content={content} />
    </div>
  );
}

const meta = {
  title: 'Ride/TicketBar',
  component: Page,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
  },
  play: async ({ canvas }) => {
    window.scrollTo(0, 600);
    const bar = canvas.getByTestId('ticket-bar');
    await waitFor(() => expect(bar).toHaveAttribute('aria-hidden', 'false'));
  },
} satisfies Meta<typeof Page>;
export default meta;
type Story = StoryObj<typeof meta>;

/** CR-239 (production QA item 5): after a cancellation the bar shows the
 * count, as the ticket does — never a bare «№ N» that reads as the old number. */
export const Open: Story = {
  args: {
    content: {
      title: RIDE_TICKET_TERMS.barCount(3, 30),
      subtitle: 'вт 20 октября · 07:30 · осталось 27 мест',
      action: REGISTRATION_ACTION_TERMS.register,
      variant: 'primary',
    },
  },
  play: async (context) => {
    await meta.play(context);
    await expect(context.canvas.getByText('3 из 30 участников')).toBeVisible();
  },
};

export const Registered: Story = {
  args: {
    content: {
      title: RIDE_TICKET_TERMS.barRegistered(4),
      subtitle: RIDE_TICKET_TERMS.countdown('7 дн 15 ч'),
      action: RIDE_TICKET_TERMS.barDetails,
      variant: 'secondary',
    },
  },
};

export const Full: Story = {
  args: {
    content: {
      title: RIDE_TICKET_TERMS.barFull(2),
      subtitle: 'вт 20 октября · 07:30',
      action: RIDE_TICKET_TERMS.barQueue,
      variant: 'primary',
    },
  },
  globals: { theme: 'dark' },
};
