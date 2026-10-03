import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  assertFinishPlan,
  finisherKeys,
  postReviews,
  recordAttendance,
  type ApiCall,
  type RegisteredRider,
} from './seed-demo-finish.js';

const riders = new Map<string, RegisteredRider>([
  ['a', { session: 'sa', registrationId: 'ra' }],
  ['b', { session: 'sb', registrationId: 'rb' }],
  ['c', { session: 'sc', registrationId: 'rc' }],
  ['d', { session: 'sd', registrationId: 'rd' }],
]);

const stub = () => vi.fn<ApiCall>(async () => ({ data: undefined }));
const calls = (call: ReturnType<typeof stub>) =>
  call.mock.calls.map(([method, path, options]) => [
    method,
    path,
    options?.session,
    options?.body,
  ]);

describe('finisherKeys', () => {
  it('is everyone except dnf and no-show riders, in order', () => {
    expect(
      finisherKeys(['a', 'b', 'c', 'd'], { dnf: ['b'], noShow: ['d'] }),
    ).toEqual(['a', 'c']);
    expect(finisherKeys(['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('recordAttendance', () => {
  it('lets finishers claim, then confirms claims, then marks dnf / no_show', async () => {
    const call = stub();
    await recordAttendance(call, {
      rideId: 'ride1',
      organizerSession: 'org',
      riders,
      dnf: ['b'],
      noShow: ['d'],
    });
    expect(calls(call)).toEqual([
      ['POST', '/v1/rides/ride1/finish-claim', 'sa', undefined],
      ['POST', '/v1/rides/ride1/finish-claim', 'sc', undefined],
      ['POST', '/v1/rides/ride1/attendance/confirm-claimed', 'org', undefined],
      [
        'PUT',
        '/v1/rides/ride1/attendance',
        'org',
        { registrationIds: ['rb'], attendance: 'dnf' },
      ],
      [
        'PUT',
        '/v1/rides/ride1/attendance',
        'org',
        { registrationIds: ['rd'], attendance: 'no_show' },
      ],
    ]);
  });

  it('skips the attendance PUT when nobody dropped out', async () => {
    const call = stub();
    await recordAttendance(call, {
      rideId: 'ride1',
      organizerSession: 'org',
      riders,
    });
    const methods = calls(call).map(([method]) => method);
    expect(methods).toEqual(['POST', 'POST', 'POST', 'POST', 'POST']);
    expect(calls(call).at(-1)?.[1]).toBe(
      '/v1/rides/ride1/attendance/confirm-claimed',
    );
  });

  it('rejects an outcome for a rider without a registration', async () => {
    const call = stub();
    await expect(
      recordAttendance(call, {
        rideId: 'ride1',
        organizerSession: 'org',
        riders,
        dnf: ['zzz'],
      }),
    ).rejects.toThrow(/zzz has no registration/);
  });
});

describe('postReviews', () => {
  const reviews = [
    { rider: 'a', rating: 5, comment: 'Отлично' },
    { rider: 'c', rating: 4 },
  ];

  it('posts each review as its author', async () => {
    const call = stub();
    await postReviews(call, { rideId: 'ride1', riders, reviews });
    expect(calls(call)).toEqual([
      [
        'POST',
        '/v1/rides/ride1/reviews',
        'sa',
        { rating: 5, comment: 'Отлично' },
      ],
      ['POST', '/v1/rides/ride1/reviews', 'sc', { rating: 4, comment: null }],
    ]);
  });

  it('treats an existing review as done and carries on', async () => {
    const call = stub();
    call.mockRejectedValueOnce(
      new ApiError(409, 'review_already_exists', 'exists'),
    );
    await postReviews(call, { rideId: 'ride1', riders, reviews });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('does not hide other failures, such as an unconfirmed finish', async () => {
    const call = stub();
    call.mockRejectedValueOnce(
      new ApiError(403, 'finish_not_confirmed', 'not confirmed'),
    );
    await expect(
      postReviews(call, { rideId: 'ride1', riders, reviews }),
    ).rejects.toMatchObject({ code: 'finish_not_confirmed' });
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe('assertFinishPlan', () => {
  const finished = { finished: true, riders: ['a', 'b', 'c'] };

  it('accepts a consistent plan', () => {
    expect(() =>
      assertFinishPlan('ok', {
        ...finished,
        dnf: ['b'],
        reviews: [{ rider: 'a', rating: 5 }],
      }),
    ).not.toThrow();
  });

  it('rejects a review from a rider who did not finish', () => {
    expect(() =>
      assertFinishPlan('x', {
        ...finished,
        dnf: ['b'],
        reviews: [{ rider: 'b', rating: 3 }],
      }),
    ).toThrow(/b reviews the ride without a confirmed finish/);
  });

  it('rejects outcomes for unregistered riders and double outcomes', () => {
    expect(() => assertFinishPlan('x', { ...finished, noShow: ['q'] })).toThrow(
      /q has an outcome but is not in riders/,
    );
    expect(() =>
      assertFinishPlan('x', { ...finished, dnf: ['a'], noShow: ['a'] }),
    ).toThrow(/both dnf and noShow/);
  });

  it('rejects outcomes or reviews on a ride that is never finished', () => {
    expect(() =>
      assertFinishPlan('x', { finished: false, riders: ['a'], dnf: ['a'] }),
    ).toThrow(/need finalStatus "finished"/);
    expect(() =>
      assertFinishPlan('x', {
        finished: false,
        reviews: [{ rider: 'a', rating: 5 }],
      }),
    ).toThrow(/need finalStatus "finished"/);
  });
});
