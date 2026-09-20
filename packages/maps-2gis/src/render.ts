import type {
  LatLng,
  MapHandle,
  MapMarkerInput,
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
      const { load } = await import('@2gis/mapgl');
      const mapglAPI = await load();
      const map = new mapglAPI.Map(options.container, {
        center: toLngLat(options.center),
        zoom: options.zoom ?? 12,
        key: config.apiKey,
      });

      let markers: InstanceType<typeof mapglAPI.Marker>[] = [];

      const clearMarkers = () => {
        for (const marker of markers) {
          marker.destroy();
        }
        markers = [];
      };

      return {
        setMarkers(nextMarkers: MapMarkerInput[]) {
          clearMarkers();
          markers = nextMarkers.map(
            (marker) =>
              new mapglAPI.Marker(map, {
                coordinates: toLngLat(marker.point),
              }),
          );
        },
        destroy() {
          clearMarkers();
          map.destroy();
        },
      };
    },
  };
}
