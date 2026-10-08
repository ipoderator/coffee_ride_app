import { afterEach, describe, expect, it, vi } from 'vitest';
import { create2GisMapRenderer, linePrefix } from './render.js';

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
  htmlMarkers,
  polylines,
  markerOn,
  mapCtor,
} = vi.hoisted(() => ({
  polylineCtor: vi.fn(),
  mapFitBounds: vi.fn(),
  mapSetCenter: vi.fn(),
  mapSetZoom: vi.fn(),
  mapOn: vi.fn(),
  htmlMarkerCtor: vi.fn(),
  // CR-171: live SDK objects, to see which were kept, moved or destroyed.
  htmlMarkers: [] as Array<{
    destroy: ReturnType<typeof vi.fn>;
    setCoordinates: ReturnType<typeof vi.fn>;
  }>,
  polylines: [] as Array<{
    coordinates: number[][];
    destroy: ReturnType<typeof vi.fn>;
  }>,
  markerOn: vi.fn(),
  mapCtor: vi.fn(),
}));

vi.mock('@2gis/mapgl', () => ({
  load: vi.fn().mockResolvedValue({
    Map: vi.fn().mockImplementation(function (
      this: Record<string, unknown>,
      _container: unknown,
      options: unknown,
    ) {
      mapCtor(options);
      this.destroy = vi.fn();
      this.fitBounds = mapFitBounds;
      this.setCenter = mapSetCenter;
      this.setZoom = mapSetZoom;
      this.on = mapOn;
      this.invalidateSize = vi.fn();
    }),
    Polyline: vi.fn().mockImplementation(function (
      this: { destroy: () => void },
      _map: unknown,
      options: { coordinates: number[][] },
    ) {
      polylineCtor(options);
      this.destroy = vi.fn();
      polylines.push({
        coordinates: options.coordinates,
        destroy: this.destroy as ReturnType<typeof vi.fn>,
      });
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
      this.setCoordinates = vi.fn();
      htmlMarkers.push(this as never);
    }),
  }),
}));

afterEach(() => {
  vi.clearAllMocks();
  htmlMarkers.length = 0;
  polylines.length = 0;
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

  it('eases the fit when given a duration, and jumps for 0 (CR-171)', async () => {
    const handle = await renderHandle();
    const points = [
      { lat: 55.7, lng: 37.5 },
      { lat: 55.9, lng: 37.8 },
    ];
    handle.fitBounds(points, { padding: 56, maxZoom: 14, durationMs: 600 });
    expect(mapFitBounds).toHaveBeenLastCalledWith(expect.anything(), {
      padding: { top: 56, right: 56, bottom: 56, left: 56 },
      maxZoom: 14,
      animation: { duration: 600, easing: 'easeOutCubic' },
    });

    handle.fitBounds(points, { durationMs: 0 });
    expect(mapFitBounds).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ animation: { animate: false } }),
    );
  });

  it('eases a single-point fit too (CR-171)', async () => {
    const handle = await renderHandle();
    handle.fitBounds([{ lat: 55.75, lng: 37.61 }], { durationMs: 600 });
    const animation = { duration: 600, easing: 'easeOutCubic' };
    expect(mapSetCenter).toHaveBeenCalledWith([37.61, 55.75], animation);
    expect(mapSetZoom).toHaveBeenCalledWith(14, animation);
  });

  it('re-fits after a container resize at once, never animated (CR-171)', async () => {
    let onResize: (() => void) | null = null;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          onResize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const handle = await renderHandle();
    handle.fitBounds(
      [
        { lat: 55.7, lng: 37.5 },
        { lat: 55.9, lng: 37.8 },
      ],
      { padding: 56, durationMs: 600 },
    );
    mapFitBounds.mockClear();

    onResize!();

    expect(mapFitBounds).toHaveBeenCalledTimes(1);
    expect(mapFitBounds.mock.calls[0]![1]).not.toHaveProperty('animation');
    vi.unstubAllGlobals();
  });

  it('does nothing for an empty point list', async () => {
    const handle = await renderHandle();
    handle.fitBounds([]);
    expect(mapFitBounds).not.toHaveBeenCalled();
    expect(mapSetCenter).not.toHaveBeenCalled();
  });
});

describe('panTo (CR-170)', () => {
  it('eases the centre to the point in [lng, lat] order, keeping the zoom', async () => {
    const handle = await renderHandle();
    handle.panTo({ lat: 55.75, lng: 37.61 }, { durationMs: 450 });
    expect(mapSetCenter).toHaveBeenCalledWith([37.61, 55.75], {
      duration: 450,
      easing: 'easeOutCubic',
    });
    expect(mapSetZoom).not.toHaveBeenCalled();
  });

  it('jumps without animation for a zero duration (reduced motion)', async () => {
    const handle = await renderHandle();
    handle.panTo({ lat: 55.75, lng: 37.61 }, { durationMs: 0 });
    expect(mapSetCenter).toHaveBeenCalledWith([37.61, 55.75], {
      animate: false,
    });
  });

  it("keeps the provider's default duration when none is given", async () => {
    const handle = await renderHandle();
    handle.panTo({ lat: 55.75, lng: 37.61 });
    expect(mapSetCenter).toHaveBeenCalledWith([37.61, 55.75], {
      easing: 'easeOutCubic',
    });
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

describe('onBasemapUnavailable (CR-185)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function listener(event: string) {
    const call = mapOn.mock.calls.find(([name]) => name === event);
    return call?.[1] as (payload?: { type: string }) => void;
  }

  it('reports a fatal map error once and ignores the rest', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null)));
    const onBasemapUnavailable = vi.fn();
    const renderer = create2GisMapRenderer({ apiKey: 'test-key' });
    await renderer.render({
      container: {} as HTMLElement,
      center: { lat: 55.75, lng: 37.61 },
      onBasemapUnavailable,
    });

    listener('styleload')();
    listener('error')({ type: 'rasterTileLoadError' });
    expect(onBasemapUnavailable).not.toHaveBeenCalled();
    listener('error')({ type: 'invalidtilekey' });
    listener('error')({ type: 'invalidtilekey' });
    expect(onBasemapUnavailable).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://tile0-sdk.maps.2gis.com/',
      expect.objectContaining({ mode: 'no-cors' }),
    );
  });

  it('stops watching once the map is destroyed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null)));
    const onBasemapUnavailable = vi.fn();
    const renderer = create2GisMapRenderer({ apiKey: 'test-key' });
    const handle = await renderer.render({
      container: {} as HTMLElement,
      center: { lat: 55.75, lng: 37.61 },
      onBasemapUnavailable,
    });
    handle.destroy();
    listener('styleloaderror')();
    expect(onBasemapUnavailable).not.toHaveBeenCalled();
  });
});

describe('zoomControlPosition', () => {
  it('moves the zoom buttons to the requested side', async () => {
    const renderer = create2GisMapRenderer({ apiKey: 'test-key' });
    await renderer.render({
      container: {} as HTMLElement,
      center: { lat: 55.75, lng: 37.61 },
      zoomControlPosition: 'centerRight',
    });
    expect(mapCtor).toHaveBeenCalledWith(
      expect.objectContaining({ zoomControl: 'centerRight' }),
    );
  });

  it("leaves MapGL's default corner when omitted", async () => {
    await renderHandle();
    expect(mapCtor.mock.calls[0]![0]).not.toHaveProperty('zoomControl');
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
  attributes: Record<string, string>;
  animations: Array<{ keyframes: unknown; timing: Record<string, unknown> }>;
  appendChild(child: FakeElement): void;
  setAttribute(name: string, value: string): void;
  animate(keyframes: unknown, timing: Record<string, unknown>): void;
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
        attributes: {},
        animations: [],
        appendChild(child) {
          this.children.push(child);
        },
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        animate(keyframes, timing) {
          this.animations.push({ keyframes, timing });
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

describe('marker reconciliation (CR-171)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const ring = (id: string, lat: number, extra = {}) => ({
    id,
    point: { lat, lng: 37 },
    shape: 'ring' as const,
    label: '07:30',
    ...extra,
  });

  it('keeps an unchanged marker, moves a moved one, rebuilds a changed one', async () => {
    vi.stubGlobal('document', fakeDocument());
    const handle = await renderHandle();
    handle.setMarkers([ring('a', 55), ring('b', 56), ring('c', 57)]);
    const [a, b, c] = htmlMarkers;

    handle.setMarkers([
      ring('a', 55),
      ring('b', 56.5),
      ring('c', 57, { selected: true }),
    ]);

    // `a`: same object, untouched — a running pulse would survive.
    expect(a!.destroy).not.toHaveBeenCalled();
    expect(a!.setCoordinates).not.toHaveBeenCalled();
    // `b`: moved in place, not rebuilt.
    expect(b!.destroy).not.toHaveBeenCalled();
    expect(b!.setCoordinates).toHaveBeenCalledWith([37, 56.5]);
    // `c`: its look changed, so it is rebuilt.
    expect(c!.destroy).toHaveBeenCalled();
    expect(htmlMarkers).toHaveLength(4);
  });

  it('destroys markers that are gone and gives repeated ids their own marker', async () => {
    vi.stubGlobal('document', fakeDocument());
    const handle = await renderHandle();
    handle.setMarkers([ring('a', 55), ring('a', 55), ring('b', 56)]);
    expect(htmlMarkers).toHaveLength(3);

    handle.setMarkers([ring('a', 55)]);
    expect(htmlMarkers.filter((m) => m.destroy.mock.calls.length)).toHaveLength(
      2,
    );

    handle.destroy();
    expect(htmlMarkers.every((m) => m.destroy.mock.calls.length)).toBe(true);
  });
});

describe('ring pulse (CR-171)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pulses a few times behind the ring, then stops (finite)', async () => {
    vi.stubGlobal('document', fakeDocument());
    const handle = await renderHandle();
    handle.setMarkers([
      {
        id: 'ride-1',
        point: { lat: 55.75, lng: 37.61 },
        shape: 'ring',
        color: '#82668c',
        pulse: true,
      },
    ]);

    const [pulse, ring] = lastHtmlMarker().html.children;
    expect(pulse!.dataset.pulse).toBe('true');
    expect(pulse!.style.cssText).toContain('border:2px solid #82668c');
    expect(ring!.style.cssText).toContain('border:3px solid #82668c');
    expect(pulse!.animations).toHaveLength(1);
    expect(pulse!.animations[0]!.timing).toMatchObject({ iterations: 3 });
  });

  it('adds nothing without `pulse`', async () => {
    vi.stubGlobal('document', fakeDocument());
    const handle = await renderHandle();
    handle.setMarkers([
      { id: 'ride-1', point: { lat: 1, lng: 1 }, shape: 'ring', label: '9' },
    ]);
    const { html } = lastHtmlMarker();
    expect(html.children.some((child) => child.dataset.pulse)).toBe(false);
  });
});

describe('tag markers (CR-171)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('draws a tick on the point and a non-interactive pill with a meter above it', async () => {
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
        id: 'difficulty',
        point: { lat: 55.8, lng: 37.7 },
        shape: 'tag',
        label: 'Средний',
        color: '#82668c',
        haloColor: '#ffffff',
        meter: { filled: 3, total: 5 },
      },
    ]);

    const options = lastHtmlMarker();
    expect(options.anchor).toEqual([0, 0]);
    expect(options.zIndex).toBe(0);
    expect(options).not.toHaveProperty('interactive');
    const { html } = options;
    expect(html.style.cssText).toContain('pointer-events:none');
    expect(html.listeners).toEqual({});
    const [tick, pill] = html.children;
    expect(tick!.style.cssText).toContain('border:2px solid #82668c');
    expect(pill!.style.cssText).toContain('background:#ffffff');
    const [meter, text] = pill!.children;
    expect(meter!.attributes['aria-hidden']).toBe('true');
    const filled = meter!.children.filter((segment) =>
      segment.style.cssText.includes('background:#82668c'),
    );
    expect(meter!.children).toHaveLength(5);
    expect(filled).toHaveLength(3);
    expect(text!.textContent).toBe('Средний');
    // No `revealDelayMs`: shown at once.
    expect(html.animations).toHaveLength(0);
  });

  it('fades in after `revealDelayMs`', async () => {
    vi.stubGlobal('document', fakeDocument());
    const handle = await renderHandle();
    handle.setMarkers([
      {
        id: 'summit',
        point: { lat: 1, lng: 1 },
        shape: 'tag',
        label: '▲ 214 м',
        revealDelayMs: 450,
      },
    ]);
    const { html } = lastHtmlMarker();
    expect(html.children[1]!.children).toHaveLength(1); // no meter
    expect(html.animations[0]!.timing).toMatchObject({
      delay: 450,
      fill: 'backwards',
    });
  });
});

describe('polyline draw-in (CR-171)', () => {
  let now = 0;
  let frames: Array<() => void> = [];

  function runFrames(ms: number) {
    now += ms;
    const pending = frames;
    frames = [];
    for (const frame of pending) frame();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    frames = [];
    now = 0;
  });

  function stubClock() {
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      frames = [];
    });
  }

  const straight = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 0, lng: 2 },
  ];

  it('draws the line in at a constant pace, never blinking out', async () => {
    stubClock();
    const handle = await renderHandle();
    handle.setPolyline({ points: straight, drawInMs: 1000 });
    // First frame: nothing drawable yet (a single point).
    expect(polylines).toHaveLength(0);

    runFrames(250);
    expect(polylines.at(-1)!.coordinates.at(-1)).toEqual([0.5, 0]);
    runFrames(500);
    const halfway = polylines.at(-1)!;
    expect(halfway.coordinates.at(-1)).toEqual([1.5, 0]);
    // The previous segment was replaced only once the next existed.
    expect(polylines.at(-2)!.destroy).toHaveBeenCalled();

    runFrames(400);
    expect(polylines.at(-1)!.coordinates).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    expect(frames).toHaveLength(0); // done, no more frames
  });

  it('continues a running draw on new points instead of restarting it', async () => {
    stubClock();
    const handle = await renderHandle();
    handle.setPolyline({ points: straight, drawInMs: 1000 });
    runFrames(500);

    const finer = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.5 },
      { lat: 0, lng: 1 },
      { lat: 0, lng: 1.5 },
      { lat: 0, lng: 2 },
    ];
    handle.setPolyline({ points: finer });
    // Same progress (half), on the new geometry.
    expect(polylines.at(-1)!.coordinates).toEqual([
      [0, 0],
      [0.5, 0],
      [1, 0],
    ]);
    runFrames(600);
    expect(polylines.at(-1)!.coordinates).toHaveLength(5);
  });

  it('shows the whole line at once without `drawInMs`, and clears on null', async () => {
    stubClock();
    const handle = await renderHandle();
    handle.setPolyline({ points: straight });
    expect(polylines.at(-1)!.coordinates).toHaveLength(3);
    expect(frames).toHaveLength(0);

    handle.setPolyline({ points: straight, drawInMs: 1000 });
    handle.setPolyline(null);
    expect(frames).toHaveLength(0);
    expect(polylines.every((line) => line.destroy.mock.calls.length)).toBe(
      true,
    );
  });
});

describe('linePrefix (CR-171)', () => {
  const line = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 0, lng: 3 },
  ];

  it('cuts by length along the line, ending on an interpolated point', () => {
    expect(linePrefix(line, 0.5)).toEqual([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 0, lng: 1.5 },
    ]);
  });

  it('returns the start alone at 0 and the whole line at 1', () => {
    expect(linePrefix(line, 0)).toEqual([{ lat: 0, lng: 0 }]);
    expect(linePrefix(line, 1)).toBe(line);
  });
});

// QA live audit 2026-10-08, item 6: the composition point's labels reach the
// SDK's controls, and stop being watched with the map.
describe('controlLabels', () => {
  it('labels the controls in the container and stops watching on destroy', async () => {
    const observed: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal(
      'MutationObserver',
      class {
        disconnect = vi.fn();
        constructor() {
          observed.push(this);
        }
        observe() {}
      },
    );
    const querySelectorAll = vi.fn(() => []);
    const renderer = create2GisMapRenderer({
      apiKey: 'test-key',
      controlLabels: { zoomIn: 'in', zoomOut: 'out', attribution: 'logo' },
    });
    const handle = await renderer.render({
      container: { querySelectorAll } as unknown as HTMLElement,
      center: { lat: 55.75, lng: 37.61 },
    });
    expect(querySelectorAll).toHaveBeenCalledWith('button');
    expect(observed).toHaveLength(1);
    handle.destroy();
    expect(observed[0]!.disconnect).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
