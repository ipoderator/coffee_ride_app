import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteCover } from './RouteCover';

const ROUTE: Array<[number, number]> = [
  [55.75, 37.6],
  [55.76, 37.62],
  [55.77, 37.61],
];

describe('RouteCover', () => {
  it('draws a route track when routePreview has points', () => {
    const { container } = render(
      <RouteCover routePreview={ROUTE} seed="ride-1" />,
    );
    expect(container.querySelector('polyline')).not.toBeNull();
  });

  it('renders no track when routePreview is null, without crashing', () => {
    const { container } = render(
      <RouteCover routePreview={null} seed="ride-1" />,
    );
    expect(container.querySelector('polyline')).toBeNull();
  });

  it('picks the same background deterministically for the same seed', () => {
    const a = render(<RouteCover routePreview={null} seed="same-ride" />);
    const b = render(<RouteCover routePreview={null} seed="same-ride" />);
    expect(a.container.querySelector('svg')!.innerHTML).toBe(
      b.container.querySelector('svg')!.innerHTML,
    );
  });

  it('desaturates the background art when cancelled', () => {
    const { container } = render(
      <RouteCover routePreview={ROUTE} seed="ride-1" cancelled />,
    );
    expect(container.querySelector('svg')!.className.baseVal).toMatch(
      /saturate-0/,
    );
  });

  it('renders the status chip in a dark token scope (the cover is dark in both themes)', () => {
    render(
      <RouteCover
        routePreview={ROUTE}
        seed="ride-1"
        topLeft={<span>Регистрация открыта</span>}
      />,
    );
    expect(screen.getByText('Регистрация открыта').parentElement).toHaveClass(
      'dark',
    );
  });

  it('shows the empty label only when there is no track to draw', () => {
    const { rerender } = render(
      <RouteCover
        routePreview={null}
        seed="ride-1"
        emptyLabel="Нет маршрута"
      />,
    );
    expect(screen.getByText('Нет маршрута')).toBeInTheDocument();
    rerender(
      <RouteCover
        routePreview={ROUTE}
        seed="ride-1"
        emptyLabel="Нет маршрута"
      />,
    );
    expect(screen.queryByText('Нет маршрута')).toBeNull();
  });
  describe('track draw-in (CR-170)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function trackLines(container: HTMLElement) {
      return Array.from(container.querySelectorAll('polyline'));
    }

    it('draws the track in with a normalized dash, finish pin after it', () => {
      // jsdom has no IntersectionObserver: the hook reports "visible" at
      // once, so nothing is left held at its first frame.
      const { container } = render(
        <RouteCover routePreview={ROUTE} seed="ride-1" />,
      );
      for (const line of trackLines(container)) {
        expect(line.getAttribute('pathLength')).toBe('1');
        expect(line.getAttribute('stroke-dasharray')).toBe('1');
        const cls = line.getAttribute('class')!;
        expect(cls).toContain('motion-safe:animate-track-draw');
        expect(cls).not.toContain('animation-play-state');
      }
    });

    it('holds the draw until the cover scrolls into view', () => {
      let report:
        ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;
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
      const { container } = render(
        <RouteCover routePreview={ROUTE} seed="ride-1" />,
      );
      for (const line of trackLines(container)) {
        expect(line.getAttribute('class')).toContain(
          '[animation-play-state:paused]',
        );
      }

      act(() => report!([{ isIntersecting: true }]));

      for (const line of trackLines(container)) {
        expect(line.getAttribute('class')).not.toContain(
          'animation-play-state',
        );
      }
    });
  });
});
