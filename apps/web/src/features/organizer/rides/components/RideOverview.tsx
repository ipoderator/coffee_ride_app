'use client';

import { useId, useState } from 'react';
import type { Ride } from 'types';
import {
  BICYCLE_TYPE_TERMS,
  Button,
  Card,
  formatDistance,
  formatElevation,
  formatGroupPace,
  formatPrice,
  formatRideStartLine,
  formatStartPlace,
  FormField,
  RIDE_EDIT_TERMS,
  RIDE_WORKSPACE_TERMS,
} from 'ui';
import type { RideWorkspaceContextValue } from '@/lib/cabinet/ride-workspace';
import { isRideOverdue } from '@/lib/rides/overdue';
import {
  ApiError,
  cancelRide,
  setParticipantsVisibility,
  setRideContact,
  setRideContactRequestSchema,
} from '../api';
import {
  RideContactFields,
  rideContactFromResponse,
  rideContactToRequest,
  type RideContactDraft,
} from './RideContactFields';
import { RideReadinessList } from './RideReadinessList';

const CANCELLABLE_STATUSES: ReadonlyArray<Ride['status']> = [
  'published',
  'registration_open',
  'registration_closed',
];

type Message = { tone: 'success' | 'danger'; text: string } | null;

function MessageLine({ message }: { message: Message }) {
  if (!message) return null;
  return message.tone === 'success' ? (
    <p role="status" className="text-body-sm text-success">
      {message.text}
    </p>
  ) : (
    <p role="alert" className="text-body-sm text-danger">
      {message.text}
    </p>
  );
}

/**
 * CR-187: the overview tab of a published (or later) ride — the spec's
 * «Перед стартом»: what is ready per section, the fixed facts, the two
 * settings the server still accepts (contact — KI-081; participants
 * visibility — KI-065) and the next step; the red cancel last. Never a
 * locked copy of the draft form (CR-184). Lifecycle steps live in the
 * workspace head, so they are on every tab.
 */
export function RideOverview({
  workspace,
}: {
  workspace: RideWorkspaceContextValue;
}) {
  const { data, sections, applyRide } = workspace;
  const { ride } = data;
  const rideId = ride.id;
  const headingId = useId();

  const [contact, setContact] = useState<RideContactDraft>(() =>
    rideContactFromResponse(data.contact),
  );
  const [contactError, setContactError] = useState<string | undefined>();
  const [contactMessage, setContactMessage] = useState<Message>(null);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [visibilityMessage, setVisibilityMessage] = useState<Message>(null);
  const [isSavingVisibility, setIsSavingVisibility] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  /** KI-081: the contact's own `PUT /v1/rides/:id/contact`, any status. */
  async function handleSaveContact() {
    if (isSavingContact) return;
    const parsed = setRideContactRequestSchema.safeParse({
      contact: rideContactToRequest(contact),
    });
    setContactMessage(null);
    if (!parsed.success) {
      // The schema reports the value's own failure at `contact.value`; the
      // form shows it on the single visible input either way.
      setContactError(parsed.error.issues[0]?.message);
      return;
    }
    setContactError(undefined);
    setIsSavingContact(true);
    try {
      const response = await setRideContact(rideId, parsed.data.contact);
      applyRide(response.ride);
      setContactMessage({
        tone: 'success',
        text: RIDE_EDIT_TERMS.contactSaved,
      });
    } catch (error) {
      // A 404 means "not found or not yours" — never revealed which.
      setContactMessage({
        tone: 'danger',
        text:
          error instanceof ApiError
            ? RIDE_EDIT_TERMS.contactSaveError
            : RIDE_EDIT_TERMS.loadError,
      });
    } finally {
      setIsSavingContact(false);
    }
  }

  /** KI-065: saves on its own; the server refuses to re-show a list people
   * joined while it was hidden. */
  async function handleVisibilityChange(checked: boolean) {
    if (isSavingVisibility) return;
    setVisibilityMessage(null);
    setIsSavingVisibility(true);
    try {
      const response = await setParticipantsVisibility(rideId, checked);
      applyRide(response.ride);
      setVisibilityMessage({
        tone: 'success',
        text: RIDE_EDIT_TERMS.participantsVisibilitySaved,
      });
    } catch (error) {
      setVisibilityMessage({
        tone: 'danger',
        text:
          error instanceof ApiError &&
          error.problem.code === 'participants_visibility_locked'
            ? RIDE_EDIT_TERMS.participantsVisibilityLocked
            : RIDE_EDIT_TERMS.loadError,
      });
    } finally {
      setIsSavingVisibility(false);
    }
  }

  /** CR-021: the one dead end, so a native confirm first (`docs/design.md`
   * §1's destructive exception). */
  async function handleCancel() {
    if (isCancelling) return;
    if (!window.confirm(RIDE_EDIT_TERMS.cancelConfirm)) return;
    setCancelError(null);
    setIsCancelling(true);
    try {
      const response = await cancelRide(rideId);
      applyRide(response.ride, RIDE_EDIT_TERMS.cancelSuccess);
    } catch {
      setCancelError(RIDE_EDIT_TERMS.loadError);
      setIsCancelling(false);
    }
  }

  const status = ride.status;
  // The workspace renders the draft form instead; this narrows the type.
  if (status === 'draft') return null;

  const timeZone = ride.startTimezone;
  const startsAt = new Date(ride.startsAt);
  const startPoint = data.routePoints.find((point) => point.type === 'start');
  const startPlace = formatStartPlace(
    startPoint?.label,
    startPoint?.description,
  );
  const routeFact = data.route
    ? RIDE_WORKSPACE_TERMS.factRouteValue(
        formatDistance(data.route.distanceKm),
        formatElevation(data.route.elevationGainMeters),
      )
    : RIDE_WORKSPACE_TERMS.factRouteValue(
        formatDistance(ride.distanceKm),
        ride.elevationGainMeters === null
          ? null
          : formatElevation(ride.elevationGainMeters),
      );
  const facts: Array<[string, string]> = [
    [
      RIDE_WORKSPACE_TERMS.factStart,
      [formatRideStartLine(startsAt, { timeZone }), startPlace]
        .filter(Boolean)
        .join(' · '),
    ],
    [RIDE_WORKSPACE_TERMS.factBicycle, BICYCLE_TYPE_TERMS[ride.bicycleType]],
    [RIDE_WORKSPACE_TERMS.factRoute, routeFact],
    [
      RIDE_WORKSPACE_TERMS.factGroups,
      data.groups.length > 0
        ? data.groups
            .map((group) => `${group.name} ${formatGroupPace(group.paceKmh)}`)
            .join(' · ')
        : RIDE_WORKSPACE_TERMS.factNoGroups,
    ],
    [
      RIDE_WORKSPACE_TERMS.factPlaces,
      ride.participantLimit === null
        ? RIDE_WORKSPACE_TERMS.factPlacesUnlimited(
            data.registrationsCount,
            data.waitlistCount,
          )
        : RIDE_WORKSPACE_TERMS.factPlacesLimited(
            data.registrationsCount,
            ride.participantLimit,
            data.waitlistCount,
          ),
    ],
    [RIDE_WORKSPACE_TERMS.factPrice, formatPrice(ride.priceRub)],
  ];

  return (
    <>
      <section aria-labelledby={headingId} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="text-h2 text-text">
            {RIDE_WORKSPACE_TERMS.overviewTitle[status]}
          </h2>
          <p className="max-w-2xl text-body-sm text-text-secondary">
            {RIDE_WORKSPACE_TERMS.overviewDescription[status]}
          </p>
        </div>
        <RideReadinessList
          rideId={rideId}
          sections={sections}
          data={data}
          labelledBy={headingId}
        />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-4">
          <h2 className="text-h3 text-text">
            {RIDE_WORKSPACE_TERMS.factsTitle}
          </h2>
          <dl className="flex flex-col divide-y divide-border text-body-sm">
            {facts.map(([label, value]) => (
              <div
                key={label}
                className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-2.5 first:pt-0"
              >
                <dt className="text-text-secondary">{label}</dt>
                <dd className="text-text tabular-nums wrap-anywhere">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-body-sm text-text-muted">
            {RIDE_WORKSPACE_TERMS.factsHint}
          </p>
        </Card>

        <Card className="flex flex-col gap-5">
          <h2 className="text-h3 text-text">
            {RIDE_WORKSPACE_TERMS.contactTitle}
          </h2>
          <fieldset className="flex flex-col gap-4 border-0 p-0">
            <legend className="sr-only">{RIDE_EDIT_TERMS.contactLabel}</legend>
            <RideContactFields
              idPrefix="ride-edit"
              value={contact}
              onChange={setContact}
              disabled={isSavingContact}
              error={contactError}
              hint={RIDE_EDIT_TERMS.contactHintPublished}
            />
            <Button
              type="button"
              variant="secondary"
              isLoading={isSavingContact}
              onClick={handleSaveContact}
              className="self-start"
            >
              {isSavingContact
                ? RIDE_EDIT_TERMS.contactSavePending
                : RIDE_EDIT_TERMS.contactSave}
            </Button>
            <MessageLine message={contactMessage} />
          </fieldset>

          <div className="flex flex-col gap-2 border-t border-border pt-5">
            <FormField
              id="ride-participants-visible"
              label={RIDE_EDIT_TERMS.participantsVisibleLabel}
              hint={RIDE_EDIT_TERMS.participantsVisibleHintPublished}
            >
              <input
                type="checkbox"
                checked={ride.participantsVisible}
                onChange={(event) =>
                  void handleVisibilityChange(event.target.checked)
                }
                disabled={isSavingVisibility}
                className="size-5 rounded border-[1.5px] border-frame accent-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
            </FormField>
            <MessageLine message={visibilityMessage} />
          </div>

          <div className="flex flex-col gap-2 border-t border-border pt-5">
            <h3 className="text-body font-semibold text-text">
              {RIDE_WORKSPACE_TERMS.nextStepTitle}
            </h3>
            {isRideOverdue(ride, new Date()) && (
              <p
                className="text-body-sm text-warning"
                data-testid="overdue-start"
              >
                {RIDE_EDIT_TERMS.overdueStart(
                  formatRideStartLine(startsAt, { timeZone }),
                )}
              </p>
            )}
            <p className="text-body-sm text-text-secondary">
              {RIDE_EDIT_TERMS.nextActionHint[status]}
            </p>
          </div>
        </Card>
      </div>

      {CANCELLABLE_STATUSES.includes(status) && (
        <Card className="flex flex-col items-start gap-3">
          <h2 className="text-h3 text-text">{RIDE_EDIT_TERMS.dangerTitle}</h2>
          {cancelError && (
            <p role="alert" className="text-body-sm text-danger">
              {cancelError}
            </p>
          )}
          <Button
            type="button"
            variant="danger"
            isLoading={isCancelling}
            onClick={handleCancel}
          >
            {isCancelling
              ? RIDE_EDIT_TERMS.cancelPending
              : RIDE_EDIT_TERMS.cancel}
          </Button>
        </Card>
      )}
    </>
  );
}
