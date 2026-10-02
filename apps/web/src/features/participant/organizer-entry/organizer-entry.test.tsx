import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrganizerEntryWidget } from './components/OrganizerEntryWidget';

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const PROFILE = {
  organizerProfile: { id: 'org-1', name: 'Гравий по выходным' },
  rating: null,
  reviewCount: 0,
};

describe('OrganizerEntryWidget (CR-185)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends an existing organizer to their cabinet, not to create a profile', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(200, PROFILE)));
    render(<OrganizerEntryWidget />);

    expect(
      await screen.findByRole('link', { name: 'Перейти в кабинет' }),
    ).toHaveAttribute('href', '/organizer');
    expect(screen.getByText(/«Гравий по выходным»/)).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Создать профиль/ }),
    ).not.toBeInTheDocument();
  });

  it('offers to create a profile when there is none (404)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(respond(404, { status: 404, code: 'x' })),
    );
    render(<OrganizerEntryWidget />);

    expect(
      await screen.findByRole('link', {
        name: 'Создать профиль организатора →',
      }),
    ).toHaveAttribute('href', '/organizer/profile');
    expect(screen.getByText('Организуете заезды?')).toBeInTheDocument();
  });

  it('shows a retry, not a guess, when the check fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond(500, { status: 500, code: 'internal' }))
      .mockResolvedValueOnce(respond(200, PROFILE));
    vi.stubGlobal('fetch', fetchMock);
    render(<OrganizerEntryWidget />);

    expect(
      await screen.findByText('Не удалось проверить профиль организатора.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(
      await screen.findByRole('link', { name: 'Перейти в кабинет' }),
    ).toBeInTheDocument();
  });
});
