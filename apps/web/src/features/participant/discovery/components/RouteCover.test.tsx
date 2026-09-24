import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RouteCover } from './RouteCover';

const ROUTE: Array<[number, number]> = [
  [55.75, 37.6],
  [55.76, 37.62],
  [55.77, 37.61],
];

describe('RouteCover', () => {
  it('renders bottom content passed as children', () => {
    render(
      <RouteCover routePreview={ROUTE} seed="ride-1">
        <h3>Тестовый заезд на выходные</h3>
      </RouteCover>,
    );
    expect(screen.getByText('Тестовый заезд на выходные')).toBeInTheDocument();
  });

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

  it('renders topLeft/topRight slots', () => {
    render(
      <RouteCover
        routePreview={ROUTE}
        seed="ride-1"
        topLeft={<span>регистрация открыта</span>}
        topRight={<button type="button">♥</button>}
      />,
    );
    expect(screen.getByText('регистрация открыта')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '♥' })).toBeInTheDocument();
  });
});
