import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { DATE_PICKER_TERMS, RIDE_CREATE_TERMS } from 'ui';
import { CreateRideForm } from '@/features/organizer/rides/components/CreateRideForm';

// `/organizer/rides/new` — step 1 of the new-ride wizard, «Основное о заезде»
// (CR-156). Each story stubs `POST /api/v1/rides`.

function problem(status: number, code: string): Response {
  return new Response(
    JSON.stringify({
      type: `https://coffee-ride.example/errors/${code}`,
      title: 'Request failed',
      status,
      detail: 'Create an organizer profile before creating a ride.',
      instance: '/v1/rides',
      code,
    }),
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

/** Answers the create with `response`; anything else goes through. */
function stubCreate(response: () => Response) {
  return () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      const { pathname } = new URL(raw, window.location.href);
      if (pathname === '/api/v1/rides' && init?.method === 'POST') {
        return response();
      }
      return original(input, init);
    };
    return () => {
      globalThis.fetch = original;
    };
  };
}

const meta = {
  title: 'Organizer/CreateRideForm',
  component: CreateRideForm,
  parameters: { layout: 'padded', nextjs: { appDirectory: true } },
} satisfies Meta<typeof CreateRideForm>;
export default meta;
type Story = StoryObj<typeof meta>;

const next = { name: RIDE_CREATE_TERMS.next };

export const Empty: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { name: RIDE_CREATE_TERMS.stepTitle }),
    ).toBeInTheDocument();
  },
};

/** «Далее» on an untouched form: date and time are required. */
export const MissingStart: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', next));
    await expect(
      await canvas.findByText(RIDE_CREATE_TERMS.startDateRequired),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(RIDE_CREATE_TERMS.startTimeRequired),
    ).toBeInTheDocument();
  },
};

/** CR-236 (production QA): an error goes as soon as its field is corrected,
 * not at the next save; the other field's error stays. */
export const ErrorsClearWhenFixed: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', next));
    await canvas.findByText(RIDE_CREATE_TERMS.startDateRequired);

    await userEvent.click(
      canvas.getByLabelText(RIDE_CREATE_TERMS.startDateLabel),
    );
    await userEvent.click(
      canvas.getByRole('button', { name: DATE_PICKER_TERMS.tomorrow }),
    );
    await expect(
      canvas.queryByText(RIDE_CREATE_TERMS.startDateRequired),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByText(RIDE_CREATE_TERMS.startTimeRequired),
    ).toBeInTheDocument();

    await userEvent.type(
      canvas.getByLabelText(RIDE_CREATE_TERMS.startTimeLabel),
      '08:00',
    );
    await expect(
      canvas.queryByText(RIDE_CREATE_TERMS.startTimeRequired),
    ).not.toBeInTheDocument();
  },
};

/** No organizer profile yet: the refusal links to where one is made. */
export const OrganizerProfileRequired: Story = {
  beforeEach: stubCreate(() => problem(403, 'organizer_profile_required')),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText(RIDE_CREATE_TERMS.titleLabel),
      'Утренний гравийный заезд',
    );
    await userEvent.click(
      canvas.getByLabelText(RIDE_CREATE_TERMS.startDateLabel),
    );
    await userEvent.click(
      canvas.getByRole('button', { name: DATE_PICKER_TERMS.tomorrow }),
    );
    await userEvent.type(
      canvas.getByLabelText(RIDE_CREATE_TERMS.startTimeLabel),
      '08:00',
    );
    await userEvent.click(canvas.getByRole('button', next));
    await expect(
      await canvas.findByRole('link', {
        name: RIDE_CREATE_TERMS.createOrganizerProfileLink,
      }),
    ).toHaveAttribute('href', '/organizer/profile');
  },
};

export const MissingStartDark: Story = {
  ...MissingStart,
  globals: { theme: 'dark' },
};
