/**
 * Smooth Tests
 * Tests for Chaikin smoothing algorithm
 */

import { describe, it, expect } from 'vitest';
import { lineString, polygon } from '@turf/helpers';
import type { Position } from 'geojson';
import { smooth, smoothCoords } from '../../src/lib/dem';

describe('smooth', () => {
  it('smooths a LineString correctly', () => {
    const line = lineString([[0, 0], [1, 1]]);

    const smoothed = smooth(line, { iterations: 2, factor: 0.25 });

    // Expected: LINESTRING (0 0, 0.375 0.375, 0.625 0.625, 0.75 0.75, 1 1)
    const coords = smoothed.geometry.coordinates;
    expect(coords).toHaveLength(5);

    // First point preserved
    expect(coords[0][0]).toBeCloseTo(0, 6);
    expect(coords[0][1]).toBeCloseTo(0, 6);

    // Second point
    expect(coords[1][0]).toBeCloseTo(0.375, 6);
    expect(coords[1][1]).toBeCloseTo(0.375, 6);

    // Third point
    expect(coords[2][0]).toBeCloseTo(0.625, 6);
    expect(coords[2][1]).toBeCloseTo(0.625, 6);

    // Fourth point
    expect(coords[3][0]).toBeCloseTo(0.75, 6);
    expect(coords[3][1]).toBeCloseTo(0.75, 6);

    // Last point preserved
    expect(coords[4][0]).toBeCloseTo(1, 6);
    expect(coords[4][1]).toBeCloseTo(1, 6);
  });

  it('handles empty coordinates', () => {
    const coords: Position[] = [];
    const smoothed = smoothCoords(coords, { iterations: 2, factor: 0.25 });
    expect(smoothed).toHaveLength(0);
  });

  it('handles single point', () => {
    const coords: Position[] = [[5, 5]];
    const smoothed = smoothCoords(coords, { iterations: 2, factor: 0.25 });
    expect(smoothed).toHaveLength(1);
    expect(smoothed[0][0]).toBe(5);
    expect(smoothed[0][1]).toBe(5);
  });

  it('smooths a polygon (ring)', () => {
    const poly = polygon([[
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0], // closed
    ]]);

    const smoothed = smooth(poly, { iterations: 2, factor: 0.25 });

    // Rings: 4 unique points (excluding closing point), 2 iterations = 4 * 2^2 = 16 + 1 closing = 17
    expect(smoothed.geometry.coordinates[0].length).toBe(17);
  });

  it('respects iterations parameter', () => {
    const coords: Position[] = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];

    // More iterations = more points (but with endpoint preservation)
    const result1 = smoothCoords(coords, { iterations: 1, factor: 0.25 });
    const result3 = smoothCoords(coords, { iterations: 3, factor: 0.25 });

    expect(result3.length).toBeGreaterThan(result1.length);
  });
});
