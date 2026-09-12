import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home from './page';

// Bootstrap-placeholder smoke test (CR-008/CR-002): real screens follow
// docs/design.md starting at CR-011 and get real behavioral tests then —
// this only proves the render pipeline (Vitest + jsdom + React 19) works.
describe('Home', () => {
  it('renders the bootstrap placeholder heading and subtitle', () => {
    render(<Home />);

    expect(
      screen.getByRole('heading', { name: 'Coffee Ride' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Платформа собирается. Скоро здесь будут заезды.'),
    ).toBeInTheDocument();
  });
});
