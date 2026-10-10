import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AdminUserPage from './page';

vi.mock('@/features/admin/users/components/AdminUserCard', () => ({
  AdminUserCard: () => null,
}));

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
);
vi.mock('next/navigation', () => ({ notFound }));

const USER_ID = '0b5c3f7e-2d4a-4c1b-9e8f-1a2b3c4d5e6f';

type CardProps = { userId: string; backHref: string };

async function cardProps(
  searchParams: Record<string, string | string[]>,
  id = USER_ID,
) {
  const element = (await AdminUserPage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(searchParams),
  })) as ReactElement<CardProps>;
  return element.props;
}

describe('/admin/users/[id] page (CR-232)', () => {
  it('turns `?from=` into a back link to the same users list', async () => {
    expect(await cardProps({ from: 'q=rider&filter=blocked' })).toMatchObject({
      userId: USER_ID,
      backHref: '/admin/users?q=rider&filter=blocked',
    });
  });

  it('falls back to the plain list for a missing, repeated or hostile `from`', async () => {
    const cases: Array<Record<string, string | string[]>> = [
      {},
      { from: ['q=a', 'q=b'] },
      { from: 'https://evil.example' },
    ];
    for (const searchParams of cases) {
      expect((await cardProps(searchParams)).backHref).toBe('/admin/users');
    }
  });

  // The API answers a malformed id with 400 (a retryable-looking load error on
  // the card); an encoded `../` must not steer the card's fetch elsewhere.
  it('404s a malformed or path-like id before rendering the card', async () => {
    for (const id of ['abc', 'x/../../overview', `${USER_ID}x`]) {
      await expect(cardProps({}, id)).rejects.toThrow('NEXT_NOT_FOUND');
    }
    expect(notFound).toHaveBeenCalledTimes(3);
  });

  // This server page calls the URL helpers directly; a `'use client'` module
  // would hand it client references instead of functions (a 500 in the real
  // app that jsdom cannot reproduce).
  it('builds the back link from helpers that are not client modules', () => {
    for (const file of [
      '../../../../lib/admin/url-filters.ts',
      '../../../../features/admin/users/filters.ts',
    ]) {
      const source = readFileSync(resolve(__dirname, file), 'utf8');
      expect(source).not.toMatch(/^\s*['"]use client['"]/);
    }
  });
});
