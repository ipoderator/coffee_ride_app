/**
 * CR-118: fits a ride's `routePreview` (`[lat, lng]` pairs, CR-116) into a
 * square SVG box for the legend row's little route glyph.
 *
 * - longitude is scaled by `cos(mean latitude)` so the shape keeps its real
 *   proportions (at Moscow's latitude a degree of longitude is ~0.56 of a
 *   degree of latitude — unscaled, every route would look stretched sideways);
 * - latitude grows northwards but SVG `y` grows downwards, so `y` is inverted;
 * - the longer side fills the box (minus `padding`), the shorter one is
 *   centred.
 *
 * Returns an SVG `points` attribute string, or `null` when there is nothing
 * drawable (fewer than two points, or every point in the same place).
 */
export function projectRoutePreview(
  points: ReadonlyArray<readonly [number, number]> | null,
  size = 32,
  padding = 2,
): string | null {
  if (!points || points.length < 2) return null;

  const meanLat = points.reduce((sum, [lat]) => sum + lat, 0) / points.length;
  const lngScale = Math.cos((meanLat * Math.PI) / 180);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [lat, lng] of points) {
    const x = lng * lngScale;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, lat);
    maxY = Math.max(maxY, lat);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const span = Math.max(width, height);
  if (span === 0) return null;

  const inner = size - padding * 2;
  const scale = inner / span;
  const offsetX = padding + (inner - width * scale) / 2;
  const offsetY = padding + (inner - height * scale) / 2;

  return points
    .map(([lat, lng]) => {
      const x = offsetX + (lng * lngScale - minX) * scale;
      const y = offsetY + (maxY - lat) * scale;
      return `${round(x)},${round(y)}`;
    })
    .join(' ');
}

function round(value: number): string {
  return String(Math.round(value * 10) / 10);
}
