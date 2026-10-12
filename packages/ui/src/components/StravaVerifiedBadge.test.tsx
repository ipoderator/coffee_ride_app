import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StravaVerifiedBadge } from './StravaVerifiedBadge';

describe('StravaVerifiedBadge', () => {
  it('says «Проверено Strava» in the AA-safe Strava ink, never as a solid fill', () => {
    render(<StravaVerifiedBadge />);
    const badge = screen.getByText('Проверено Strava');
    expect(badge.className).toContain('text-strava-text');
    expect(badge.className).toContain('bg-strava/10');
  });
});
