import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Wordmark } from './Wordmark';

describe('Wordmark', () => {
  it('renders "coffee" and ".ride" as one accessible string', () => {
    render(<Wordmark />);
    expect(screen.getByText('coffee').parentElement?.textContent).toBe(
      'coffee.ride',
    );
  });

  it('gives "coffee" more weight than ".ride" (docs/design.md §4/wordmark)', () => {
    render(<Wordmark />);
    expect(screen.getByText('coffee').className).toContain('font-medium');
    expect(screen.getByText('.ride').className).toContain('font-normal');
  });

  it('uses the primary token, not a hard-coded color', () => {
    render(<Wordmark />);
    expect(screen.getByText('coffee').parentElement?.className).toContain(
      'text-primary',
    );
  });
});
