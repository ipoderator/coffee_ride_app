import { afterEach, describe, expect, it, vi } from 'vitest';
import { create2GisMapRenderer } from './render.js';

// `@2gis/mapgl` is dynamically imported inside `render()` — mocked here
// rather than loading the real SDK (no DOM/WebGL in a Node test
// environment). Only the surface `render.ts` actually calls is stubbed.
// `vi.hoisted` (not a plain top-level `const`) so `polylineCtor` is safe to
// reference inside the `vi.mock` factory below, which Vitest hoists above
// every import in this file.
const {
  polylineCtor,
  mapFitBounds,
  mapSetCenter,
  mapSetZoom,
  mapOn,
  htmlMarkerCtor,
  markerOn,
} = vi.hoisted(() => ({
  polylineCtor: vi.fn(),
  mapFitBounds: vi.fn(),
  mapSetCenter: vi.fn(),
  mapSetZoom: vi.fn(),
  mapOn: vi.fn(),
  htmlMarkerCtor: vi.fn(),
  markerOn: vi.fn(),
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
    Marker: vi.fn().mockImplementation(function (
      this: Record<string, unknown>,
    ) {
      this.on = markerOn;
      this.destroy = vi.fn();
    }),
    HtmlMarker: vi.fn().mockImplementation(function (
      this: Record<string, unknown>,
      _map: unknown,
      options: unknown,
    ) {
      htmlMarkerCtor(options);
      this.destroy = vi.fn();
    }),
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

// CR-118: ring markers build a small DOM tree. The package's tests run in
// plain Node (no jsdom dependency here), so a minimal stand-in for the few
// `document`/element members `createRingElement` touches is enough.
interface FakeElement {
  tagName: string;
  textContent: string;
  style: { cssText: string };
  dataset: Record<string, string>;
  children: FakeElement[];
  listeners: Record<string, (event: { stopPropagation(): void }) => void>;
  appendChild(child: FakeElement): void;
  addEventListener(
    type: string,
    listener: (event: { stopPropagation(): void }) => void,
  ): void;
}

function fakeDocument() {
  return {
    createElement(tagName: string): FakeElement {
      return {
        tagName,
        textContent: '',
        style: { cssText: '' },
        dataset: {},
        children: [],
        listeners: {},
        appendChild(child) {
          this.children.push(child);
        },
        addEventListener(type, listener) {
          this.listeners[type] = listener;
        },
      };
    },
  };
}

function lastHtmlMarker(): {
  html: FakeElement;
  anchor: number[];
  zIndex?: number;
  interactive?: boolean;
} {
  return htmlMarkerCtor.mock.calls.at(-1)![0] as never;
}

describe('ring markers (CR-118)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a 44px hit box anchored at its centre, with the label as a caption', async () => {
    vi.stubGlobal('document', fakeDocument());
    const handle = await renderHandle();
    handle.setMarkers([
      {
        id: 'ride-1',
        point: { lat: 55.75, lng: 37.61 },
        shape: 'ring',
        label: '07:30',
        color: '#9c2aa6',
        haloColor: '#ffffff',
      },
    ]);

    const { html, anchor } = lastHtmlMarker();
    expect(anchor).toEqual([22, 22]);
    expect(html.style.cssText).toContain('width:44px');
    expect(html.style.cssText).toContain('height:44px');
    const [ring, caption] = html.children;
    expect(ring!.style.cssText).toContain('border:3px solid #9c2aa6');
    expect(ring!.style.cssText).toContain('background:transparent');
    expect(caption!.textContent).toBe('07:30');
    expect(caption!.style.cssText).toContain('color:#9c2aa6');
  });

  it('fills a selected ring and draws it above unselected ones', async () => {
    vi.stubGlobal('document', fakeDocument());
    const handle = await renderHandle();
    handle.setMarkers([
      {
        id: 'ride-1',
        point: { lat: 55.75, lng: 37.61 },
        shape: 'ring',
        label: '07:30',
        color: '#7a2482',
        haloColor: '#ffffff',
        selected: true,
      },
    ]);

    const { html, zIndex } = lastHtmlMarker();
    expect(zIndex).toBe(2);
    expect(html.dataset.selected).toBe('true');
    expect(html.children[0]!.style.cssText).toContain('background:#7a2482');
    expect(html.children[1]!.style.cssText).toContain(
      'background:#7a2482;color:#ffffff',
    );
  });

  it('keeps MapGL default ordering for markers that never set `selected`', async () => {
    vi.stubGlobal('document', fakeDocument());
    const handle = await renderHandle();
    handle.setMarkers([
      { id: 'stop-1', point: { lat: 1, lng: 1 }, color: '#123456', label: 'К' },
    ]);
    expect(lastHtmlMarker()).not.toHaveProperty('zIndex');
    expect(lastHtmlMarker()).not.toHaveProperty('interactive');
  });
});

describe('onMarkerClick (CR-118)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports a click on an HTML marker by its id', async () => {
    vi.stubGlobal('document', fakeDocument());
    const onMarkerClick = vi.fn();
    const renderer = create2GisMapRenderer({ apiKey: 'test-key' });
    const handle = await renderer.render({
      container: {} as HTMLElement,
      center: { lat: 55.75, lng: 37.61 },
      onMarkerClick,
    });
    handle.setMarkers([
      {
        id: 'ride-7',
        point: { lat: 1, lng: 1 },
        shape: 'ring',
        label: '09:00',
      },
    ]);

    const { html, interactive } = lastHtmlMarker();
    expect(interactive).toBe(true);
    const stopPropagation = vi.fn();
    html.listeners.click!({ stopPropagation });
    expect(onMarkerClick).toHaveBeenCalledWith('ride-7');
    expect(stopPropagation).toHaveBeenCalled();
  });

  it('reports a click on a default marker through the SDK event', async () => {
    const onMarkerClick = vi.fn();
    const renderer = create2GisMapRenderer({ apiKey: 'test-key' });
    const handle = await renderer.render({
      container: {} as HTMLElement,
      center: { lat: 55.75, lng: 37.61 },
      onMarkerClick,
    });
    handle.setMarkers([{ id: 'plain', point: { lat: 1, lng: 1 } }]);

    expect(markerOn).toHaveBeenCalledWith('click', expect.any(Function));
    (markerOn.mock.calls[0]![1] as () => void)();
    expect(onMarkerClick).toHaveBeenCalledWith('plain');
  });

  it('subscribes to no marker events without a handler', async () => {
    const handle = await renderHandle();
    handle.setMarkers([{ id: 'plain', point: { lat: 1, lng: 1 } }]);
    expect(markerOn).not.toHaveBeenCalled();
  });
});
