import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MapHandle, MapRenderOptions } from 'maps-core';
import { RouteMap } from './components/RouteMap';

const renderState = vi.hoisted(() => ({
  options: null as MapRenderOptions | null,
}));

vi.mock('@/lib/maps/create-map-renderer', () => ({
  createMapRenderer: () => ({
    render: async (options: MapRenderOptions): Promise<MapHandle> => {
      renderState.options = options;
      return {
        setMarkers: vi.fn(),
        setPolyline: vi.fn(),
        fitBounds: vi.fn(),
        panTo: vi.fn(),
        destroy: vi.fn(),
      };
    },
  }),
}));

describe('RouteMap basemap failure (CR-185)', () => {
  it('swaps a map whose basemap never drew for the degraded notice', async () => {
    render(
      <RouteMap
        geometry={[
          { lat: 55.75, lng: 37.6, elevationMeters: null },
          { lat: 55.76, lng: 37.62, elevationMeters: null },
        ]}
        routePoints={[]}
        stops={[]}
      />,
    );
    await waitFor(() => expect(renderState.options).not.toBeNull());
    expect(
      screen.queryByText('Карта маршрута временно недоступна.'),
    ).toBeNull();

    act(() => renderState.options!.onBasemapUnavailable!());

    expect(
      await screen.findByText('Карта маршрута временно недоступна.'),
    ).toBeInTheDocument();
  });
});
