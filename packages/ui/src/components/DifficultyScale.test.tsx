import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_LEVEL_TERMS } from '../terminology';
import { DifficultyScale } from './DifficultyScale';

describe('DifficultyScale', () => {
  it('renders the word for every level', () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      render(<DifficultyScale level={level} />);
      expect(
        screen.getByText(DIFFICULTY_LEVEL_TERMS[level]),
      ).toBeInTheDocument();
    }
  });

  it('renders exactly `level` filled segments out of 5, decoratively hidden', () => {
    const { container } = render(<DifficultyScale level={3} />);
    const segmentContainer = container.querySelector('[aria-hidden="true"]');
    expect(segmentContainer).toBeInTheDocument();
    const segments = segmentContainer?.querySelectorAll('span') ?? [];
    expect(segments).toHaveLength(5);
    const filled = Array.from(segments).filter((segment) =>
      segment.className.includes('bg-frame'),
    );
    expect(filled).toHaveLength(3);
    // CR-128: empty segments are a hollow `border-input` outline, not the
    // near-invisible `border` hairline fill.
    const empty = Array.from(segments).filter((segment) =>
      segment.className.includes('border-border-input'),
    );
    expect(empty).toHaveLength(2);
  });

  it('exposes the level to assistive tech via sr-only text, without repeating the word visibly', () => {
    render(<DifficultyScale level={3} />);
    expect(screen.getByText('Средний')).toBeInTheDocument();
    expect(screen.getByText('(уровень 3 из 5)')).toBeInTheDocument();
  });

  it('never encodes difficulty by color alone — the word is always present', () => {
    render(<DifficultyScale level={5} />);
    expect(screen.getByText('Очень сложный')).toBeInTheDocument();
  });
});
