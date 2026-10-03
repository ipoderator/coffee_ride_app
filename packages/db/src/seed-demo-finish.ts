// CR-191. The finish-time steps of `seed-demo.ts`, kept apart so they can be
// unit-tested with a stubbed API call (importing `seed-demo.ts` itself runs the
// whole seed).
//
// Since CR-181 (ADR-027) a review needs the organizer's confirmed finish
// (`attendance = 'finished'`, otherwise `403 finish_not_confirmed`). So a ride
// that the seed finishes goes through what a real ride does: riders claim
// «I finished» while it is `started`, the organizer confirms the claims in one
// batch and records the other outcomes (`dnf` = «сошёл», `no_show`), the ride is
// finished, and only then the finished riders review it. Every step is a real
// API call — nothing is written to the tables — and every step is safe to
// repeat: finish claims, `confirm-claimed` and `PUT .../attendance` are
// idempotent on the API side and an existing review is skipped.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

// The seed's `api()` (session cookie + CSRF origin + 429 wait), as the steps
// below need it.
export type ApiCall = (
  method: string,
  path: string,
  options?: { session?: string; body?: unknown },
) => Promise<{ data: unknown }>;

export interface RegisteredRider {
  session: string;
  registrationId: string;
}

// Riders of a finished ride who did not finish. Everyone else who registered
// is a finisher.
export interface FinishOutcomes {
  dnf?: string[];
  noShow?: string[];
}

export interface FinishReview {
  rider: string;
  rating: number;
  comment?: string;
}

export function finisherKeys(
  riders: readonly string[],
  { dnf = [], noShow = [] }: FinishOutcomes = {},
): string[] {
  const notFinished = new Set([...dnf, ...noShow]);
  return riders.filter((key) => !notFinished.has(key));
}

// Fail before the first API call (and before the reset) when the seed data
// could not work: an outcome for a rider who is not registered, a rider with
// two outcomes, a review from someone the organizer will not confirm — or
// outcomes/reviews on a ride that is never finished, which would be silently
// dropped.
export function assertFinishPlan(
  title: string,
  plan: {
    finished: boolean;
    riders?: readonly string[];
    reviews?: readonly FinishReview[];
  } & FinishOutcomes,
): void {
  const { riders = [], dnf = [], noShow = [], reviews = [] } = plan;
  const fail = (message: string): never => {
    throw new Error(`seed ride «${title}»: ${message}`);
  };
  if (!plan.finished) {
    if (dnf.length || noShow.length || reviews.length)
      fail('outcomes and reviews need finalStatus "finished".');
    return;
  }
  for (const key of [...dnf, ...noShow]) {
    if (!riders.includes(key))
      fail(`${key} has an outcome but is not in riders.`);
  }
  for (const key of dnf) {
    if (noShow.includes(key)) fail(`${key} is both dnf and noShow.`);
  }
  const finishers = new Set(finisherKeys(riders, { dnf, noShow }));
  for (const review of reviews) {
    if (!finishers.has(review.rider))
      fail(`${review.rider} reviews the ride without a confirmed finish.`);
  }
}

function registered(
  riders: Map<string, RegisteredRider>,
  key: string,
): RegisteredRider {
  const rider = riders.get(key);
  if (!rider) throw new Error(`seed: ${key} has no registration on this ride.`);
  return rider;
}

// Call while the ride is `started` (claims and attendance are only accepted
// from the start on): finishers claim, the organizer confirms every claim and
// marks the riders who did not finish.
export async function recordAttendance(
  call: ApiCall,
  ride: {
    rideId: string;
    organizerSession: string;
    riders: Map<string, RegisteredRider>;
  } & FinishOutcomes,
): Promise<void> {
  const { rideId, organizerSession, riders, dnf = [], noShow = [] } = ride;
  const base = `/v1/rides/${rideId}`;

  for (const key of finisherKeys([...riders.keys()], { dnf, noShow })) {
    await call('POST', `${base}/finish-claim`, {
      session: registered(riders, key).session,
    });
  }
  await call('POST', `${base}/attendance/confirm-claimed`, {
    session: organizerSession,
  });

  for (const [attendance, keys] of [
    ['dnf', dnf],
    ['no_show', noShow],
  ] as const) {
    if (keys.length === 0) continue;
    await call('PUT', `${base}/attendance`, {
      session: organizerSession,
      body: {
        registrationIds: keys.map(
          (key) => registered(riders, key).registrationId,
        ),
        attendance,
      },
    });
  }
}

// Call once the ride is `finished`. A review that already exists (a repeated
// step) is not an error; anything else — a missing confirmation included — is.
export async function postReviews(
  call: ApiCall,
  ride: {
    rideId: string;
    riders: Map<string, RegisteredRider>;
    reviews: readonly FinishReview[];
  },
): Promise<void> {
  for (const review of ride.reviews) {
    try {
      await call('POST', `/v1/rides/${ride.rideId}/reviews`, {
        session: registered(ride.riders, review.rider).session,
        body: { rating: review.rating, comment: review.comment ?? null },
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'review_already_exists')
        continue;
      throw error;
    }
  }
}
