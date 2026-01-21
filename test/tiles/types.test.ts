import { describe, it, expect } from 'vitest';
import {
  getContourInterval,
  getHillshadeInterval,
  generateLevels,
  MVT_EXTENT,
  TILE_SIZE,
  SOURCE_TILE_SIZE,
  BUFFER_PX,
  DEFAULT_TILE_URL,
  MIN_ELEVATION,
  MAX_ELEVATION,
  MIN_LUMINANCE,
  MAX_LUMINANCE,
  DEFAULT_SUN_ALTITUDE,
  DEFAULT_SUN_AZIMUTH,
  CACHE_VERSION,
  DEFAULT_CACHE_TTL,
} from '../../src/lib/tiles/types';

describe('types', () => {
  describe('constants', () => {
    it('should have correct MVT extent', () => {
      expect(MVT_EXTENT).toBe(4096);
    });

    it('should have correct tile size', () => {
      expect(TILE_SIZE).toBe(256);
    });

    it('should have correct source tile size', () => {
      expect(SOURCE_TILE_SIZE).toBe(512);
    });

    it('should have correct buffer size', () => {
      expect(BUFFER_PX).toBe(8);
    });

    it('should have valid tile URL template', () => {
      expect(DEFAULT_TILE_URL).toContain('{z}');
      expect(DEFAULT_TILE_URL).toContain('{x}');
      expect(DEFAULT_TILE_URL).toContain('{y}');
    });

    it('should have valid elevation range', () => {
      expect(MIN_ELEVATION).toBe(-500);
      expect(MAX_ELEVATION).toBe(9000);
      expect(MAX_ELEVATION).toBeGreaterThan(MIN_ELEVATION);
    });

    it('should have valid luminance range', () => {
      expect(MIN_LUMINANCE).toBe(0);
      expect(MAX_LUMINANCE).toBe(256);
    });

    it('should have valid sun position defaults', () => {
      expect(DEFAULT_SUN_ALTITUDE).toBe(45);
      expect(DEFAULT_SUN_AZIMUTH).toBe(315);
    });
  });

  describe('getContourInterval', () => {
    it('should return 2000m for z1-2', () => {
      expect(getContourInterval(1)).toBe(2000);
      expect(getContourInterval(2)).toBe(2000);
    });

    it('should return 1000m for z3-7', () => {
      expect(getContourInterval(3)).toBe(1000);
      expect(getContourInterval(4)).toBe(1000);
      expect(getContourInterval(5)).toBe(1000);
      expect(getContourInterval(6)).toBe(1000);
      expect(getContourInterval(7)).toBe(1000);
    });

    it('should return 500m for z8-9', () => {
      expect(getContourInterval(8)).toBe(500);
      expect(getContourInterval(9)).toBe(500);
    });

    it('should return 250m for z10-11', () => {
      expect(getContourInterval(10)).toBe(250);
      expect(getContourInterval(11)).toBe(250);
    });

    it('should return 100m for z12-13', () => {
      expect(getContourInterval(12)).toBe(100);
      expect(getContourInterval(13)).toBe(100);
    });

    it('should return 50m for z14', () => {
      expect(getContourInterval(14)).toBe(50);
    });

    it('should return 10m for z15+', () => {
      expect(getContourInterval(15)).toBe(10);
      expect(getContourInterval(16)).toBe(10);
      expect(getContourInterval(18)).toBe(10);
      expect(getContourInterval(22)).toBe(10);
    });
  });

  describe('getHillshadeInterval', () => {
    it('should return 32 for z0-7 (8 bands)', () => {
      expect(getHillshadeInterval(0)).toBe(32);
      expect(getHillshadeInterval(5)).toBe(32);
      expect(getHillshadeInterval(7)).toBe(32);
    });

    it('should return 21 for z8-11 (~12 bands)', () => {
      expect(getHillshadeInterval(8)).toBe(21);
      expect(getHillshadeInterval(9)).toBe(21);
      expect(getHillshadeInterval(11)).toBe(21);
    });

    it('should return 16 for z12+ (16 bands)', () => {
      expect(getHillshadeInterval(12)).toBe(16);
      expect(getHillshadeInterval(15)).toBe(16);
      expect(getHillshadeInterval(18)).toBe(16);
    });
  });

  describe('generateLevels', () => {
    it('should generate levels from min to max (exclusive)', () => {
      const levels = generateLevels(0, 100, 25);
      expect(levels).toEqual([0, 25, 50, 75]);
    });

    it('should work with elevation ranges', () => {
      const levels = generateLevels(-500, 9000, 1000);
      expect(levels[0]).toBe(-500);
      expect(levels[levels.length - 1]).toBe(8500);
      expect(levels.length).toBe(10);
    });

    it('should work with luminance ranges', () => {
      const levels = generateLevels(0, 256, 32);
      expect(levels).toEqual([0, 32, 64, 96, 128, 160, 192, 224]);
    });

    it('should return empty array when min >= max', () => {
      expect(generateLevels(100, 100, 10)).toEqual([]);
      expect(generateLevels(100, 50, 10)).toEqual([]);
    });
  });

  describe('cache constants', () => {
    it('should have a valid cache version string', () => {
      expect(CACHE_VERSION).toMatch(/^\d+$/);
    });

    it('should have default cache TTL of 1 day', () => {
      const oneDay = 24 * 3600;
      expect(DEFAULT_CACHE_TTL).toBe(oneDay);
    });
  });
});
