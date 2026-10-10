import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Paginated } from 'types';
import { ADMIN_TERMS } from 'ui';
import { ApiError } from '@/lib/api/errors';
import { adminProblem } from '@/test-support/admin';
import { ADMIN_NAV_ITEMS } from './admin-nav';
import { adminRequest, toQueryString } from './client';
import { adminActionErrorMessage } from './errors';
import { formatAdminCount } from './format';
import { useAdminList } from './use-admin-list';
import { ADMIN_VISIBILITY_OPTIONS } from './visibility';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('adminRequest', () => {
  it('sends JSON to the same-origin admin API and returns the body', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ ok: true }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      adminRequest('/users/u1/block', {
        method: 'POST',
        body: { reason: 'x' },
      }),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/admin/users/u1/block', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: '{"reason":"x"}',
    });
  });

  it('sends a bodiless POST without a content type, and reads a 204 as nothing', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 204 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      adminRequest('/users/u1/resend-verification', { method: 'POST' }),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/admin/users/u1/resend-verification',
      { method: 'POST', cache: 'no-store' },
    );
  });

  it('throws the problem as an ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { code: 'not_found', status: 404, detail: 'Not found.' },
          { status: 404 },
        ),
      ),
    );
    const error = await adminRequest('/users/u1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).problem.code).toBe('not_found');
  });

  it('turns an error without a problem body (proxy HTML, empty 500) into an ApiError with its status', async () => {
    for (const response of [
      new Response('<html>Bad gateway</html>', {
        status: 502,
        statusText: 'Bad Gateway',
      }),
      new Response('', { status: 500 }),
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response),
      );
      const error = await adminRequest('/users/u1').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).problem).toMatchObject({
        status: response.status,
        code: 'unexpected_response',
      });
    }
  });
});

describe('toQueryString', () => {
  it('keeps only the set values', () => {
    expect(toQueryString({ q: 'аня', filter: undefined, cursor: '' })).toBe(
      '?q=%D0%B0%D0%BD%D1%8F',
    );
    expect(toQueryString({ limit: 20 })).toBe('?limit=20');
    expect(toQueryString({})).toBe('');
  });
});

describe('adminActionErrorMessage', () => {
  it('names the two known conflicts and never shows the API’s English', () => {
    expect(
      adminActionErrorMessage(adminProblem(409, 'cannot_block_admin')),
    ).toBe(ADMIN_TERMS.adminCannotBeBlocked);
    expect(
      adminActionErrorMessage(adminProblem(409, 'ride_not_cancellable')),
    ).toBe(ADMIN_TERMS.rideNotCancellable);
    expect(adminActionErrorMessage(adminProblem(500, 'internal_error'))).toBe(
      ADMIN_TERMS.actionError,
    );
    expect(adminActionErrorMessage(new TypeError('fetch failed'))).toBe(
      ADMIN_TERMS.actionError,
    );
  });
});

describe('admin registries and formatting', () => {
  it('orders the sidebar with «Обзор» as the root', () => {
    expect(ADMIN_NAV_ITEMS.map((item) => item.href)).toEqual([
      '/admin',
      '/admin/users',
      '/admin/rides',
      '/admin/reviews',
      '/admin/actions',
    ]);
    expect(ADMIN_NAV_ITEMS.every((item) => item.icon)).toBe(true);
  });

  it('labels every visibility option', () => {
    expect(ADMIN_VISIBILITY_OPTIONS.map((option) => option.label)).toEqual([
      ADMIN_TERMS.visibility.all,
      ADMIN_TERMS.visibility.visible,
      ADMIN_TERMS.visibility.hidden,
    ]);
  });

  it('groups thousands the Russian way', () => {
    expect(formatAdminCount(12345).replace(/\s/g, ' ')).toBe('12 345');
  });
});

type Row = { id: string; label: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useAdminList', () => {
  it('drops a response that lost the race to a newer filter', async () => {
    const slow = deferred<Paginated<Row>>();
    const fetchPage = vi.fn((key: string) =>
      key === 'old'
        ? slow.promise
        : Promise.resolve({
            items: [{ id: '2', label: 'new' }],
            nextCursor: null,
          }),
    );
    const { result, rerender } = renderHook(
      ({ filter }) => useAdminList<Row>(filter, () => fetchPage(filter)),
      { initialProps: { filter: 'old' } },
    );
    expect(result.current.state.status).toBe('loading');

    rerender({ filter: 'new' });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    await act(async () => {
      slow.resolve({ items: [{ id: '1', label: 'old' }], nextCursor: null });
      await slow.promise;
    });
    expect(result.current.state).toMatchObject({
      status: 'ready',
      items: [{ id: '2', label: 'new' }],
    });
  });

  it('replaces one row in place and ignores a load-more without a next page', async () => {
    const fetchPage = vi.fn(async () => ({
      items: [
        { id: '1', label: 'a' },
        { id: '2', label: 'b' },
      ],
      nextCursor: null,
    }));
    const { result } = renderHook(() => useAdminList<Row>('k', fetchPage));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    act(() => result.current.replace({ id: '2', label: 'B' }));
    act(() => result.current.loadMore());
    expect(result.current.state).toMatchObject({
      items: [
        { id: '1', label: 'a' },
        { id: '2', label: 'B' },
      ],
    });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
