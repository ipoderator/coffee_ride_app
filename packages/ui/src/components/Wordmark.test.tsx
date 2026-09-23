import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Wordmark } from './Wordmark';

describe('Wordmark (ADR-021)', () => {
  it('exposes the product name «Coffee Ride» and hides the stylised glyphs', () => {
    const { container } = render(
      <a href="/">
        <Wordmark />
      </a>,
    );
    expect(
      screen.getByRole('link', { name: 'Coffee Ride' }),
    ).toBeInTheDocument();
    const glyphs = container.querySelector('[aria-hidden="true"]');
    expect(glyphs?.textContent).toBe('coffeeride');
  });

  it('replaces the dot with a ring in the overprint token, not a hard-coded colour', () => {
    const { container } = render(<Wordmark />);
    const ring = container.querySelector('svg circle');
    expect(ring).not.toBeNull();
    expect(ring?.getAttribute('fill')).toBe('none');
    expect(ring?.getAttribute('class')).toContain('stroke-primary');
    expect(container.textContent).not.toContain('.');
  });

  it('sets the letters in the display face, bold, in ink', () => {
    const { container } = render(<Wordmark />);
    const root = container.firstElementChild;
    expect(root?.className).toContain('font-display');
    expect(root?.className).toContain('font-bold');
    expect(root?.className).toContain('text-text');
  });
});
