import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import {
  FINISH_CHECKIN_TERMS,
  RIDE_EDIT_TERMS,
  RIDE_WORKSPACE_TERMS,
} from 'ui';
import { EditRideForm } from '@/features/organizer/rides/components/EditRideForm';
import { RideWorkspace } from '@/features/organizer/rides/components/RideWorkspace';
import { ORGANIZER_RIDE_SECTIONS } from '@/lib/cabinet/organizer-ride-sections';
import {
  GROUPS,
  RIDE_ID,
  ROUTE,
  participant,
  stubWorkspace,
} from './ride-workspace-fixtures';

// `/organizer/rides/[id]/edit` — the ride workspace's «Обзор» tab (CR-187):
// the frame (status, title, actions in priority order, six tabs) around the
// draft form or the published overview («Перед стартом» checklist, facts,
// contact, next step, cancel). Each story stubs `/api/v1/rides/ride-1/*`.

function OverviewTab() {
  return (
    <RideWorkspace
      rideId={RIDE_ID}
      current="edit"
      sections={ORGANIZER_RIDE_SECTIONS}
    >
      <EditRideForm />
    </RideWorkspace>
  );
}

const meta = {
  title: 'Organizer/RideManagement',
  component: OverviewTab,
  // CR-192: the draft form leaves the wizard through the app router.
  parameters: { layout: 'padded', nextjs: { appDirectory: true } },
} satisfies Meta<typeof OverviewTab>;
export default meta;
type Story = StoryObj<typeof meta>;

const FIVE = ['Анна К.', 'Илья В.', 'Мария Р.', 'Дмитрий О.', 'Ольга Н.'].map(
  (name, index) => participant(`reg-${index}`, name),
);

/** Draft: the «Перед публикацией» checklist above the full form. */
export const Draft: Story = {
  beforeEach: stubWorkspace({ ride: { status: 'draft' } }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('heading', {
        level: 2,
        name: RIDE_WORKSPACE_TERMS.overviewTitle.draft,
      }),
    ).toBeVisible();
    await expect(
      canvas.getByLabelText(RIDE_EDIT_TERMS.titleLabel),
    ).toBeEnabled();
    // No participants/updates rows: nobody can be registered on a draft.
    await expect(
      canvas.queryByRole('link', { name: 'Написать — Обновления' }),
    ).not.toBeInTheDocument();
  },
};

/** CR-192: no route on a draft: publishing asks first — the route can never
 * be added afterwards. Both ways out are there (Esc stays on the form). */
export const DraftPublishWithoutRoute: Story = {
  beforeEach: stubWorkspace({ ride: { status: 'draft' } }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: RIDE_EDIT_TERMS.publish }),
    );
    const dialog = await within(canvasElement.ownerDocument.body).findByRole(
      'dialog',
      { name: RIDE_EDIT_TERMS.publishNoRouteTitle },
    );
    await expect(dialog).toHaveTextContent(
      RIDE_EDIT_TERMS.publishNoRouteDescription,
    );
    await expect(
      within(dialog).getByRole('link', {
        name: RIDE_EDIT_TERMS.publishNoRouteAddRoute,
      }),
    ).toHaveAttribute('href', `/organizer/rides/${RIDE_ID}/route`);
    await expect(
      within(dialog).getByRole('button', {
        name: RIDE_EDIT_TERMS.publishNoRouteConfirm,
      }),
    ).toBeEnabled();
    // Left open: the story's a11y check then runs on the dialog itself.
  },
};

/** Published, registration not open yet: opening it is the primary action. */
export const Published: Story = {
  beforeEach: stubWorkspace({
    ride: { status: 'published', coverImageUrl: null },
    detail: { route: ROUTE, groups: GROUPS },
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('button', {
        name: RIDE_EDIT_TERMS.openRegistration,
      }),
    ).toBeVisible();
    await expect(
      canvas.queryByLabelText(RIDE_EDIT_TERMS.titleLabel),
    ).not.toBeInTheDocument();
    // CR-192: what stays editable — groups, contact, list visibility.
    await expect(
      canvas.getByText(RIDE_WORKSPACE_TERMS.factsHint),
    ).toBeVisible();
  },
};

/** Registration open: participants, write, close — in that order. */
export const RegistrationOpen: Story = {
  beforeEach: stubWorkspace({
    detail: { route: ROUTE, groups: GROUPS },
    participants: FIVE,
    updates: [
      {
        id: 'u-1',
        rideId: RIDE_ID,
        message: 'Встречаемся у северного входа в парк в 07:45.',
        createdAt: '2099-09-30T15:40:00.000Z',
        reschedule: null,
      },
    ],
  }),
  play: async ({ canvas, userEvent }) => {
    const actions = await canvas.findByRole('group', {
      name: RIDE_WORKSPACE_TERMS.actionsLabel,
    });
    await expect(
      within(actions).getByRole('link', { name: 'Участники · 5' }),
    ).toBeVisible();
    await expect(
      within(actions).getByRole('button', {
        name: RIDE_EDIT_TERMS.closeRegistration,
      }),
    ).toBeVisible();
    // Keyboard: the tabs are reachable and say which one is open.
    const overview = canvas.getByRole('link', {
      name: RIDE_WORKSPACE_TERMS.overviewTab,
    });
    await expect(overview).toHaveAttribute('aria-current', 'page');
    overview.focus();
    await userEvent.tab();
    await expect(
      canvas.getByRole('link', { name: RIDE_EDIT_TERMS.routeLink }),
    ).toHaveFocus();
  },
};

/** CR-195: «Отменить заезд» asks in the app's own dialog (not the browser's
 * confirm); left open so the story's a11y check runs on it. */
export const CancelConfirm: Story = {
  beforeEach: stubWorkspace({ ride: { status: 'registration_open' } }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: RIDE_EDIT_TERMS.cancel }),
    );
    const dialog = await within(canvasElement.ownerDocument.body).findByRole(
      'dialog',
      { name: RIDE_EDIT_TERMS.cancelConfirmTitle },
    );
    await expect(dialog).toHaveTextContent(
      RIDE_EDIT_TERMS.cancelConfirmDescription,
    );
    await expect(
      within(dialog).getByRole('button', { name: RIDE_EDIT_TERMS.cancelKeep }),
    ).toBeEnabled();
  },
};

/** No route, no cover, no groups, nobody registered — honest empty rows. */
export const NothingYet: Story = {
  beforeEach: stubWorkspace({ ride: { participantLimit: null } }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Без трека')).toBeVisible();
    await expect(canvas.getByText('Пока никто не записался')).toBeVisible();
    await expect(canvas.getByText('Обновлений пока нет')).toBeVisible();
  },
};

/** A long title wraps in full; nothing is truncated. */
export const LongTitle: Story = {
  beforeEach: stubWorkspace({
    ride: {
      title:
        'Гравий по выходным: Серебряный бор — Строгино — Крылатское — Мещерский парк и обратно через Татарово',
    },
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('heading', { level: 1 }),
    ).toHaveTextContent(/Татарово$/);
  },
};

/** The start time passed while registration is still open: flagged, unchanged. */
export const OverdueStart: Story = {
  beforeEach: stubWorkspace({ ride: { startsAt: '2026-10-01T05:00:00.000Z' } }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByTestId('overdue-start')).toBeVisible();
  },
};

/** Under way, with riders still without an outcome before finishing. */
export const Started: Story = {
  beforeEach: stubWorkspace({
    ride: { status: 'started', startsAt: '2026-10-02T05:00:00.000Z' },
    participants: FIVE,
    detail: {
      attendanceSummary: { finished: 2, dnf: 0, noShow: 0, unresolved: 3 },
    },
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('button', { name: RIDE_EDIT_TERMS.finish }),
    ).toBeVisible();
    await expect(canvas.getByTestId('unresolved-before-finish')).toBeVisible();
    await expect(canvas.getByText('Итоговый статус у 2 из 5')).toBeVisible();
  },
};

/** CR-185: finishing with riders still undecided asks first, naming how many. */
export const FinishConfirmation: Story = {
  beforeEach: stubWorkspace({
    ride: { status: 'started', startsAt: '2026-10-02T05:00:00.000Z' },
    participants: FIVE,
    detail: {
      attendanceSummary: { finished: 2, dnf: 0, noShow: 0, unresolved: 3 },
    },
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: RIDE_EDIT_TERMS.finish }),
    );
    const dialog = await within(canvasElement.ownerDocument.body).findByRole(
      'dialog',
      { name: FINISH_CHECKIN_TERMS.finishConfirmTitle },
    );
    await expect(dialog).toHaveTextContent(
      FINISH_CHECKIN_TERMS.finishConfirmUnresolved(3),
    );
    await userEvent.click(
      within(dialog).getByRole('button', {
        name: FINISH_CHECKIN_TERMS.finishConfirmCancel,
      }),
    );
  },
};

/** Finished: the tally, no lifecycle step and no cancel card. */
export const Finished: Story = {
  beforeEach: stubWorkspace({
    ride: { status: 'finished', startsAt: '2026-09-20T05:00:00.000Z' },
    participants: FIVE,
    detail: {
      attendanceSummary: { finished: 4, dnf: 1, noShow: 0, unresolved: 0 },
    },
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(RIDE_EDIT_TERMS.nextActionHint.finished),
    ).toBeVisible();
    await expect(
      canvas.getByText('Финиш: 4 · сошли: 1 · не пришли: 0'),
    ).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: RIDE_EDIT_TERMS.cancel }),
    ).not.toBeInTheDocument();
    // CR-192: the groups are closed too.
    await expect(
      canvas.getByText(RIDE_WORKSPACE_TERMS.factsHintClosed),
    ).toBeVisible();
  },
};

/** Cancelled: status in words, nothing left to start or finish. */
export const Cancelled: Story = {
  beforeEach: stubWorkspace({ ride: { status: 'cancelled' } }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('heading', {
        level: 2,
        name: RIDE_WORKSPACE_TERMS.overviewTitle.cancelled,
      }),
    ).toBeVisible();
    const actions = canvas.getByRole('group', {
      name: RIDE_WORKSPACE_TERMS.actionsLabel,
    });
    await expect(within(actions).queryAllByRole('button')).toHaveLength(0);
  },
};

/** The ride can't be read: a retry, no half-rendered section. */
export const LoadError: Story = {
  beforeEach: stubWorkspace({ failRide: true }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(RIDE_WORKSPACE_TERMS.loadError),
    ).toBeVisible();
  },
};
