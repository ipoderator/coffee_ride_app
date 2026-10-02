import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DiscoveryPageSkeleton } from './DiscoveryPageSkeleton';

describe('DiscoveryPageSkeleton', () => {
  it('shows the real page title at once and marks the region busy, with no fetched data', () => {
    const { container } = render(<DiscoveryPageSkeleton />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Заезды' }),
    ).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
    // placeholders only: no links, buttons or tabs to tab onto before hydration
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});
