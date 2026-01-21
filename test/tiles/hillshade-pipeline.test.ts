/**
 * Hillshade pipeline validation tests
 * Tests each step of the hillshade generation pipeline independently
 */

import { describe, it, expect } from 'vitest';
import { polygon } from '@turf/helpers';
import type { Feature, Polygon } from 'geojson';

import { hillshade, getResolution, tracePolygons } from '../../src/lib/dem';
import {
  createTransform,
  transformAndClipPolygonFeatures,
} from '../../src/lib/tiles/coordinate-transform';
import { encodeFeatures } from '../../src/lib/tiles/encoder';
import { TILE_SIZE, MVT_EXTENT, getHillshadeInterval } from '../../src/lib/tiles/types';

describe('Hillshade Pipeline Step 1: Hillshade Calculation', () => {
  it('calculates hillshade values in 0-255 range', () => {
    const size = 10;
    const grid = new Float64Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        grid[y * size + x] = x * 100;
      }
    }

    const shadeGrid = hillshade(grid, size, size, 100, { altitude: 45, azimuth: 315 });

    expect(shadeGrid.data.length).toBe(size * size);
    for (const v of shadeGrid.data) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });

  it('produces different values for sloped terrain', () => {
    const size = 10;
    const slopedGrid = new Float64Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        slopedGrid[y * size + x] = x * 100;
      }
    }

    const shadeGrid = hillshade(slopedGrid, size, size, 100, { altitude: 45, azimuth: 315 });

    const uniqueValues = new Set(shadeGrid.data);
    expect(uniqueValues.size).toBeGreaterThan(1);
  });

  it('getResolution returns expected values', () => {
    expect(getResolution(0)).toBeCloseTo(156543.03, 0);
    expect(getResolution(10)).toBeCloseTo(152.87, 0);
    expect(getResolution(15)).toBeCloseTo(4.78, 0);
  });
});

describe('Hillshade Pipeline Step 2: Shade Band Polygonization', () => {
  it('traces polygons from hillshade grid', () => {
    const size = 10;
    const grid = new Float64Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        grid[y * size + x] = (x / size) * 255;
      }
    }

    const levels: number[] = [];
    for (let l = 0; l < 256; l += 32) levels.push(l);
    const polygons = tracePolygons(grid, size, size, levels);

    expect(polygons.length).toBeGreaterThan(0);
    expect(polygons[0].geometry.type).toBe('Polygon');
  });

  it('polygon features have level property', () => {
    const size = 10;
    const grid = new Float64Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        grid[y * size + x] = (x / size) * 255;
      }
    }

    const levels: number[] = [];
    for (let l = 0; l < 256; l += 64) levels.push(l);
    const polygons = tracePolygons(grid, size, size, levels);

    for (const poly of polygons) {
      expect(poly.properties?.level).toBeDefined();
      expect(poly.properties?.level).toBeGreaterThanOrEqual(0);
      expect(poly.properties?.level).toBeLessThan(256);
    }
  });

  it('polygon coordinates are within grid bounds', () => {
    const size = 10;
    const grid = new Float64Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cx = size / 2;
        const cy = size / 2;
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        grid[y * size + x] = Math.max(0, Math.min(255, 255 - dist * 50));
      }
    }

    const levels: number[] = [];
    for (let l = 0; l < 256; l += 32) levels.push(l);
    const polygons = tracePolygons(grid, size, size, levels);

    for (const poly of polygons) {
      for (const ring of poly.geometry.coordinates) {
        for (const coord of ring as [number, number][]) {
          expect(coord[0]).toBeGreaterThanOrEqual(0);
          expect(coord[0]).toBeLessThanOrEqual(size - 1);
          expect(coord[1]).toBeGreaterThanOrEqual(0);
          expect(coord[1]).toBeLessThanOrEqual(size - 1);
        }
      }
    }
  });
});

describe('Hillshade Pipeline Step 3: Polygon Transform & Clip', () => {
  it('transforms polygon coordinates from grid to MVT space', () => {
    const transform = createTransform({
      bufferPx: 0,
      tileSizePx: 256,
      mvtExtent: 4096,
    });

    expect(transform([0, 0])).toEqual([0, 0]);
    expect(transform([256, 256])).toEqual([4096, 4096]);
  });

  it('clips polygons to tile extent', () => {
    const features: Feature<Polygon>[] = [
      polygon([[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]], { level: 128 }),
    ];

    const transformed = transformAndClipPolygonFeatures(features, {
      bufferPx: 0,
      tileSizePx: 256,
      mvtExtent: 4096,
    });

    expect(transformed.length).toBe(1);
    expect(transformed[0].geometry.type).toBe('Polygon');
    expect(transformed[0].properties?.level).toBe(128);
  });

  it('handles buffer offset correctly', () => {
    const features: Feature<Polygon>[] = [
      polygon([[[4, 4], [132, 4], [132, 132], [4, 132], [4, 4]]], { level: 64 }),
    ];

    const transformed = transformAndClipPolygonFeatures(features, {
      bufferPx: 4,
      tileSizePx: 256,
      mvtExtent: 4096,
    });

    expect(transformed.length).toBe(1);
    const coords = transformed[0].geometry.coordinates[0];
    expect(coords[0]).toEqual([0, 0]);
    expect(coords[1]).toEqual([2048, 0]);
  });
});

describe('Hillshade Pipeline Step 4: MVT Encoding', () => {
  it('encodes polygon features to valid MVT', () => {
    const features: Feature<Polygon>[] = [
      polygon([[[0, 0], [2048, 0], [2048, 2048], [0, 2048], [0, 0]]], { level: 128, shade: 0.5 }),
    ];

    const mvt = encodeFeatures(features, {
      layerName: 'hillshade',
      extent: 4096,
      compress: false,
    });

    expect(mvt).toBeInstanceOf(Uint8Array);
    expect(mvt.length).toBeGreaterThan(0);

    const decoder = new TextDecoder();
    const text = decoder.decode(mvt);
    expect(text).toContain('hillshade');
  });

  it('encodes multiple shade band polygons', () => {
    const features: Feature<Polygon>[] = [
      polygon([[[0, 0], [1000, 0], [1000, 1000], [0, 1000], [0, 0]]], { level: 64, shade: 0.25 }),
      polygon([[[1000, 1000], [2000, 1000], [2000, 2000], [1000, 2000], [1000, 1000]]], { level: 128, shade: 0.5 }),
      polygon([[[2000, 2000], [4096, 2000], [4096, 4096], [2000, 4096], [2000, 2000]]], { level: 192, shade: 0.75 }),
    ];

    const mvt = encodeFeatures(features, {
      layerName: 'hillshade',
      extent: 4096,
      compress: false,
    });

    expect(mvt.length).toBeGreaterThan(0);
  });
});

describe('Hillshade Pipeline: Configuration', () => {
  it('getHillshadeInterval returns expected intervals by zoom', () => {
    expect(getHillshadeInterval(5)).toBe(32);
    expect(getHillshadeInterval(7)).toBe(32);
    expect(getHillshadeInterval(8)).toBe(21);
    expect(getHillshadeInterval(11)).toBe(21);
    expect(getHillshadeInterval(12)).toBe(16);
    expect(getHillshadeInterval(15)).toBe(16);
  });

  it('interval values produce reasonable band counts', () => {
    expect(Math.floor(256 / getHillshadeInterval(5))).toBe(8);
    expect(Math.floor(256 / getHillshadeInterval(9))).toBe(12);
    expect(Math.floor(256 / getHillshadeInterval(14))).toBe(16);
  });
});

describe('Hillshade Pipeline: Full Integration', () => {
  it('processes elevation through full hillshade pipeline', () => {
    const gridSize = 264;
    const bufferPx = 4;
    const elevation = new Float64Array(gridSize * gridSize);

    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const cx = gridSize / 2;
        const cy = gridSize / 2;
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        elevation[y * gridSize + x] = Math.max(0, 1000 - dist * 10);
      }
    }

    const shadeGrid = hillshade(elevation, gridSize, gridSize, 100, { altitude: 45, azimuth: 315 });

    expect(shadeGrid.data.length).toBe(gridSize * gridSize);

    const levels: number[] = [];
    for (let l = 0; l < 256; l += 32) levels.push(l);
    const polygons = tracePolygons(shadeGrid.data, gridSize, gridSize, levels);

    expect(polygons.length).toBeGreaterThan(0);

    const featuresWithShade = polygons.map((feature: Feature<Polygon>) => {
      const level = feature.properties?.level ?? 0;
      return {
        ...feature,
        properties: {
          level,
          shade: level / 255,
        },
      } as Feature<Polygon>;
    });

    const transformed = transformAndClipPolygonFeatures(featuresWithShade, {
      bufferPx,
      tileSizePx: TILE_SIZE,
      mvtExtent: MVT_EXTENT,
    });

    expect(transformed.length).toBeGreaterThan(0);

    let hasValidCoords = false;
    for (const feature of transformed) {
      for (const ring of feature.geometry.coordinates) {
        for (const coord of ring) {
          if (coord[0] >= 0 && coord[0] <= MVT_EXTENT &&
              coord[1] >= 0 && coord[1] <= MVT_EXTENT) {
            hasValidCoords = true;
          }
        }
      }
    }
    expect(hasValidCoords).toBe(true);

    const mvt = encodeFeatures(transformed, {
      layerName: 'hillshade',
      extent: MVT_EXTENT,
      compress: false,
    });

    expect(mvt.length).toBeGreaterThan(0);

    const decoder = new TextDecoder();
    const text = decoder.decode(mvt);
    expect(text).toContain('hillshade');
  });

  it('shade property is correctly normalized', () => {
    const gridSize = 50;
    const grid = new Float64Array(gridSize * gridSize);
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        grid[y * gridSize + x] = (x / gridSize) * 255;
      }
    }

    const levels: number[] = [];
    for (let l = 0; l < 256; l += 32) levels.push(l);
    const polygons = tracePolygons(grid, gridSize, gridSize, levels);

    const featuresWithShade = polygons.map((feature: Feature<Polygon>) => {
      const level = feature.properties?.level ?? 0;
      return {
        ...feature,
        properties: {
          level,
          shade: level / 255,
        },
      } as Feature<Polygon>;
    });

    for (const feature of featuresWithShade) {
      const shade = feature.properties?.shade;
      expect(shade).toBeGreaterThanOrEqual(0);
      expect(shade).toBeLessThanOrEqual(1);
      expect(shade).toBeCloseTo(feature.properties?.level / 255, 5);
    }
  });
});
