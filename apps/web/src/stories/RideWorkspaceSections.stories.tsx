import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect } from 'storybook/test';
import {
  ORGANIZER_GROUPS_TERMS,
  PARTICIPANTS_TERMS,
  RIDE_COVER_TERMS,
  RIDE_ROUTE_TERMS,
  RIDE_UPDATES_TERMS,
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
