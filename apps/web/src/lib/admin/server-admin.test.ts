import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const incoming = new Headers();
vi.mock('next/headers', () => ({ headers: async () => incoming }));

const { lookupAdminAccess } = await import('./server-admin');
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  for (const key of [...incoming.keys()]) incoming.delete(key);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

// CR-231 (ADR-032): the `/admin` layout's gate.
describe('lookupAdminAccess', () => {
  it('denies a visitor without a cookie without asking the API', async () => {
    expect(await lookupAdminAccess()).toBe('denied');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks GET /v1/admin/me with the viewer’s cookie and address', async () => {
    incoming.set('cookie', 'session=abc');
    incoming.set('x-forwarded-for', '203.0.113.7');
    fetchMock.mockResolvedValue(Response.json({ admin: {} }));

    expect(await lookupAdminAccess()).toBe('admin');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/v1\/admin\/me$/);
    expect(init?.headers).toMatchObject({
      cookie: 'session=abc',
      'x-forwarded-for': '203.0.113.7',
    });
  });

  it.each([401, 404])('denies on the API’s %i', async (status) => {
    incoming.set('cookie', 'session=abc');
    fetchMock.mockResolvedValue(new Response(null, { status }));
    expect(await lookupAdminAccess()).toBe('denied');
  });

  it('is unknown — never admin — when the API fails or is unreachable', async () => {
    incoming.set('cookie', 'session=abc');
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect(await lookupAdminAccess()).toBe('unknown');
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await lookupAdminAccess()).toBe('unknown');
  });
});
