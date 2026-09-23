import type {
  LatLng,
  MapFitOptions,
  MapHandle,
  MapMarkerInput,
  MapPolylineInput,
  MapRenderer,
  MapRenderOptions,
} from 'maps-core';

export interface TwoGisMapRendererConfig {
  /** Public MapGL key (`NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY`). Never the
   * server-side Geocoder/Directions key (`MAPS_2GIS_API_KEY`) — CR-071. */
  apiKey: string;
}

// MapGL's own coordinate convention is [longitude, latitude] (confirmed
// against @2gis/mapgl's shipped type declarations — the opposite order from
// this project's LatLng), so every point crosses this boundary exactly once,
// here, rather than each caller having to remember the flip.
function toLngLat(point: LatLng): [number, number] {
  return [point.lng, point.lat];
}

const DEFAULT_POLYLINE_COLOR = '#3b82f6';
const DEFAULT_POLYLINE_WIDTH = 4;
const DEFAULT_FIT_PADDING = 40;
const DEFAULT_FIT_MAX_ZOOM = 15;
// Extra width (px, total) of the optional casing line drawn under the route.
const OUTLINE_EXTRA_WIDTH = 4;
const DEFAULT_MARKER_COLOR = '#57534e';
const DEFAULT_HALO_COLOR = '#ffffff';
// CR-118 ring marker geometry: a 44×44 px hit box (the project's minimum
// touch target) with the 20 px control ring centred in it, so the anchor —
// the ring's centre — sits exactly on the coordinate.
const RING_HIT_SIZE = 44;
const RING_DIAMETER = 20;
const RING_STROKE = 3;

/**
 * CR-118: an orienteering control ring — hollow circle in `color`, a thin
 * `haloColor` knock-out on both sides of the stroke so it reads over any
 * basemap, and the `label` (discovery's start time) as a small caption to
 * its right on a paper knock-out. `selected` fills the ring and turns the
 * caption into a filled tag. Plain DOM + inline styles: no stylesheet or
 * image asset to ship, and no vendor type leaves this module.
 */
function createRingElement(input: MapMarkerInput): HTMLElement {
  const color = input.color ?? DEFAULT_MARKER_COLOR;
  const halo = input.haloColor ?? DEFAULT_HALO_COLOR;
  const selected = input.selected === true;
  const offset = (RING_HIT_SIZE - RING_DIAMETER) / 2;

  const root = document.createElement('div');
  root.dataset.markerId = input.id;
  root.dataset.selected = String(selected);
  root.style.cssText = [
    'position:relative',
    `width:${RING_HIT_SIZE}px`,
    `height:${RING_HIT_SIZE}px`,
    'cursor:pointer',
  ].join(';');

  const ring = document.createElement('div');
  ring.style.cssText = [
    'position:absolute',
    `left:${offset}px`,
    `top:${offset}px`,
    `width:${RING_DIAMETER}px`,
    `height:${RING_DIAMETER}px`,
    'box-sizing:border-box',
    'border-radius:9999px',
    `border:${RING_STROKE}px solid ${color}`,
    `background:${selected ? color : 'transparent'}`,
    selected
      ? `box-shadow:0 0 0 2px ${halo}`
      : `box-shadow:0 0 0 1.5px ${halo},inset 0 0 0 1.5px ${halo}`,
  ].join(';');
  root.appendChild(ring);

  if (input.label) {
    const caption = document.createElement('span');
    caption.textContent = input.label;
    caption.style.cssText = [
      'position:absolute',
      `left:${offset + RING_DIAMETER + 2}px`,
      'top:50%',
      'transform:translateY(-50%)',
      'padding:2px 4px',
      'border-radius:2px',
      'white-space:nowrap',
      'font-family:inherit',
      'font-size:13px',
      'font-weight:600',
      'line-height:1.1',
      'font-variant-numeric:tabular-nums',
      selected
        ? `background:${color};color:${halo}`
        : `background:${halo};color:${color}`,
    ].join(';');
    root.appendChild(caption);
  }

  return root;
}

// 2GIS's own `color` option accepts 8-digit RGBA hex (`#ff0000ff`), so an
// `opacity` is applied by appending an alpha suffix rather than as a
// separate SDK option (MapGL's `PolylineOptions` has no such field). Only
// meaningful for a 6-digit hex `color` — anything else (a CSS color
// keyword/`rgb()`, in practice never seen here since every caller resolves
// its color from a hex design token via `getCssColorVar`) renders at full
// opacity rather than risk producing an invalid color string.
function withOpacity(color: string, opacity: number | undefined): string {
  if (opacity === undefined) return color;
  const hexMatch = /^#[0-9a-fA-F]{6}$/.exec(color);
  if (!hexMatch) return color;
  const alphaHex = Math.round(Math.min(1, Math.max(0, opacity)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${color}${alphaHex}`;
}

// Guards against React 18/19 dev-only Strict Mode's double-invoke of
// `useEffect` (mount → cleanup → mount): both `DiscoveryMap` and `RouteMap`
// call `render()` twice back-to-back on the *same* container before either
// call's `await import('@2gis/mapgl')` resolves. Without this, both calls
// go on to construct a real `mapglAPI.Map` on that container, and — since
// the caller's own cleanup only knows to call `destroy()` on whichever
// instance it holds a reference to, not to prevent a second construction —
// the earlier (stale) instance's later-resolving `destroy()` call would
// otherwise tear down the container's live map right out from under the
// surviving instance. Keyed by container so unrelated maps never interact;
// each `render()` call claims the next generation for its container, and
// only the call still holding the *current* generation once its async setup
// finishes actually constructs a `Map` — a superseded call returns an inert
// no-op handle instead.
const containerGeneration = new WeakMap<HTMLElement, number>();

/**
 * Browser-only MapGL renderer (`.claude/rules/maps.md`'s "Web-only rendering
 * surface"). `@2gis/mapgl`'s `load()` fetches the actual MapGL runtime from
 * 2GIS's CDN at call time — importing this module has no side effect and no
 * `window`/DOM dependency until `render()` is actually invoked from a
 * browser.
 */
export function create2GisMapRenderer(
  config: TwoGisMapRendererConfig,
): MapRenderer {
  return {
    async render(options: MapRenderOptions): Promise<MapHandle> {
      const generation = (containerGeneration.get(options.container) ?? 0) + 1;
      containerGeneration.set(options.container, generation);

      const { load } = await import('@2gis/mapgl');
      const mapglAPI = await load();

      if (containerGeneration.get(options.container) !== generation) {
        // A later `render()` call for this same container already
        // superseded this one while the SDK was loading — don't construct
        // a second live map on top of it.
        return {
          setMarkers() {},
          setPolyline() {},
          fitBounds() {},
          destroy() {},
        };
      }

      const map = new mapglAPI.Map(options.container, {
        center: toLngLat(options.center),
        zoom: options.zoom ?? 12,
        key: config.apiKey,
      });

      if (options.onClick) {
        const onClick = options.onClick;
        map.on('click', (event) => {
          const [lng, lat] = event.lngLat;
          if (lng !== undefined && lat !== undefined) onClick({ lat, lng });
        });
      }

      let markers: Array<{ destroy(): void }> = [];
      let polyline: InstanceType<typeof mapglAPI.Polyline> | null = null;
      let lastFit: { points: LatLng[]; options?: MapFitOptions } | null = null;

      function applyFit(points: LatLng[], fitOptions: MapFitOptions = {}) {
        const maxZoom = fitOptions.maxZoom ?? DEFAULT_FIT_MAX_ZOOM;
        let minLat = Infinity;
        let maxLat = -Infinity;
        let minLng = Infinity;
        let maxLng = -Infinity;
        for (const point of points) {
          minLat = Math.min(minLat, point.lat);
          maxLat = Math.max(maxLat, point.lat);
          minLng = Math.min(minLng, point.lng);
          maxLng = Math.max(maxLng, point.lng);
        }
        // A single point (or several at the same spot) has zero-area bounds —
        // MapGL's `fitBounds` would zoom in to its maximum, so center instead.
        if (minLat === maxLat && minLng === maxLng) {
          map.setCenter([minLng, minLat]);
          map.setZoom(Math.min(maxZoom, 14));
          return;
        }
        const padding = fitOptions.padding ?? DEFAULT_FIT_PADDING;
        map.fitBounds(
          { northEast: [maxLng, maxLat], southWest: [minLng, minLat] },
          {
            padding: {
              top: padding,
              right: padding,
              bottom: padding,
              left: padding,
            },
            maxZoom,
          },
        );
      }

      // MapGL sizes its canvas once, at construction. The container's final
      // size often settles later (grid/flex layout, fonts, a theme switch
      // toggling a scrollbar), which left the map drawn at a stale size and
      // the route off-center — so track the container and re-fit on resize.
      const resizeObserver =
        typeof ResizeObserver === 'undefined'
          ? null
          : new ResizeObserver(() => {
              map.invalidateSize();
              if (lastFit) applyFit(lastFit.points, lastFit.options);
            });
      resizeObserver?.observe(options.container);

      const clearMarkers = () => {
        for (const marker of markers) {
          marker.destroy();
        }
        markers = [];
      };

      // A marker with a `color`/`label` renders as a small HTML pin (KI-036's
      // typed route-point/stop markers) instead of the SDK's plain default
      // icon — `HtmlMarker` accepts an arbitrary element, so no custom icon
      // image asset is needed for a handful of solid-color dots. CR-118 adds
      // the `'ring'` shape (discovery's start pins) the same way.
      const onMarkerClick = options.onMarkerClick;

      function createMarker(input: MapMarkerInput) {
        if (input.shape !== 'ring' && !input.color && !input.label) {
          const marker = new mapglAPI.Marker(map, {
            coordinates: toLngLat(input.point),
          });
          if (onMarkerClick) {
            marker.on('click', () => onMarkerClick(input.id));
          }
          return marker;
        }
        let el: HTMLElement;
        let anchor: [number, number];
        if (input.shape === 'ring') {
          el = createRingElement(input);
          anchor = [RING_HIT_SIZE / 2, RING_HIT_SIZE / 2];
        } else {
          el = document.createElement('div');
          el.textContent = input.label ?? '';
          el.style.cssText = [
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'width:26px',
            'height:26px',
            'border-radius:9999px',
            'color:#fff',
            'font-size:13px',
            'font-weight:600',
            'line-height:1',
            'border:2px solid #fff',
            'box-shadow:0 1px 4px rgba(0,0,0,0.35)',
            `background:${input.color ?? DEFAULT_MARKER_COLOR}`,
          ].join(';');
          anchor = [13, 13];
        }
        if (onMarkerClick) {
          el.addEventListener('click', (event) => {
            event.stopPropagation();
            onMarkerClick(input.id);
          });
        }
        return new mapglAPI.HtmlMarker(map, {
          coordinates: toLngLat(input.point),
          html: el,
          anchor,
          // A selected marker draws above its neighbours; markers that never
          // set `selected` keep MapGL's default order (pre-CR-118 behaviour).
          ...(input.selected !== undefined
            ? { zIndex: input.selected ? 2 : 1 }
            : {}),
          ...(onMarkerClick ? { interactive: true } : {}),
        });
      }

      return {
        setMarkers(nextMarkers: MapMarkerInput[]) {
          clearMarkers();
          markers = nextMarkers.map(createMarker);
        },
        setPolyline(next: MapPolylineInput | null) {
          polyline?.destroy();
          polyline = null;
          if (next && next.points.length >= 2) {
            const width = next.width ?? DEFAULT_POLYLINE_WIDTH;
            polyline = new mapglAPI.Polyline(map, {
              coordinates: next.points.map(toLngLat),
              color: withOpacity(
                next.color ?? DEFAULT_POLYLINE_COLOR,
                next.opacity,
              ),
              width,
              ...(next.outlineColor
                ? {
                    color2: next.outlineColor,
                    width2: width + OUTLINE_EXTRA_WIDTH,
                  }
                : {}),
            });
          }
        },
        fitBounds(points: LatLng[], fitOptions?: MapFitOptions) {
          if (points.length === 0) return;
          lastFit = { points, options: fitOptions };
          applyFit(points, fitOptions);
        },
        destroy() {
          resizeObserver?.disconnect();
          if (containerGeneration.get(options.container) === generation) {
            containerGeneration.delete(options.container);
          }
          clearMarkers();
          polyline?.destroy();
          map.destroy();
        },
      };
    },
  };
}
