import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('keeps the word, level and filled count in the compact size (CR-144)', () => {
    const { container } = render(<DifficultyScale level={2} size="sm" />);
    expect(screen.getByText('Ниже среднего')).toBeInTheDocument();
    expect(screen.getByText('(уровень 2 из 5)')).toBeInTheDocument();
    const segments =
      container
        .querySelector('[aria-hidden="true"]')
        ?.querySelectorAll('span') ?? [];
    expect(segments).toHaveLength(5);
    expect(
      Array.from(segments).filter((s) => s.className.includes('bg-frame')),
    ).toHaveLength(2);
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
  it('fills its filled segments left to right when animated (CR-170)', () => {
    const { container } = render(<DifficultyScale level={3} animated />);
    const segments = Array.from(
      container.querySelectorAll('[aria-hidden="true"] span'),
    ) as HTMLElement[];
    const animated = segments.filter((segment) =>
      segment.className.includes('motion-safe:animate-segment-fill'),
    );
    // Only the filled ones animate, staggered; empty outlines stay still.
    expect(animated).toHaveLength(3);
    expect(animated.map((segment) => segment.style.animationDelay)).toEqual([
      '0ms',
      '70ms',
      '140ms',
    ]);
  });

  it('does not animate by default', () => {
    const { container } = render(<DifficultyScale level={5} />);
    expect(container.innerHTML).not.toContain('animate-segment-fill');
  });
  it('holds the fill until the scale scrolls into view (CR-170)', () => {
    let report: ((entries: Array<{ isIntersecting: boolean }>) => void) | null =
      null;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: typeof report) {
          report = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    const { container } = render(<DifficultyScale level={2} animated />);
    const held = () =>
      container.querySelectorAll('[class*="animation-play-state:paused"]')
        .length;
    expect(held()).toBe(2);

    act(() => report!([{ isIntersecting: true }]));

    expect(held()).toBe(0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
