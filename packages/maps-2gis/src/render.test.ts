import { afterEach, describe, expect, it, vi } from 'vitest';
import { create2GisMapRenderer } from './render.js';

// `@2gis/mapgl` is dynamically imported inside `render()` — mocked here
// rather than loading the real SDK (no DOM/WebGL in a Node test
// environment). Only the surface `render.ts` actually calls is stubbed.
// `vi.hoisted` (not a plain top-level `const`) so `polylineCtor` is safe to
// reference inside the `vi.mock` factory below, which Vitest hoists above
// every import in this file.
const { polylineCtor, mapFitBounds, mapSetCenter, mapSetZoom, mapOn } =
  vi.hoisted(() => ({
    polylineCtor: vi.fn(),
    mapFitBounds: vi.fn(),
    mapSetCenter: vi.fn(),
    mapSetZoom: vi.fn(),
    mapOn: vi.fn(),
  }));

vi.mock('@2gis/mapgl', () => ({
  load: vi.fn().mockResolvedValue({
    Map: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
      this.destroy = vi.fn();
      this.fitBounds = mapFitBounds;
      this.setCenter = mapSetCenter;
      this.setZoom = mapSetZoom;
      this.on = mapOn;
    }),
    Polyline: vi.fn().mockImplementation(function (
      this: { destroy: () => void },
      _map: unknown,
      options: unknown,
    ) {
      polylineCtor(options);
      this.destroy = vi.fn();
    }),
    Marker: vi.fn(),
    HtmlMarker: vi.fn(),
  }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

async function renderHandle() {
  const renderer = create2GisMapRenderer({ apiKey: 'test-key' });
  return renderer.render({
    container: {} as HTMLElement,
    center: { lat: 55.75, lng: 37.61 },
  });
}

const twoPoints = [
  { lat: 1, lng: 1 },
  { lat: 2, lng: 2 },
];

describe('setPolyline', () => {
  it('defaults to width 4 and the fallback color when both are omitted', async () => {
    const handle = await renderHandle();
    handle.setPolyline({ points: twoPoints });
    expect(polylineCtor).toHaveBeenCalledWith(
      expect.objectContaining({ width: 4, color: '#3b82f6' }),
    );
  });

  it('passes an explicit width through (CR-107, "more visual weight")', async () => {
    const handle = await renderHandle();
    handle.setPolyline({ points: twoPoints, color: '#35635a', width: 6 });
    expect(polylineCtor).toHaveBeenCalledWith(
      expect.objectContaining({ width: 6, color: '#35635a' }),
    );
  });

  it('encodes opacity as an alpha suffix on a 6-digit hex color', async () => {
    const handle = await renderHandle();
    handle.setPolyline({ points: twoPoints, color: '#35635a', opacity: 0.5 });
    expect(polylineCtor).toHaveBeenCalledWith(
      expect.objectContaining({ color: '#35635a80' }),
    );
  });

  it('ignores opacity for a non-hex color rather than risk an invalid string', async () => {
    const handle = await renderHandle();
    handle.setPolyline({
      points: twoPoints,
      color: 'rgb(1,2,3)',
      opacity: 0.5,
    });
    expect(polylineCtor).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'rgb(1,2,3)' }),
    );
  });
});

describe('setPolyline outline', () => {
  it('draws a wider casing line under the route when outlineColor is set', async () => {
    const handle = await renderHandle();
    handle.setPolyline({
      points: twoPoints,
      color: '#35635a',
      width: 6,
      outlineColor: '#ffffff',
    });
    expect(polylineCtor).toHaveBeenCalledWith(
      expect.objectContaining({ width: 6, color2: '#ffffff', width2: 10 }),
    );
  });

  it('draws no casing by default', async () => {
    const handle = await renderHandle();
    handle.setPolyline({ points: twoPoints });
    expect(polylineCtor).toHaveBeenCalledWith(
      expect.not.objectContaining({ color2: expect.anything() }),
    );
  });
});

describe('fitBounds', () => {
  it('fits the bounding box of every point, in [lng, lat] order', async () => {
    const handle = await renderHandle();
    handle.fitBounds(
      [
        { lat: 55.7, lng: 37.5 },
        { lat: 55.9, lng: 37.4 },
        { lat: 55.8, lng: 37.8 },
      ],
      { padding: 24, maxZoom: 14 },
    );
    expect(mapFitBounds).toHaveBeenCalledWith(
      { northEast: [37.8, 55.9], southWest: [37.4, 55.7] },
      {
        padding: { top: 24, right: 24, bottom: 24, left: 24 },
        maxZoom: 14,
      },
    );
  });

  it('centers on a single point instead of zooming to the maximum', async () => {
    const handle = await renderHandle();
    handle.fitBounds([{ lat: 55.75, lng: 37.61 }]);
    expect(mapFitBounds).not.toHaveBeenCalled();
    expect(mapSetCenter).toHaveBeenCalledWith([37.61, 55.75]);
    expect(mapSetZoom).toHaveBeenCalledWith(14);
  });

  it('does nothing for an empty point list', async () => {
    const handle = await renderHandle();
    handle.fitBounds([]);
    expect(mapFitBounds).not.toHaveBeenCalled();
    expect(mapSetCenter).not.toHaveBeenCalled();
  });
});

describe('onClick', () => {
  it('reports a map click as a provider-neutral { lat, lng }', async () => {
    const onClick = vi.fn();
    const renderer = create2GisMapRenderer({ apiKey: 'test-key' });
    await renderer.render({
      container: {} as HTMLElement,
      center: { lat: 55.75, lng: 37.61 },
      onClick,
    });

    expect(mapOn).toHaveBeenCalledWith('click', expect.any(Function));
    const handler = mapOn.mock.calls[0]![1] as (event: {
      lngLat: number[];
    }) => void;
    handler({ lngLat: [37.62, 55.76] });
    expect(onClick).toHaveBeenCalledWith({ lat: 55.76, lng: 37.62 });
  });

  it('subscribes to nothing when no handler is given', async () => {
    await renderHandle();
    expect(mapOn).not.toHaveBeenCalled();
  });
});
