import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailDeliveryError } from './email-provider.js';
import { UnisenderEmailProvider } from './unisender-provider.js';

const config = {
  apiKey: 'test-key',
  apiUrl: 'https://go1.unisender.ru/ru/transactional/api/v1/',
  fromEmail: 'no-reply@coffee-ride.example',
  fromName: 'Coffee Ride',
};

const message = {
  to: 'rider@example.com',
  subject: 'Subject',
  html: '<p>html</p>',
  text: 'text',
};

function mockFetchOnce(
  overrides: Partial<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }>,
) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ status: 'success' }),
    ...overrides,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('UnisenderEmailProvider', () => {
  it('POSTs to email/send.json with the API key header and the expected body shape', async () => {
    const fetchMock = mockFetchOnce({});

    const provider = new UnisenderEmailProvider(config);
    await provider.send(message);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${config.apiUrl}email/send.json`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-API-KEY']).toBe(
      config.apiKey,
    );
    const body = JSON.parse(init.body as string) as {
      message: Record<string, unknown>;
    };
    expect(body.message).toEqual({
      from_email: config.fromEmail,
      from_name: config.fromName,
      subject: message.subject,
      body: { html: message.html, plaintext: message.text },
      recipients: [{ email: message.to }],
    });
  });

  it('throws EmailDeliveryError on a non-2xx response', async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      json: async () => ({ status: 'error' }),
    });

    const provider = new UnisenderEmailProvider(config);
    await expect(provider.send(message)).rejects.toThrow(EmailDeliveryError);
  });

  it('throws EmailDeliveryError when status is not "success"', async () => {
    mockFetchOnce({ json: async () => ({ status: 'error' }) });

    const provider = new UnisenderEmailProvider(config);
    await expect(provider.send(message)).rejects.toThrow(EmailDeliveryError);
  });

  it('throws EmailDeliveryError when the recipient is in failed_emails', async () => {
    mockFetchOnce({
      json: async () => ({
        status: 'success',
        failed_emails: { [message.to]: 'invalid' },
      }),
    });

    const provider = new UnisenderEmailProvider(config);
    await expect(provider.send(message)).rejects.toThrow(EmailDeliveryError);
  });

  it('never retries — a single failed attempt fails immediately', async () => {
    const fetchMock = mockFetchOnce({ ok: false, status: 500 });

    const provider = new UnisenderEmailProvider(config);
    await expect(provider.send(message)).rejects.toThrow(EmailDeliveryError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
