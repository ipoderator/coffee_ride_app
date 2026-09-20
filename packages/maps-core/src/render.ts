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
}

export interface MapRenderOptions {
  container: HTMLElement;
  center: LatLng;
  zoom?: number;
}

export interface MapHandle {
  setMarkers(markers: MapMarkerInput[]): void;
  destroy(): void;
}

export interface MapRenderer {
  render(options: MapRenderOptions): Promise<MapHandle>;
}
