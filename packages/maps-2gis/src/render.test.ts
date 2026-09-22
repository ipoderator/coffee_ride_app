import { afterEach, describe, expect, it, vi } from 'vitest';
import { create2GisMapRenderer } from './render.js';

// `@2gis/mapgl` is dynamically imported inside `render()` — mocked here
// rather than loading the real SDK (no DOM/WebGL in a Node test
// environment). Only the surface `render.ts` actually calls is stubbed.
// `vi.hoisted` (not a plain top-level `const`) so `polylineCtor` is safe to
// reference inside the `vi.mock` factory below, which Vitest hoists above
// every import in this file.
const { polylineCtor } = vi.hoisted(() => ({ polylineCtor: vi.fn() }));

vi.mock('@2gis/mapgl', () => ({
  load: vi.fn().mockResolvedValue({
    Map: vi.fn().mockImplementation(function (this: { destroy: () => void }) {
      this.destroy = vi.fn();
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
