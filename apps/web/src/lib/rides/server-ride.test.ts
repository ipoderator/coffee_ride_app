import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const incoming = new Headers();
vi.mock('next/headers', () => ({ headers: async () => incoming }));
// `cache()` memoizes per server request; in a test every call is its own.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T>(fn: T) => fn,
}));

const { lookupRide } = await import('./server-ride');

const RIDE_ID = '9dc98d91-42d1-4d32-920e-07648f22e5bd';
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  for (const key of [...incoming.keys()]) incoming.delete(key);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

// QA live audit 2026-10-08, item 4.
describe('lookupRide', () => {
  it('is not found without asking the API for an id that is not a UUID', async () => {
    expect(await lookupRide('not-a-ride')).toEqual({ kind: 'not_found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports the API’s 404 as not found', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    expect(await lookupRide(RIDE_ID)).toEqual({ kind: 'not_found' });
  });

  it('returns the ride on 200, forwarding the viewer’s cookie and address', async () => {
    incoming.set('cookie', 'session=abc');
    incoming.set('x-forwarded-for', '203.0.113.7');
    fetchMock.mockResolvedValue(
      Response.json({ ride: { id: RIDE_ID, title: 'Ночной Гравел' } }),
    );
    expect(await lookupRide(RIDE_ID)).toEqual({
      kind: 'found',
      ride: { id: RIDE_ID, title: 'Ночной Гравел' },
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`http://localhost:4000/v1/rides/${RIDE_ID}`);
    expect(init?.headers).toEqual({
      accept: 'application/json',
      cookie: 'session=abc',
      'x-forwarded-for': '203.0.113.7',
    });
  });

  it('sends no cookie or address headers the viewer did not have', async () => {
    fetchMock.mockResolvedValue(Response.json({ ride: { id: RIDE_ID } }));
    await lookupRide(RIDE_ID);
    expect(fetchMock.mock.calls[0]![1]?.headers).toEqual({
      accept: 'application/json',
    });
  });

  it('leaves the decision to the client on any other answer or a failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect(await lookupRide(RIDE_ID)).toEqual({ kind: 'unknown' });
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    expect(await lookupRide(RIDE_ID)).toEqual({ kind: 'unknown' });
  });
});
