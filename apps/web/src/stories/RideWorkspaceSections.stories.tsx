import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import {
  FINISH_CHECKIN_TERMS,
  ORGANIZER_GROUPS_TERMS,
  PARTICIPANTS_TERMS,
  RIDE_COVER_TERMS,
  RIDE_EDIT_TERMS,
  RIDE_READINESS_TERMS,
  RIDE_ROUTE_TERMS,
  RIDE_UPDATES_TERMS,
  ROUTE_POINT_TERMS,
  STOPS_TERMS,
} from 'ui';
import { CoverImageUploadForm } from '@/features/organizer/cover-image/components/CoverImageUploadForm';
import { GroupsEditor } from '@/features/organizer/groups/components/GroupsEditor';
import { ParticipantTable } from '@/features/organizer/participants/components/ParticipantTable';
import { WaitlistTable } from '@/features/organizer/participants/components/WaitlistTable';
import { RideWorkspace } from '@/features/organizer/rides/components/RideWorkspace';
import { RouteUploadForm } from '@/features/organizer/route/components/RouteUploadForm';
import { UpdateComposer } from '@/features/organizer/updates/components/UpdateComposer';
import { ORGANIZER_RIDE_SECTIONS } from '@/lib/cabinet/organizer-ride-sections';
import {
  GROUPS,
  RIDE_ID,
  ROUTE,
  participant,
  stubWorkspace,
  type WorkspaceStub,
} from './ride-workspace-fixtures';

// CR-187: the ride workspace's five sections — each a task heading with a
// concrete chip, then its own working area. Published states show results
// and say in words why they are fixed; nothing renders a dead upload field.

type Segment = 'route' | 'cover' | 'groups' | 'participants' | 'updates';

const CONTENT: Record<Segment, ReactNode> = {
  route: <RouteUploadForm rideId={RIDE_ID} />,
  cover: <CoverImageUploadForm rideId={RIDE_ID} />,
  groups: <GroupsEditor rideId={RIDE_ID} />,
  participants: (
    <>
      <ParticipantTable rideId={RIDE_ID} />
      <WaitlistTable rideId={RIDE_ID} />
    </>
  ),
  updates: <UpdateComposer rideId={RIDE_ID} />,
};

function Section({ segment }: { segment: Segment }) {
  return (
    <RideWorkspace
      rideId={RIDE_ID}
      current={segment}
      sections={ORGANIZER_RIDE_SECTIONS}
    >
      {CONTENT[segment]}
    </RideWorkspace>
  );
}

const meta = {
  title: 'Organizer/RideWorkspaceSections',
  component: Section,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Section>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Published route: lock notice, the real track sketch, «Скачать GPX». */
export const RoutePublished: Story = {
  args: { segment: 'route' },
  globals: { theme: 'dark' },
  beforeEach: stubWorkspace({
    ride: { status: 'registration_open' },
    detail: { route: ROUTE },
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(RIDE_ROUTE_TERMS.lockedTitle),
    ).toBeVisible();
    await expect(
      await canvas.findByRole('img', { name: RIDE_ROUTE_TERMS.sketchLabel }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('link', { name: RIDE_ROUTE_TERMS.downloadShort }),
    ).toHaveAttribute('href', `/api/v1/rides/${RIDE_ID}/route/download`);
    await expect(
      canvas.queryByLabelText(RIDE_ROUTE_TERMS.uploadLabel),
    ).not.toBeInTheDocument();
  },
};

/** Published, card and track disagree: a neutral reference line, not the
 * draft's yellow note — nothing on this screen can change either figure. */
export const RoutePublishedMismatch: Story = {
  args: { segment: 'route' },
  beforeEach: stubWorkspace({
    ride: {
      status: 'registration_open',
      distanceKm: 45,
      elevationGainMeters: 410,
    },
    detail: { route: ROUTE },
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(RIDE_ROUTE_TERMS.metricsMismatchLocked),
    ).toBeVisible();
    await expect(
      canvas.queryByText(RIDE_ROUTE_TERMS.metricsMismatch),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', {
        name: RIDE_ROUTE_TERMS.metricsSyncAction,
      }),
    ).not.toBeInTheDocument();
  },
};

/** Draft without a route: the upload stays, the chip asks for a track. */
export const RouteDraftEmpty: Story = {
  args: { segment: 'route' },
  beforeEach: stubWorkspace({ ride: { status: 'draft' } }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByLabelText(RIDE_ROUTE_TERMS.uploadLabel),
    ).toBeEnabled();
    await expect(canvas.getByText('Нет трека')).toBeVisible();
  },
};

const STOP = {
  id: 'stop-1',
  rideId: RIDE_ID,
  name: 'Кофейня у моста',
  description: null,
  lat: 55.75,
  lng: 37.62,
  durationMinutes: 20,
  position: 0,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  updatedBy: null,
};

const ROUTE_POINT = {
  id: 'point-1',
  rideId: RIDE_ID,
  type: 'water' as const,
  label: 'Родник у моста',
  description: null,
  lat: 55.76,
  lng: 37.63,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  updatedBy: null,
};

/** The open delete dialog, found in the page body (it is portalled out of
 * the story's canvas) and left open so the story's axe check covers it. */
async function openDeleteDialog(
  canvasElement: HTMLElement,
  trigger: HTMLElement,
  title: string,
) {
  trigger.click();
  const dialog = await within(canvasElement.ownerDocument.body).findByRole(
    'dialog',
    { name: title },
  );
  await expect(dialog).toHaveTextContent('Это действие необратимо.');
  return dialog;
}

/** CR-200 (KI-087): deleting the draft's GPX asks in the app's own dialog,
 * not the browser's `window.confirm`. */
export const RouteDeleteConfirm: Story = {
  args: { segment: 'route' },
  beforeEach: stubWorkspace({
    ride: { status: 'draft' },
    detail: { route: ROUTE },
  }),
  play: async ({ canvas, canvasElement }) => {
    const dialog = await openDeleteDialog(
      canvasElement,
      await canvas.findByRole('button', { name: RIDE_ROUTE_TERMS.delete }),
      RIDE_ROUTE_TERMS.deleteConfirmTitle,
    );
    await expect(
      within(dialog).getByRole('button', { name: RIDE_ROUTE_TERMS.deleteKeep }),
    ).toBeVisible();
  },
};

/** CR-200 (KI-087): a stop's row delete, same dialog, dark theme. */
export const StopDeleteConfirm: Story = {
  args: { segment: 'route' },
  globals: { theme: 'dark' },
  beforeEach: stubWorkspace({
    ride: { status: 'draft' },
    detail: { stops: [STOP] },
  }),
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByText(STOP.name);
    const row = canvas.getByText(STOP.name).closest('li')!;
    await openDeleteDialog(
      canvasElement,
      within(row).getByRole('button', { name: STOPS_TERMS.delete }),
      STOPS_TERMS.deleteConfirmTitle,
    );
  },
};

/** CR-200 (KI-087): a route point's row delete. */
export const RoutePointDeleteConfirm: Story = {
  args: { segment: 'route' },
  beforeEach: stubWorkspace({
    ride: { status: 'draft' },
    detail: { routePoints: [ROUTE_POINT] },
  }),
  play: async ({ canvas, canvasElement }) => {
    const label = await canvas.findByText(/Родник у моста/);
    const row = label.closest('li')!;
    await openDeleteDialog(
      canvasElement,
      within(row).getByRole('button', { name: ROUTE_POINT_TERMS.delete }),
      ROUTE_POINT_TERMS.deleteConfirmTitle,
    );
  },
};

/** Published without a cover: preview placeholder and the file rules. */
export const CoverPublished: Story = {
  args: { segment: 'cover' },
  beforeEach: stubWorkspace({ ride: { status: 'published' } }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(RIDE_COVER_TERMS.lockedTitle),
    ).toBeVisible();
    await expect(canvas.getByText(RIDE_COVER_TERMS.rulesTitle)).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: RIDE_COVER_TERMS.upload }),
    ).not.toBeInTheDocument();
  },
};

/** Draft: upload, with the same preview frame. */
export const CoverDraft: Story = {
  args: { segment: 'cover' },
  beforeEach: stubWorkspace({ ride: { status: 'draft' } }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('button', { name: RIDE_COVER_TERMS.upload }),
    ).toBeVisible();
  },
};

/** CR-200 (KI-087): deleting the draft's cover asks in the app's dialog. */
export const CoverDeleteConfirm: Story = {
  args: { segment: 'cover' },
  beforeEach: stubWorkspace({
    ride: { status: 'draft', coverImageUrl: `/v1/rides/${RIDE_ID}/cover` },
  }),
  play: async ({ canvas, canvasElement }) => {
    await openDeleteDialog(
      canvasElement,
      await canvas.findByRole('button', { name: RIDE_COVER_TERMS.delete }),
      RIDE_COVER_TERMS.deleteConfirmTitle,
    );
  },
};

/** Open ride: an occupied group says why it has no delete. */
export const GroupsEditable: Story = {
  args: { segment: 'groups' },
  beforeEach: stubWorkspace({ detail: { groups: GROUPS } }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(ORGANIZER_GROUPS_TERMS.occupiedNoDelete),
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', {
        name: ORGANIZER_GROUPS_TERMS.deleteAria('Темповая'),
      }),
    ).toBeVisible();
    await expect(
      canvas.getByText(ORGANIZER_GROUPS_TERMS.rulesHint),
    ).toBeVisible();
  },
};

/** Finished ride: groups closed, read-only list. */
export const GroupsLocked: Story = {
  args: { segment: 'groups' },
  beforeEach: stubWorkspace({
    ride: { status: 'finished', startsAt: '2026-09-20T05:00:00.000Z' },
    detail: { groups: GROUPS },
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(ORGANIZER_GROUPS_TERMS.lockedTitle),
    ).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: ORGANIZER_GROUPS_TERMS.addButton }),
    ).not.toBeInTheDocument();
  },
};

/** Before the start: the list and the waitlist, no finish marks yet. */
export const ParticipantsBeforeStart: Story = {
  args: { segment: 'participants' },
  globals: { theme: 'dark' },
  beforeEach: stubWorkspace({
    participants: [
      participant('reg-1', 'Анна К.'),
      participant('reg-2', 'Илья В.'),
    ],
    waitlist: [participant('wait-1', 'Олег С.')],
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(PARTICIPANTS_TERMS.beforeStartNoticeTitle),
    ).toBeVisible();
    await expect(
      await canvas.findByText('Олег С.', { exact: false }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: /Финиш/ }),
    ).not.toBeInTheDocument();
  },
};

/** CR-189: a started ride — every mark moves the chip beside the heading
 * («Не отмечено: N» → «Все отмечены») and the «нет итогового статуса» line,
 * without a reload. */
export const ParticipantsStartedMarking: Story = {
  args: { segment: 'participants' },
  beforeEach: stubWorkspace({
    ride: { status: 'started' },
    participants: [
      participant('reg-1', 'Анна К.'),
      participant('reg-2', 'Илья В.'),
    ],
    liveAttendance: true,
  }),
  play: async ({ canvas, userEvent }) => {
    const T = RIDE_READINESS_TERMS.participants;
    await expect(await canvas.findByText(T.unresolvedChip(2))).toBeVisible();
    const row = async (name: string) =>
      within(
        await canvas.findByRole('group', {
          name: FINISH_CHECKIN_TERMS.rowActionsLabel(name),
        }),
      );
    await userEvent.click(
      (await row('Анна К.')).getByRole('button', {
        name: FINISH_CHECKIN_TERMS.markDnf,
      }),
    );
    await expect(await canvas.findByText(T.unresolvedChip(1))).toBeVisible();
    await userEvent.click(
      (await row('Илья В.')).getByRole('button', {
        name: FINISH_CHECKIN_TERMS.confirmOne,
      }),
    );
    await expect(await canvas.findByText(T.allMarkedChip)).toBeVisible();
    await expect(
      canvas.queryByTestId('unresolved-before-finish'),
    ).not.toBeInTheDocument();
  },
};

/** CR-189: a finished ride with one rider still undecided — confirming the
 * last one turns «Не подтверждено: 1» into «Итоги подведены» at once. */
export const ParticipantsFinishedLastMark: Story = {
  args: { segment: 'participants' },
  globals: { theme: 'dark' },
  beforeEach: stubWorkspace({
    ride: { status: 'finished', startsAt: '2026-09-20T05:00:00.000Z' },
    participants: [
      participant('reg-1', 'Анна К.', { attendance: 'finished' }),
      participant('reg-2', 'Илья В.'),
    ],
    liveAttendance: true,
  }),
  play: async ({ canvas, userEvent }) => {
    const T = RIDE_READINESS_TERMS.participants;
    await expect(await canvas.findByText(T.unconfirmedChip(1))).toBeVisible();
    await userEvent.click(
      await canvas.findByRole('button', {
        name: FINISH_CHECKIN_TERMS.confirmOne,
      }),
    );
    await expect(await canvas.findByText(T.finishedChip)).toBeVisible();
    await expect(
      canvas.queryByText(T.unconfirmedChip(1)),
    ).not.toBeInTheDocument();
  },
};

/** CR-189: finishing with one rider undecided leaves a note and an open
 * «Не подтверждено: 1»; deciding that rider closes both without a reload. */
export const ParticipantsFinishThenLastMark: Story = {
  args: { segment: 'participants' },
  beforeEach: stubWorkspace({
    ride: { status: 'started' },
    participants: [
      participant('reg-1', 'Анна К.', { attendance: 'finished' }),
      participant('reg-2', 'Илья В.'),
    ],
    liveAttendance: true,
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const T = RIDE_READINESS_TERMS.participants;
    await userEvent.click(
      await canvas.findByRole('button', { name: RIDE_EDIT_TERMS.finish }),
    );
    const dialog = await within(canvasElement.ownerDocument.body).findByRole(
      'dialog',
      { name: FINISH_CHECKIN_TERMS.finishConfirmTitle },
    );
    await userEvent.click(
      within(dialog).getByRole('button', {
        name: FINISH_CHECKIN_TERMS.finishConfirmAction,
      }),
    );
    await expect(
      await canvas.findByText(FINISH_CHECKIN_TERMS.finishedWithUnresolved(1)),
    ).toBeVisible();
    await expect(await canvas.findByText(T.unconfirmedChip(1))).toBeVisible();

    await userEvent.click(
      await canvas.findByRole('button', {
        name: FINISH_CHECKIN_TERMS.confirmOne,
      }),
    );
    await expect(await canvas.findByText(T.finishedChip)).toBeVisible();
    await expect(
      canvas.queryByText(FINISH_CHECKIN_TERMS.finishedWithUnresolved(1)),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText(RIDE_EDIT_TERMS.finishSuccess)).toBeVisible();
  },
};

/** Nobody registered yet: honest empty lists. */
export const ParticipantsEmpty: Story = {
  args: { segment: 'participants' },
  beforeEach: stubWorkspace(),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(PARTICIPANTS_TERMS.participantsEmptyTitle),
    ).toBeVisible();
    await expect(
      await canvas.findByText(PARTICIPANTS_TERMS.waitlistEmptyTitle),
    ).toBeVisible();
  },
};

/** Writing an update: recipients, live preview; an empty one is refused. */
export const UpdatesComposer: Story = {
  args: { segment: 'updates' },
  beforeEach: stubWorkspace({
    participants: [participant('reg-1', 'Анна К.')],
  }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: RIDE_UPDATES_TERMS.send }),
    );
    await expect(
      await canvas.findByText(RIDE_UPDATES_TERMS.messageRequired),
    ).toBeVisible();
    await userEvent.type(
      canvas.getByLabelText(RIDE_UPDATES_TERMS.messageLabel),
      'Встречаемся у северного входа',
    );
    const preview = canvas.getByRole('complementary', {
      name: RIDE_UPDATES_TERMS.previewTitle,
    });
    await expect(preview).toHaveTextContent('Встречаемся у северного входа');
    await expect(
      canvas.getByText(RIDE_UPDATES_TERMS.recipients(1)),
    ).toBeVisible();
  },
};

/** CR-192: `POST /updates` as the API answers it — with the recipient count —
 * on top of the workspace stub. */
function stubSendUpdate(stub: WorkspaceStub, recipientsCount: number) {
  const stubReads = stubWorkspace(stub);
  return () => {
    const restoreReads = stubReads();
    const reads = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      const { pathname } = new URL(raw, window.location.href);
      const method = (
        init?.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase();
      if (
        method === 'POST' &&
        pathname === `/api/v1/rides/${RIDE_ID}/updates`
      ) {
        return new Response(
          JSON.stringify({
            rideUpdate: {
              id: 'u-new',
              rideId: RIDE_ID,
              message: 'Встречаемся у северного входа',
              createdAt: '2099-09-30T15:40:00.000Z',
            },
            recipientsCount,
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }
      return reads(input, init);
    };
    return restoreReads;
  };
}

async function sendUpdate(
  canvas: Parameters<NonNullable<Story['play']>>[0]['canvas'],
  userEvent: Parameters<NonNullable<Story['play']>>[0]['userEvent'],
) {
  await userEvent.type(
    await canvas.findByLabelText(RIDE_UPDATES_TERMS.messageLabel),
    'Встречаемся у северного входа',
  );
  await userEvent.click(
    canvas.getByRole('button', { name: RIDE_UPDATES_TERMS.send }),
  );
}

/** CR-192: nobody registered → the result says nobody receives it. */
export const UpdatesSentNoRecipients: Story = {
  args: { segment: 'updates' },
  beforeEach: stubSendUpdate({}, 0),
  play: async ({ canvas, userEvent }) => {
    await sendUpdate(canvas, userEvent);
    await expect(
      await canvas.findByText(RIDE_UPDATES_TERMS.sendSuccess(0)),
    ).toBeVisible();
    await expect(
      canvas.queryByText(/отправлено участникам/),
    ).not.toBeInTheDocument();
  },
};

/** CR-192: with riders the result is count-aware. */
export const UpdatesSentToRiders: Story = {
  args: { segment: 'updates' },
  beforeEach: stubSendUpdate(
    {
      participants: [
        participant('reg-1', 'Анна К.'),
        participant('reg-2', 'Илья В.'),
      ],
    },
    2,
  ),
  play: async ({ canvas, userEvent }) => {
    await sendUpdate(canvas, userEvent);
    await expect(
      await canvas.findByText(RIDE_UPDATES_TERMS.sendSuccess(2)),
    ).toBeVisible();
  },
};

/** A draft has nobody to write to: an explanation, no composer. */
export const UpdatesDraft: Story = {
  args: { segment: 'updates' },
  beforeEach: stubWorkspace({ ride: { status: 'draft' } }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(RIDE_UPDATES_TERMS.draftNoticeTitle),
    ).toBeVisible();
    await expect(
      canvas.queryByLabelText(RIDE_UPDATES_TERMS.messageLabel),
    ).not.toBeInTheDocument();
  },
};
