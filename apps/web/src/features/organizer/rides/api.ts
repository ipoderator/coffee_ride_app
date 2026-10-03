import {
  createRideRequestSchema,
  rescheduleRideRequestSchema,
  setRideContactRequestSchema,
  updateRideRequestSchema,
  type CancelRideResponse,
  type CloseRegistrationResponse,
  type CreateRideRequest,
  type CreateRideResponse,
  type FinishRideResponse,
  type GetRideResponse,
  type ListRideUpdatesResponse,
  type ListRidesResponse,
  type OpenRegistrationResponse,
  type ProblemDetails,
  type PublishRideResponse,
  type RescheduleRideRequest,
  type RescheduleRideResponse,
  type RideContactInput,
  type RideUpdate,
  type SetParticipantsVisibilityResponse,
  type SetRideContactResponse,
  type StartRideResponse,
  type UpdateRideRequest,
  type UpdateRideResponse,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export {
  createRideRequestSchema,
  rescheduleRideRequestSchema,
  setRideContactRequestSchema,
  updateRideRequestSchema,
  ApiError,
};
export type {
  CancelRideResponse,
  CloseRegistrationResponse,
  CreateRideRequest,
  CreateRideResponse,
  FinishRideResponse,
  ListRidesResponse,
  OpenRegistrationResponse,
  PublishRideResponse,
  RescheduleRideRequest,
  RescheduleRideResponse,
  StartRideResponse,
  UpdateRideRequest,
  UpdateRideResponse,
};

const RIDES_ENDPOINT = '/api/v1/rides';

/**
 * Typed client for this feature only (`.claude/rules/extensibility.md`). Throws
 * `ApiError` on any non-2xx response, including the expected
 * `organizer_profile_required` 403 — `CreateRideForm` catches that one specifically
 * to show a guiding message instead of a generic error.
 */
export async function createRide(
  payload: CreateRideRequest,
): Promise<CreateRideResponse> {
  const response = await fetch(RIDES_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as CreateRideResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as CreateRideResponse;
}

/**
 * CR-088 ("Organizer rides list"): the caller's own rides, any status. Always fetches
 * one page — `RidesList` doesn't offer "load more" yet (no product requirement for it
 * this ticket; the underlying API is already cursor-paginated per ADR-011 for when it
 * does).
 */
export async function listMyRides(
  params: { limit?: number; cursor?: string } = {},
): Promise<ListRidesResponse> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor !== undefined) query.set('cursor', params.cursor);
  const queryString = query.toString();

  const response = await fetch(
    `${RIDES_ENDPOINT}/mine${queryString ? `?${queryString}` : ''}`,
  );

  const body = (await response.json()) as ListRidesResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as ListRidesResponse;
}

/** CR-016/CR-018: 404s `ride_not_found` only for a non-existent id or a `draft` ride
 * viewed by anyone but its own organizer — CR-023 made this the shared public
 * ride-detail endpoint, so a published/non-draft ride owned by someone else answers
 * 200. `isOwner` (KI-069) is what `EditRideForm` uses to show its own not-found state
 * for that case instead of rendering the edit form/lifecycle controls. */
type EditableRide = Pick<
  GetRideResponse,
  'ride' | 'isOwner' | 'requirements' | 'contact'
> &
  // CR-182: optional here so ownership-only callers need not supply it.
  // CR-184: `registrationsCount` likewise, for the management view's summary.
  // CR-187: the workspace's checklist reads the rest; the API always sends
  // them, the workspace defaults any that are missing.
  Partial<
    Pick<
      GetRideResponse,
      | 'attendanceSummary'
      | 'registrationsCount'
      | 'lastReschedule'
      | 'route'
      | 'stops'
      | 'routePoints'
      | 'groups'
      | 'waitlistCount'
    >
  >;

export async function getRide(id: string): Promise<EditableRide> {
  const response = await fetch(`${RIDES_ENDPOINT}/${id}`);

  const body = (await response.json()) as EditableRide | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as EditableRide;
}

/** CR-187: the newest sent update (`null` when none) — the workspace shows
 * when the last message went out. Organizer-only, like the full history. */
export async function getLatestRideUpdate(
  rideId: string,
): Promise<RideUpdate | null> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}/updates?limit=1`);
  const body = (await response.json()) as
    ListRideUpdatesResponse | ProblemDetails;
  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }
  return (body as ListRideUpdatesResponse).items[0] ?? null;
}

export async function updateRide(
  id: string,
  payload: UpdateRideRequest,
): Promise<UpdateRideResponse> {
  const response = await fetch(`${RIDES_ENDPOINT}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as UpdateRideResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as UpdateRideResponse;
}

/**
 * KI-065: the riders-list toggle at any status (`PATCH` is draft-only). Throws
 * `ApiError`, including `participants_visibility_locked` (409) when showing a
 * list people joined while it was hidden.
 */
export async function setParticipantsVisibility(
  id: string,
  participantsVisible: boolean,
): Promise<SetParticipantsVisibilityResponse> {
  const response = await fetch(
    `${RIDES_ENDPOINT}/${id}/participants-visibility`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantsVisible }),
    },
  );

  const body = (await response.json()) as
    SetParticipantsVisibilityResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as SetParticipantsVisibilityResponse;
}

/**
 * CR-165: the organizer contact at any status (`PATCH` is draft-only) — a contact
 * that goes stale after publication is exactly when it must stay fixable.
 * `null` clears it.
 */
export async function setRideContact(
  id: string,
  contact: RideContactInput | null,
): Promise<SetRideContactResponse> {
  const response = await fetch(`${RIDES_ENDPOINT}/${id}/contact`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contact }),
  });

  const body = (await response.json()) as
    SetRideContactResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as SetRideContactResponse;
}

/**
 * CR-019 ("Publish ride"): `draft -> published`. Throws `ApiError` on any non-2xx
 * response, including the expected `email_verification_required` 403 —
 * `EditRideForm` catches that one specifically, same pattern
 * `OrganizerProfileForm` already established for the same code.
 */
export async function publishRide(id: string): Promise<PublishRideResponse> {
  const response = await fetch(`${RIDES_ENDPOINT}/${id}/publish`, {
    method: 'POST',
  });

  const body = (await response.json()) as PublishRideResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as PublishRideResponse;
}

/**
 * CR-089 ("Open registration"): `published -> registration_open`. Throws `ApiError`
 * on any non-2xx response, including the expected
 * `ride_registration_not_openable` 409.
 */
export async function openRegistration(
  id: string,
): Promise<OpenRegistrationResponse> {
  const response = await fetch(`${RIDES_ENDPOINT}/${id}/open-registration`, {
    method: 'POST',
  });

  const body = (await response.json()) as
    OpenRegistrationResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as OpenRegistrationResponse;
}

/**
 * CR-020 ("Close registration"): `registration_open -> registration_closed`. Throws
 * `ApiError` on any non-2xx response, including the expected
 * `ride_registration_not_closable` 409.
 */
export async function closeRegistration(
  id: string,
): Promise<CloseRegistrationResponse> {
  const response = await fetch(`${RIDES_ENDPOINT}/${id}/close-registration`, {
    method: 'POST',
  });

  const body = (await response.json()) as
    CloseRegistrationResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as CloseRegistrationResponse;
}

/**
 * CR-021 ("Cancel ride"): `published/registration_open/registration_closed ->
 * cancelled`. Throws `ApiError` on any non-2xx response, including the expected
 * `ride_not_cancellable` 409.
 */
export async function cancelRide(id: string): Promise<CancelRideResponse> {
  const response = await fetch(`${RIDES_ENDPOINT}/${id}/cancel`, {
    method: 'POST',
  });

  const body = (await response.json()) as CancelRideResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as CancelRideResponse;
}

/**
 * CR-190 (ADR-029 draft): moves a published ride's start before it starts.
 * Throws `ApiError` on any non-2xx response — the expected ones are 409
 * `ride_not_reschedulable` (started/finished/cancelled meanwhile), 422
 * `reschedule_start_in_past`/`reschedule_start_unchanged` and 400
 * `validation_error`.
 */
export async function rescheduleRide(
  id: string,
  payload: RescheduleRideRequest,
): Promise<RescheduleRideResponse> {
  const response = await fetch(`${RIDES_ENDPOINT}/${id}/reschedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as
    RescheduleRideResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as RescheduleRideResponse;
}

/**
 * CR-090 ("Start ride"): `registration_closed -> started`. Throws `ApiError` on any
 * non-2xx response, including the expected `ride_not_startable` 409.
 */
export async function startRide(id: string): Promise<StartRideResponse> {
  const response = await fetch(`${RIDES_ENDPOINT}/${id}/start`, {
    method: 'POST',
  });

  const body = (await response.json()) as StartRideResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as StartRideResponse;
}

/**
 * CR-022 ("Finish ride"): `started -> finished`. Throws `ApiError` on any non-2xx
 * response, including the expected `ride_not_finishable` 409.
 */
export async function finishRide(id: string): Promise<FinishRideResponse> {
  const response = await fetch(`${RIDES_ENDPOINT}/${id}/finish`, {
    method: 'POST',
  });

  const body = (await response.json()) as FinishRideResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as FinishRideResponse;
}

/**
 * CR-156: the wizard's step-1 GPX drop zone. Same `POST`/`PATCH
 * /v1/rides/:id/route` endpoints `RouteUploadForm` uses (kept here rather
 * than imported from the route feature — ADR-009, no feature-to-feature
 * imports). A draft saved twice from step 1 may already have a route, so a
 * 409 `route_already_exists` falls through to a replace.
 */
export async function uploadRideGpx(rideId: string, file: File): Promise<void> {
  try {
    await sendGpx('POST', rideId, file);
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.problem.code === 'route_already_exists'
    ) {
      await sendGpx('PATCH', rideId, file);
      return;
    }
    throw error;
  }
}

async function sendGpx(
  method: 'POST' | 'PATCH',
  rideId: string,
  file: File,
): Promise<void> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}/route`, {
    method,
    body: formData,
  });

  if (!response.ok) {
    const body = (await response.json()) as ProblemDetails;
    throw new ApiError(body);
  }
}
