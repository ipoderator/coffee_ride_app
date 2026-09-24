import { projectRoutePreview, smoothRoutePreview } from '../lib/route-preview';

const SIZE = 32;

/**
 * CR-118: the legend row's key symbol — the ride's own route shape drawn in the
 * route overprint (`stroke-route`, `docs/design.md` §1), the way a map legend
 * shows a sample of the line it explains. Without a route, the orienteering
 * start triangle in ink. Purely decorative (`aria-hidden`): the row's text
 * already says everything the glyph shows.
 */
export function RoutePreviewGlyph({
  routePreview,
}: {
  routePreview: Array<[number, number]> | null;
}) {
  const points = projectRoutePreview(
    routePreview ? smoothRoutePreview(routePreview) : null,
    SIZE,
    2,
  );

  return (
    <svg
      aria-hidden="true"
      data-testid={points ? 'route-preview-glyph' : 'start-glyph'}
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="shrink-0"
    >
      {points ? (
        <polyline
          points={points}
          className="fill-none stroke-route"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <polygon
          points="16,8 24,22 8,22"
          className="fill-none stroke-text"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
