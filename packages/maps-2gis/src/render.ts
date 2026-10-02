import type {
  LatLng,
  MapFitOptions,
  MapHandle,
  MapMarkerInput,
  MapPanOptions,
  MapPolylineInput,
  MapRenderer,
  MapRenderOptions,
} from 'maps-core';
import { FATAL_MAP_ERRORS, watchBasemap } from './basemap-watch.js';

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
// A superseded render's handle: every method does nothing.
const inert = (): void => {};
// CR-170: the closest MapGL easing to the UI's `--ease-quiet` curve.
const PAN_EASING = 'easeOutCubic' as const;
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

  // CR-171: soft rings expanding out of the pin and fading — behind it, and
  // gone after `PULSE_COUNT` beats.
  if (input.pulse) {
    const pulse = document.createElement('div');
    pulse.dataset.pulse = 'true';
    pulse.style.cssText = [
      'position:absolute',
      `left:${offset}px`,
      `top:${offset}px`,
      `width:${RING_DIAMETER}px`,
      `height:${RING_DIAMETER}px`,
      'box-sizing:border-box',
      'border-radius:9999px',
      `border:2px solid ${color}`,
      'opacity:0',
      'pointer-events:none',
    ].join(';');
    root.appendChild(pulse);
    play(
      pulse,
      [
        { transform: 'scale(1)', opacity: 0.6 },
        { transform: 'scale(2.6)', opacity: 0 },
      ],
      { duration: PULSE_MS, iterations: PULSE_COUNT, easing: QUIET_EASING },
    );
  }

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

// CR-171 motion: one quiet ease-out, the UI's `--ease-quiet` curve.
const QUIET_EASING = 'cubic-bezier(0.2, 0, 0, 1)';
// Pulse: three soft rings out of the start pin, then still — finite on
// purpose (WCAG 2.2.2: nothing auto-moves for more than ~5 s).
const PULSE_MS = 1400;
const PULSE_COUNT = 3;
const REVEAL_MS = 320;

/** Runs a Web Animations API animation when the element supports it (every
 * browser MapGL runs in); a no-op elsewhere, so the final state shows. */
function play(
  el: HTMLElement,
  keyframes: Keyframe[],
  timing: KeyframeAnimationOptions,
): void {
  if (typeof el.animate === 'function') el.animate(keyframes, timing);
}

/**
 * CR-171: a note on a line — a small tick on the point, and above it the
 * `label` (with an optional segment `meter`, difficulty's §6 scale) on a
 * `haloColor` pill, ink in `color`. Zero-size root anchored on the point;
 * `pointer-events:none` so it never steals a click from a pin or the map.
 */
function createTagElement(input: MapMarkerInput): HTMLElement {
  const ink = input.color ?? DEFAULT_MARKER_COLOR;
  const paper = input.haloColor ?? DEFAULT_HALO_COLOR;

  const root = document.createElement('div');
  root.dataset.markerId = input.id;
  root.style.cssText = [
    'position:relative',
    'width:0',
    'height:0',
    'pointer-events:none',
  ].join(';');

  const tick = document.createElement('span');
  tick.style.cssText = [
    'position:absolute',
    'left:-4px',
    'top:-4px',
    'width:8px',
    'height:8px',
    'box-sizing:border-box',
    'border-radius:9999px',
    `background:${paper}`,
    `border:2px solid ${ink}`,
  ].join(';');
  root.appendChild(tick);

  const pill = document.createElement('span');
  pill.style.cssText = [
    'position:absolute',
    'left:0',
    'bottom:8px',
    'transform:translateX(-50%)',
    'display:inline-flex',
    'align-items:center',
    'gap:5px',
    'padding:2px 7px',
    'border-radius:9999px',
    `background:${paper}`,
    `color:${ink}`,
    `box-shadow:0 0 0 1px ${ink}33`,
    'white-space:nowrap',
    'font-family:inherit',
    'font-size:12px',
    'font-weight:600',
    'line-height:1.25',
    'font-variant-numeric:tabular-nums',
  ].join(';');
  if (input.meter && input.meter.total > 0) {
    const meter = document.createElement('span');
    meter.setAttribute('aria-hidden', 'true');
    meter.style.cssText = 'display:inline-flex;gap:1.5px';
    for (let i = 0; i < input.meter.total; i += 1) {
      const segment = document.createElement('span');
      segment.style.cssText = [
        'width:3px',
        'height:9px',
        'box-sizing:border-box',
        'border-radius:1px',
        `border:1px solid ${ink}`,
        `background:${i < input.meter.filled ? ink : 'transparent'}`,
      ].join(';');
      meter.appendChild(segment);
    }
    pill.appendChild(meter);
  }
  const text = document.createElement('span');
  text.textContent = input.label ?? '';
  pill.appendChild(text);
  root.appendChild(pill);

  return root;
}

/**
 * CR-171: the first `fraction` of a line, measured along its length (an
 * equirectangular approximation — plenty at a ride's scale), ending on an
 * interpolated point so the draw advances smoothly between vertices.
 */
export function linePrefix(points: LatLng[], fraction: number): LatLng[] {
  if (fraction >= 1 || points.length < 2) return points;
  if (fraction <= 0) return points.slice(0, 1);
  const lengths: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const kx = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
    lengths.push(
      lengths[i - 1]! + Math.hypot((b.lng - a.lng) * kx, b.lat - a.lat),
    );
  }
  const target = lengths[lengths.length - 1]! * fraction;
  const prefix: LatLng[] = [points[0]!];
  for (let i = 1; i < points.length; i += 1) {
    const end = lengths[i]!;
    if (end < target) {
      prefix.push(points[i]!);
      continue;
    }
    const start = lengths[i - 1]!;
    const t = end > start ? (target - start) / (end - start) : 1;
    const a = points[i - 1]!;
    const b = points[i]!;
    prefix.push({
      lat: a.lat + (b.lat - a.lat) * t,
      lng: a.lng + (b.lng - a.lng) * t,
    });
    break;
  }
  return prefix;
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
          setMarkers: inert,
          setPolyline: inert,
          fitBounds: inert,
          panTo: inert,
          destroy: inert,
        };
      }

      const map = new mapglAPI.Map(options.container, {
        center: toLngLat(options.center),
        zoom: options.zoom ?? 12,
        key: config.apiKey,
        ...(options.zoomControlPosition
          ? { zoomControl: options.zoomControlPosition }
          : {}),
      });

      // CR-185: a map that exists but never draws its basemap is reported,
      // not left blank (`./basemap-watch.ts` has what MapGL does and doesn't
      // tell us).
      const basemap = options.onBasemapUnavailable
        ? watchBasemap({ onUnavailable: options.onBasemapUnavailable })
        : null;
      if (basemap) {
        map.on('styleload', () => basemap.styleLoaded());
        map.on('styleloaderror', () => basemap.fail());
        map.on('error', (event) => {
          if (FATAL_MAP_ERRORS.has(event.type)) basemap.fail();
        });
      }

      if (options.onClick) {
        const onClick = options.onClick;
        map.on('click', (event) => {
          const [lng, lat] = event.lngLat;
          if (lng !== undefined && lat !== undefined) onClick({ lat, lng });
        });
      }

      // CR-171: markers are reconciled by id — an unchanged marker keeps its
      // SDK object (and a running pulse), a moved one is moved in place.
      type LiveMarker = {
        destroy(): void;
        setCoordinates?(coordinates: number[]): unknown;
      };
      let markers = new Map<
        string,
        { key: string; shapeKey: string; marker: LiveMarker }
      >();
      let polyline: InstanceType<typeof mapglAPI.Polyline> | null = null;
      // CR-171: the line being shown, and a running draw-in (if any).
      let line: MapPolylineInput | null = null;
      let draw: {
        startedAt: number;
        durationMs: number;
        frame: number;
      } | null = null;
      let lastFit: { points: LatLng[]; options?: MapFitOptions } | null = null;

      function applyFit(points: LatLng[], fitOptions: MapFitOptions = {}) {
        const maxZoom = fitOptions.maxZoom ?? DEFAULT_FIT_MAX_ZOOM;
        // CR-171: an eased fit when asked for, a jump for `0`; omitted, the
        // SDK call stays exactly as before.
        const { durationMs } = fitOptions;
        const animation =
          durationMs === undefined
            ? undefined
            : durationMs <= 0
              ? { animate: false }
              : { duration: durationMs, easing: PAN_EASING };
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
          if (animation) {
            map.setCenter([minLng, minLat], animation);
            map.setZoom(Math.min(maxZoom, 14), animation);
          } else {
            map.setCenter([minLng, minLat]);
            map.setZoom(Math.min(maxZoom, 14));
          }
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
            ...(animation ? { animation } : {}),
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
              // A resize re-fit is a correction, not a move: never animated.
              if (lastFit) {
                applyFit(lastFit.points, {
                  ...lastFit.options,
                  durationMs: undefined,
                });
              }
            });
      resizeObserver?.observe(options.container);

      const clearMarkers = () => {
        for (const { marker } of markers.values()) {
          marker.destroy();
        }
        markers = new Map();
      };

      function buildPolyline(input: MapPolylineInput, points: LatLng[]) {
        const width = input.width ?? DEFAULT_POLYLINE_WIDTH;
        return new mapglAPI.Polyline(map, {
          coordinates: points.map(toLngLat),
          color: withOpacity(
            input.color ?? DEFAULT_POLYLINE_COLOR,
            input.opacity,
          ),
          width,
          ...(input.outlineColor
            ? {
                color2: input.outlineColor,
                width2: width + OUTLINE_EXTRA_WIDTH,
              }
            : {}),
        });
      }

      /** Shows the first `fraction` of `line`; the new object is built
       * before the old one goes, so the route never blinks out mid-draw. */
      function showLine(fraction: number) {
        const points = line ? linePrefix(line.points, fraction) : [];
        const next =
          line && points.length >= 2 ? buildPolyline(line, points) : null;
        polyline?.destroy();
        polyline = next;
      }

      function cancelDraw() {
        if (draw && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(draw.frame);
        }
        draw = null;
      }

      function drawProgress(): number {
        if (!draw) return 1;
        return Math.min(
          1,
          (performance.now() - draw.startedAt) / draw.durationMs,
        );
      }

      function drawFrame() {
        if (!draw) return;
        const progress = drawProgress();
        showLine(progress);
        if (progress < 1) {
          draw.frame = requestAnimationFrame(drawFrame);
        } else {
          draw = null;
        }
      }

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
        if (input.shape === 'tag') {
          el = createTagElement(input);
          if (input.revealDelayMs !== undefined) {
            play(el, [{ opacity: 0 }, { opacity: 1 }], {
              duration: REVEAL_MS,
              delay: Math.max(0, input.revealDelayMs),
              easing: QUIET_EASING,
              fill: 'backwards',
            });
          }
          // Below every pin, and never interactive: a note, not a target.
          return new mapglAPI.HtmlMarker(map, {
            coordinates: toLngLat(input.point),
            html: el,
            anchor: [0, 0],
            zIndex: 0,
          });
        }
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
          const next: typeof markers = new Map();
          for (const input of nextMarkers) {
            // A repeated id still gets its own marker (never leaked).
            let slot = input.id;
            for (let n = 2; next.has(slot); n += 1) slot = `${input.id}#${n}`;
            const { point, ...rest } = input;
            const shapeKey = JSON.stringify(rest);
            const key = `${shapeKey}@${point.lat},${point.lng}`;
            const current = markers.get(slot);
            if (current && current.key === key) {
              next.set(slot, current);
              markers.delete(slot);
            } else if (
              current &&
              current.shapeKey === shapeKey &&
              current.marker.setCoordinates
            ) {
              current.marker.setCoordinates(toLngLat(point));
              next.set(slot, { ...current, key });
              markers.delete(slot);
            } else {
              next.set(slot, { key, shapeKey, marker: createMarker(input) });
            }
          }
          clearMarkers();
          markers = next;
        },
        setPolyline(next: MapPolylineInput | null) {
          if (!next || next.points.length < 2) {
            cancelDraw();
            line = null;
            showLine(1);
            return;
          }
          line = next;
          const canAnimate =
            typeof requestAnimationFrame === 'function' &&
            typeof performance !== 'undefined';
          if (next.drawInMs !== undefined && next.drawInMs > 0 && canAnimate) {
            cancelDraw();
            draw = {
              startedAt: performance.now(),
              durationMs: next.drawInMs,
              frame: 0,
            };
            drawFrame();
            return;
          }
          // No new draw: continue a running one on the new points, or show
          // the whole line.
          showLine(drawProgress());
        },
        fitBounds(points: LatLng[], fitOptions?: MapFitOptions) {
          if (points.length === 0) return;
          lastFit = { points, options: fitOptions };
          applyFit(points, fitOptions);
        },
        panTo(point: LatLng, panOptions?: MapPanOptions) {
          const durationMs = panOptions?.durationMs;
          map.setCenter(
            toLngLat(point),
            durationMs === undefined
              ? { easing: PAN_EASING }
              : durationMs <= 0
                ? { animate: false }
                : { duration: durationMs, easing: PAN_EASING },
          );
        },
        destroy() {
          basemap?.stop();
          resizeObserver?.disconnect();
          if (containerGeneration.get(options.container) === generation) {
            containerGeneration.delete(options.container);
          }
          clearMarkers();
          cancelDraw();
          polyline?.destroy();
          map.destroy();
        },
      };
    },
  };
}
