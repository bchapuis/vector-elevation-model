/**
 * Pipeline validation tests
 * Tests each step of the contour generation pipeline independently
 */

import { describe, it, expect } from 'vitest';
import { lineString } from '@turf/helpers';
import type { Feature, LineString } from 'geojson';

import { traceLines } from '../../src/lib/dem';
import {
  createTransform,
  transformFeatures,
} from '../../src/lib/tiles/coordinate-transform';
import { encodeFeatures } from '../../src/lib/tiles/encoder';
import { TILE_SIZE, MVT_EXTENT } from '../../src/lib/tiles/types';

/**
 * Decodes Terrarium RGB to elevation.
 * Formula: elevation = (R * 256 + G + B / 256) - 32768
 */
function terrariumToElevation(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

describe('Pipeline Step 1: Terrarium Decoding', () => {
  it('decodes sea level correctly (r=128, g=0, b=0)', () => {
    const elevation = terrariumToElevation(128, 0, 0);
    expect(elevation).toBeCloseTo(0, 0);
  });

  it('decodes 1000m elevation correctly', () => {
    const elevation = terrariumToElevation(131, 232, 0);
    expect(elevation).toBeCloseTo(1000, 0);
  });

  it('decodes 4000m elevation (Alpine peaks)', () => {
    const elevation = terrariumToElevation(143, 160, 0);
    expect(elevation).toBeCloseTo(4000, 0);
  });
});

describe('Pipeline Step 2: Contour Tracing', () => {
  it('traces contours from a simple elevation grid', () => {
    const grid = new Float64Array([
      0,   100, 200, 300, 400,
      100, 200, 300, 400, 500,
      200, 300, 400, 500, 600,
      300, 400, 500, 600, 700,
      400, 500, 600, 700, 800,
    ]);

    const contours = traceLines(grid, 5, 5, 200);

    expect(contours.length).toBeGreaterThan(0);
    expect(contours[0].geometry.type).toBe('LineString');
    expect(contours[0].properties?.level).toBe(200);
  });

  it('traces multiple contours in range', () => {
    const grid = new Float64Array([
      0,   100, 200, 300, 400,
      100, 200, 300, 400, 500,
      200, 300, 400, 500, 600,
      300, 400, 500, 600, 700,
      400, 500, 600, 700, 800,
    ]);

    const contours = traceLines(grid, 5, 5, [200, 400, 600, 800]);
    const levels = contours.map(c => c.properties?.level);
    expect(levels).toContain(200);
    expect(levels).toContain(400);
    expect(levels).toContain(600);
  });

  it('contour coordinates are within grid bounds', () => {
    const grid = new Float64Array([
      0,   100, 200, 300, 400,
      100, 200, 300, 400, 500,
      200, 300, 400, 500, 600,
      300, 400, 500, 600, 700,
      400, 500, 600, 700, 800,
    ]);

    const contours = traceLines(grid, 5, 5, 400);

    for (const contour of contours) {
      for (const coord of contour.geometry.coordinates) {
        expect(coord[0]).toBeGreaterThanOrEqual(0);
        expect(coord[0]).toBeLessThanOrEqual(4);
        expect(coord[1]).toBeGreaterThanOrEqual(0);
        expect(coord[1]).toBeLessThanOrEqual(4);
      }
    }
  });
});

describe('Pipeline Step 3: Coordinate Transform', () => {
  it('transforms grid coords to MVT coords', () => {
    const transform = createTransform({
      bufferPx: 0,
      tileSizePx: 256,
      mvtExtent: 4096,
    });

    expect(transform([0, 0])).toEqual([0, 0]);
    expect(transform([256, 256])).toEqual([4096, 4096]);
    expect(transform([128, 128])).toEqual([2048, 2048]);
  });

  it('transforms grid coords with 4px buffer', () => {
    const transform = createTransform({
      bufferPx: 4,
      tileSizePx: 256,
      mvtExtent: 4096,
    });

    expect(transform([4, 4])).toEqual([0, 0]);
    expect(transform([260, 260])).toEqual([4096, 4096]);
    expect(transform([0, 0])).toEqual([-64, -64]);
  });

  it('transforms features correctly', () => {
    const features: Feature<LineString>[] = [
      lineString([[4, 4], [132, 132], [260, 260]], { level: 100 }),
    ];

    const transformed = transformFeatures(features, {
      bufferPx: 4,
      tileSizePx: 256,
      mvtExtent: 4096,
    });

    expect(transformed[0].geometry.coordinates).toEqual([
      [0, 0],
      [2048, 2048],
      [4096, 4096],
    ]);
    expect(transformed[0].properties?.level).toBe(100);
  });
});

describe('Pipeline Step 4: MVT Encoding', () => {
  it('encodes simple features to valid MVT', () => {
    const features: Feature<LineString>[] = [
      lineString([[0, 0], [2048, 2048], [4096, 4096]], { level: 100, index: true }),
    ];

    const mvt = encodeFeatures(features, {
      layerName: 'contour',
      extent: 4096,
      compress: false,
    });

    expect(mvt).toBeInstanceOf(Uint8Array);
    expect(mvt.length).toBeGreaterThan(0);

    const decoder = new TextDecoder();
    const text = decoder.decode(mvt);
    expect(text).toContain('contour');
  });

  it('encodes multiple features', () => {
    const features: Feature<LineString>[] = [
      lineString([[0, 0], [1000, 1000]], { level: 100, index: false }),
      lineString([[2000, 2000], [4096, 4096]], { level: 200, index: false }),
      lineString([[0, 2048], [4096, 2048]], { level: 500, index: true }),
    ];

    const mvt = encodeFeatures(features, {
      layerName: 'contour',
      extent: 4096,
      compress: false,
    });

    expect(mvt.length).toBeGreaterThan(0);
  });

  it('encodes empty feature array', () => {
    const features: Feature<LineString>[] = [];

    const mvt = encodeFeatures(features, {
      layerName: 'contour',
      extent: 4096,
      compress: false,
    });

    expect(mvt).toBeInstanceOf(Uint8Array);
  });
});

describe('Pipeline: Full Integration', () => {
  it('processes a grid through the full pipeline', () => {
    const gridSize = 264; // 256 + 2*4 buffer
    const bufferPx = 4;
    const grid = new Float64Array(gridSize * gridSize);

    // Create elevation data: a hill in the center
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const cx = gridSize / 2;
        const cy = gridSize / 2;
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        grid[y * gridSize + x] = Math.max(0, 1000 - dist * 10);
      }
    }

    // Trace contours
    const levels: number[] = [];
    for (let l = 0; l < 1000; l += 100) levels.push(l);
    const contours = traceLines(grid, gridSize, gridSize, levels);
    expect(contours.length).toBeGreaterThan(0);

    // Transform to MVT coordinates
    const transformed = transformFeatures(contours as Feature<LineString>[], {
      bufferPx,
      tileSizePx: TILE_SIZE,
      mvtExtent: MVT_EXTENT,
    });
    expect(transformed.length).toBe(contours.length);

    // Verify some coordinates are in valid MVT range
    let hasValidCoords = false;
    for (const feature of transformed) {
      for (const coord of feature.geometry.coordinates as number[][]) {
        if (coord[0] >= 0 && coord[0] <= MVT_EXTENT &&
            coord[1] >= 0 && coord[1] <= MVT_EXTENT) {
          hasValidCoords = true;
        }
      }
    }
    expect(hasValidCoords).toBe(true);

    // Encode to MVT
    const mvt = encodeFeatures(transformed, {
      layerName: 'contour',
      extent: MVT_EXTENT,
      compress: false,
    });

    expect(mvt.length).toBeGreaterThan(0);

    const decoder = new TextDecoder();
    const text = decoder.decode(mvt);
    expect(text).toContain('contour');
  });
});
