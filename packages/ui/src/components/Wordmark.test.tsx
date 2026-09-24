import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WORDMARK_TERMS } from '../terminology';
import { Wordmark } from './Wordmark';

describe('Wordmark (CR-121)', () => {
  it('exposes the product name and hides the stylised glyphs', () => {
    const { container } = render(
      <a href="/">
        <Wordmark />
      </a>,
    );
    expect(
      screen.getByRole('link', { name: WORDMARK_TERMS.name }),
    ).toBeInTheDocument();
    const glyphs = container.querySelector('[aria-hidden="true"]');
    expect(glyphs?.textContent).toBe('коферайд');
  });

  it('draws the profile and the dot in the overprint token, not a hard-coded colour', () => {
    const { container } = render(<Wordmark />);
    expect(
      container.querySelector('svg path')?.getAttribute('class'),
    ).toContain('fill-brand');
    expect(
      container.querySelector('svg circle')?.getAttribute('class'),
    ).toContain('fill-brand');
    expect(container.textContent).not.toContain('.');
  });

  it('sets the letters in the UI face, extra bold, in ink', () => {
    const { container } = render(<Wordmark />);
    const root = container.firstElementChild;
    expect(root?.className).toContain('font-sans');
    expect(root?.className).toContain('font-extrabold');
    expect(root?.className).toContain('text-text');
  });
});
