import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrganizerProfile } from 'types';
import { OrganizerProfileWidget } from './components/OrganizerProfileWidget';
import { ApiError, getOrganizerProfile } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getOrganizerProfile: vi.fn(),
  };
});

const getOrganizerProfileMock = vi.mocked(getOrganizerProfile);

const NOT_FOUND_ERROR = new ApiError({
  type: 'https://coffee-ride.example/errors/organizer_profile_not_found',
  title: 'Organizer profile not found',
  status: 404,
  detail: 'No organizer profile exists for this account yet.',
  instance: '/v1/organizers/me',
  code: 'organizer_profile_not_found',
});

const baseProfile: OrganizerProfile = {
  id: 'org-1',
  userId: 'user-1',
  name: 'Гравийный клуб',
  description: 'Ездим по субботам.',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('OrganizerProfileWidget', () => {
  beforeEach(() => {
    getOrganizerProfileMock.mockReset();
  });

  it('shows a create-profile empty state when none exists yet', async () => {
    getOrganizerProfileMock.mockRejectedValue(NOT_FOUND_ERROR);

    render(<OrganizerProfileWidget />);

    expect(
      await screen.findByText('Профиль организатора ещё не создан'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Создать профиль' }),
    ).toHaveAttribute('href', '/organizer/profile');
  });

  it('shows the profile summary and an edit link when one exists', async () => {
    getOrganizerProfileMock.mockResolvedValue({
      organizerProfile: baseProfile,
    });

    render(<OrganizerProfileWidget />);

    expect(await screen.findByText('Гравийный клуб')).toBeInTheDocument();
    expect(screen.getByText('Ездим по субботам.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Редактировать' })).toHaveAttribute(
      'href',
      '/organizer/profile',
    );
  });

  it('omits the description line when none is set', async () => {
    getOrganizerProfileMock.mockResolvedValue({
      organizerProfile: { ...baseProfile, description: null },
    });

    render(<OrganizerProfileWidget />);

    expect(await screen.findByText('Гравийный клуб')).toBeInTheDocument();
    expect(screen.queryByText('Ездим по субботам.')).not.toBeInTheDocument();
  });

  it('shows an error state for a load failure other than "not found"', async () => {
    getOrganizerProfileMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/internal_error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred.',
        instance: '/v1/organizers/me',
        code: 'internal_error',
      }),
    );

    render(<OrganizerProfileWidget />);

    expect(
      await screen.findByText('Не удалось загрузить профиль организатора.'),
    ).toBeInTheDocument();
  });
});
