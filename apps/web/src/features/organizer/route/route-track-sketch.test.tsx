import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RIDE_ROUTE_TERMS } from 'ui';
import { RouteTrackSketch } from './components/RouteTrackSketch';
import { getRouteGeometry, type RouteGeometryPoint } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, getRouteGeometry: vi.fn() };
});

const getRouteGeometryMock = vi.mocked(getRouteGeometry);

function track(length: number): RouteGeometryPoint[] {
  return Array.from({ length }, (_, index) => ({
    lat: 55.75 + index * 0.001,
    lng: 37.6 + index * 0.002,
    elevationMeters: null,
  }));
}

/** The drawn line's points: `M` once, then one `L` per further point. */
function lineCommands(): Array<[number, number]> {
  const svg = screen.getByRole('img', { name: RIDE_ROUTE_TERMS.sketchLabel });
  const d = svg.querySelector('path')!.getAttribute('d')!;
  return [...d.matchAll(/[ML](\S+) (\S+)/g)].map(
    (match) => [Number(match[1]), Number(match[2])] as [number, number],
  );
}

// KI-085: CR-187's published-route sketch had stories but no unit test.
describe('RouteTrackSketch', () => {
  beforeEach(() => {
    getRouteGeometryMock.mockReset();
  });

  it('draws the stored track with a named start and finish', async () => {
    getRouteGeometryMock.mockResolvedValue(track(3));

    render(<RouteTrackSketch rideId="ride-1" />);

    expect(
      await screen.findByRole('img', { name: RIDE_ROUTE_TERMS.sketchLabel }),
    ).toBeInTheDocument();
    expect(lineCommands()).toHaveLength(3);
    expect(screen.getByText(RIDE_ROUTE_TERMS.sketchStart)).toBeInTheDocument();
    expect(screen.getByText(RIDE_ROUTE_TERMS.sketchFinish)).toBeInTheDocument();
    expect(getRouteGeometryMock).toHaveBeenCalledWith('ride-1');
  });

  it('thins a long track to a few hundred points', async () => {
    getRouteGeometryMock.mockResolvedValue(track(5000));

    render(<RouteTrackSketch rideId="ride-1" />);
    await screen.findByRole('img', { name: RIDE_ROUTE_TERMS.sketchLabel });

    expect(lineCommands()).toHaveLength(400);
  });

  it('keeps a straight north–south track inside the frame', async () => {
    getRouteGeometryMock.mockResolvedValue([
      { lat: 55.7, lng: 37.6, elevationMeters: null },
      { lat: 55.8, lng: 37.6, elevationMeters: null },
    ]);

    render(<RouteTrackSketch rideId="ride-1" />);
    await screen.findByRole('img', { name: RIDE_ROUTE_TERMS.sketchLabel });

    // A zero-width span must not divide by zero.
    for (const [x, y] of lineCommands()) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(600);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(300);
    }
  });

  it('says the sketch is unavailable when the track can’t be read', async () => {
    getRouteGeometryMock.mockRejectedValue(new Error('network'));

    render(<RouteTrackSketch rideId="ride-1" />);

    expect(
      await screen.findByText(RIDE_ROUTE_TERMS.sketchUnavailable),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('says the same for a track too short to draw', async () => {
    getRouteGeometryMock.mockResolvedValue(track(1));

    render(<RouteTrackSketch rideId="ride-1" />);

    expect(
      await screen.findByText(RIDE_ROUTE_TERMS.sketchUnavailable),
    ).toBeInTheDocument();
  });
});
