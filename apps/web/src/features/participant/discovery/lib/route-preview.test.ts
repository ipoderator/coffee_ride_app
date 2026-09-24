import { describe, expect, it } from 'vitest';
import { projectRoutePreview, projectRoutePreviewToBox } from './route-preview';

describe('projectRoutePreviewToBox', () => {
  it('returns null for fewer than two points', () => {
    expect(projectRoutePreviewToBox([[55.7, 37.6]], 400, 260)).toBeNull();
    expect(projectRoutePreviewToBox([], 400, 260)).toBeNull();
    expect(projectRoutePreviewToBox(null, 400, 260)).toBeNull();
  });

  it('returns null when every point is in the same place', () => {
    expect(
      projectRoutePreviewToBox(
        [
          [55.7, 37.6],
          [55.7, 37.6],
        ],
        400,
        260,
      ),
    ).toBeNull();
  });

  it('fits points inside the given width/height box with padding', () => {
    const result = projectRoutePreviewToBox(
      [
        [55.7, 37.6],
        [55.72, 37.65],
      ],
      400,
      260,
      16,
    );
    expect(result).not.toBeNull();
    const coords = result!.split(' ').map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      return { x, y };
    });
    for (const { x, y } of coords) {
      expect(x).toBeGreaterThanOrEqual(16 - 0.5);
      expect(x).toBeLessThanOrEqual(400 - 16 + 0.5);
      expect(y).toBeGreaterThanOrEqual(16 - 0.5);
      expect(y).toBeLessThanOrEqual(260 - 16 + 0.5);
    }
  });

  it('projectRoutePreview (square) matches projectRoutePreviewToBox with width === height', () => {
    const points: Array<[number, number]> = [
      [55.7, 37.6],
      [55.71, 37.63],
      [55.68, 37.65],
    ];
    expect(projectRoutePreview(points, 32, 2)).toBe(
      projectRoutePreviewToBox(points, 32, 32, 2),
    );
  });
});
