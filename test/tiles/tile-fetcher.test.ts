import { describe, it, expect } from 'vitest';
import {
  tileToMercatorBounds,
  tileToWgs84Bounds,
} from '../../src/lib/tiles/fetcher';

describe('tile-fetcher', () => {
  describe('tileToMercatorBounds', () => {
    it('should return world bounds for z0 tile', () => {
      const bounds = tileToMercatorBounds(0, 0, 0);

      // Web Mercator world extent is approximately ±20037508.34m
      const worldExtent = Math.PI * 6378137;

      expect(bounds.minX).toBeCloseTo(-worldExtent, 0);
      expect(bounds.maxX).toBeCloseTo(worldExtent, 0);
      expect(bounds.minY).toBeCloseTo(-worldExtent, 0);
      expect(bounds.maxY).toBeCloseTo(worldExtent, 0);
    });

    it('should split correctly at z1', () => {
      const nw = tileToMercatorBounds(1, 0, 0);
      const ne = tileToMercatorBounds(1, 1, 0);
      const sw = tileToMercatorBounds(1, 0, 1);
      const se = tileToMercatorBounds(1, 1, 1);

      // NW tile should have positive Y (north)
      expect(nw.maxY).toBeGreaterThan(0);
      expect(nw.minY).toBe(0);

      // SE tile should have negative Y (south)
      expect(se.maxY).toBe(0);
      expect(se.minY).toBeLessThan(0);

      // Adjacent tiles should share edges
      expect(nw.maxX).toBeCloseTo(ne.minX, 5);
      expect(nw.minY).toBeCloseTo(sw.maxY, 5);
    });

    it('should have correct tile size at z10', () => {
      const bounds = tileToMercatorBounds(10, 512, 512);
      const tileSize = bounds.maxX - bounds.minX;

      // At z10, there are 2^10 = 1024 tiles per axis
      const worldExtent = Math.PI * 6378137 * 2;
      const expectedSize = worldExtent / 1024;

      expect(tileSize).toBeCloseTo(expectedSize, 0);
    });
  });

  describe('tileToWgs84Bounds', () => {
    it('should return world bounds for z0 tile', () => {
      const bounds = tileToWgs84Bounds(0, 0, 0);

      expect(bounds.minLon).toBeCloseTo(-180, 5);
      expect(bounds.maxLon).toBeCloseTo(180, 5);
      // Web Mercator doesn't extend to poles
      expect(bounds.maxLat).toBeCloseTo(85.051129, 3);
      expect(bounds.minLat).toBeCloseTo(-85.051129, 3);
    });

    it('should return correct bounds for known tile', () => {
      // Tile 10/512/512 should be roughly at equator, prime meridian
      const bounds = tileToWgs84Bounds(10, 512, 512);

      expect(bounds.minLon).toBeCloseTo(0, 1);
      expect(bounds.maxLon).toBeCloseTo(0.35, 1);
      expect(bounds.minLat).toBeCloseTo(-0.35, 1);
      expect(bounds.maxLat).toBeCloseTo(0, 1);
    });

    it('should return positive lat for northern tiles', () => {
      // z1/0/0 is NW quadrant - extends from equator (y=1 border) up to max lat
      const bounds = tileToWgs84Bounds(1, 0, 0);

      // minLat is at the equator (0), maxLat is positive (north)
      expect(bounds.minLat).toBeCloseTo(0, 5);
      expect(bounds.maxLat).toBeGreaterThan(0);
      expect(bounds.maxLat).toBeGreaterThan(bounds.minLat);
    });

    it('should return negative lat for southern tiles', () => {
      // z1/0/1 is SW quadrant - extends from equator (y=0 border) down to min lat
      const bounds = tileToWgs84Bounds(1, 0, 1);

      // maxLat is at the equator (0), minLat is negative (south)
      expect(bounds.maxLat).toBeCloseTo(0, 5);
      expect(bounds.minLat).toBeLessThan(0);
      expect(bounds.minLat).toBeLessThan(bounds.maxLat);
    });
  });
});
