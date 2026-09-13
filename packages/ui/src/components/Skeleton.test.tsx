import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('is purely decorative — aria-hidden, no text content', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild;
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el?.textContent).toBe('');
  });

  it('gates the pulse animation behind motion-safe (docs/design.md §12)', () => {
    const { container } = render(<Skeleton />);
    const className = container.firstElementChild?.className ?? '';
    expect(className).toContain('motion-safe:animate-pulse');
    expect(className).not.toMatch(/(?<!motion-safe:)\banimate-pulse\b/);
  });

  it('accepts a className so callers can size/shape it to match the final layout', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    const className = container.firstElementChild?.className ?? '';
    expect(className).toContain('h-4');
    expect(className).toContain('w-32');
  });
});
