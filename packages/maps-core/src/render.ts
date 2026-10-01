import type { LatLng } from './types.js';

// Web-only rendering surface (`.claude/rules/maps.md`) — server code never
// imports this file. Provider-neutral by construction: only ordinary
// browser DOM types (`HTMLElement`) and this package's own `LatLng` appear
// here, no 2GIS (or any vendor) SDK type. `packages/maps-2gis` implements
// `MapRenderer` against the real MapGL SDK; a future provider swap
// (ADR-010) implements the same interface without touching any caller.

export interface MapMarkerInput {
  id: string;
  point: LatLng;
  /** Optional fill color (any valid CSS color string) and short text/symbol
   * shown inside the marker — lets a caller render a small set of visually
   * distinct typed pins (e.g. route-point categories, ADR-020 KI-036) instead
   * of the provider's default plain pin icon. Omit both for the default pin. */
  color?: string;
  label?: string;
  /** CR-118: `'dot'` (default) is the small filled pin above; `'ring'` is an
   * orienteering control circle — a hollow ring in `color` with `label`
   * set as a caption beside it (discovery's start pins, «07:30»).
   * CR-171: `'tag'` — a small non-interactive note *on a line*: a tick on
   * the point and `label` (plus an optional `meter`) on a `haloColor` pill
   * above it, ink in `color`. Clicks pass through it. */
  shape?: 'dot' | 'ring' | 'tag';
  /** CR-118: emphasised state (the ring fills with `color`, its caption
   * becomes a filled tag) and drawn above unselected markers. */
  selected?: boolean;
  /** CR-118: contrasting "paper" color for a `'ring'` marker's halo and
   * its selected caption's text. The renderer picks a default if omitted. */
  haloColor?: string;
  /** CR-171, `'ring'` only: a few soft pulses out of the ring when the marker
   * is created, then still (finite — WCAG 2.2.2). The caller omits it under
   * reduced motion. */
  pulse?: boolean;
  /** CR-171: fade the marker in after this many ms instead of showing it at
   * once — a tag appearing as a drawing line reaches it. The caller omits it
   * under reduced motion. */
  revealDelayMs?: number;
  /** CR-171, `'tag'` only: a small segment meter before the label —
   * difficulty's `filled` of `total` (`docs/design.md` §6). */
  meter?: { filled: number; total: number };
}

export interface MapPolylineInput {
  points: LatLng[];
  /** Any valid CSS color string; the renderer picks its own default if omitted. */
  color?: string;
  /** Line width in pixels; the renderer picks its own default if omitted
   * (CR-107, "Quiet Instrument" — a bolder route line, still primary-only). */
  width?: number;
  /** 0-1; fully opaque if omitted. Only honored together with a hex `color`
   * (see `packages/maps-2gis`) — a non-hex `color` renders at full opacity. */
  opacity?: number;
  /** Optional contrasting casing drawn under the line (2px wider each side),
   * so the route stays legible over any basemap. Omit for no casing. */
  outlineColor?: string;
  /** CR-171: draw the line in from its first point to its last over this
   * many ms, at a constant pace along its length (so point `f` of the way
   * along is reached at `f * drawInMs`). An update *without* it while a draw
   * is running continues that draw on the new points — a finer geometry
   * replacing a preview mid-draw does not restart it. The caller omits it
   * under reduced motion. */
  drawInMs?: number;
}

export interface MapFitOptions {
  /** Inner padding in pixels between the fitted points and the map edge. */
  padding?: number;
  /** Upper zoom bound — a single point or a very short route must not zoom
   * in to street-number level. */
  maxZoom?: number;
  /** CR-171: animate the camera move over this many ms; `0` jumps (reduced
   * motion). Omit for an immediate fit (pre-CR-171 behaviour). A re-fit after
   * a container resize is always immediate. */
  durationMs?: number;
}

/** CR-170: an eased camera move — the discovery map's "light shift" to a
 * selected ride. */
export interface MapPanOptions {
  /** Animation length in ms; `0` jumps at once (reduced motion). Omit for
   * the provider's default. */
  durationMs?: number;
}

export interface MapRenderOptions {
  container: HTMLElement;
  center: LatLng;
  zoom?: number;
  /** Called with the map coordinate under a click/tap on the map surface
   * (CR-114's route builder places waypoints this way). */
  onClick?: (point: LatLng) => void;
  /** CR-118: called with a marker's `id` when that marker is clicked/tapped
   * (discovery selects the matching list row). */
  onMarkerClick?: (id: string) => void;
  /** Where the provider's zoom buttons sit, so a caller can keep them clear
   * of its own overlay (the ride hero's view switch is top-right). Omit for
   * the provider's default corner. */
  zoomControlPosition?: 'topRight' | 'centerRight' | 'bottomRight';
}

export interface MapHandle {
  setMarkers(markers: MapMarkerInput[]): void;
  /** Draws one route line, replacing any previous one; `null` clears it. */
  setPolyline(polyline: MapPolylineInput | null): void;
  /** Moves/zooms the camera so every given point is visible. No-op for an
   * empty list. */
  fitBounds(points: LatLng[], options?: MapFitOptions): void;
  /** CR-170: moves the camera centre to `point` without changing the zoom. */
  panTo(point: LatLng, options?: MapPanOptions): void;
  destroy(): void;
}

export interface MapRenderer {
  render(options: MapRenderOptions): Promise<MapHandle>;
}
