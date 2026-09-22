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
}

export interface MapRenderOptions {
  container: HTMLElement;
  center: LatLng;
  zoom?: number;
}

export interface MapHandle {
  setMarkers(markers: MapMarkerInput[]): void;
  /** Draws one route line, replacing any previous one; `null` clears it. */
  setPolyline(polyline: MapPolylineInput | null): void;
  destroy(): void;
}

export interface MapRenderer {
  render(options: MapRenderOptions): Promise<MapHandle>;
}
