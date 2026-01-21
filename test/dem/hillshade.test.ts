/**
 * Hillshade Tests
 * Tests for hillshade calculation
 */

import { describe, it, expect } from 'vitest';
import { hillshade, getResolution, toImageData } from '../../src/lib/dem';

describe('hillshade', () => {
  it('calculates hillshade with valid input', () => {
    const dem = [
      1, 2, 3,
      4, 5, 6,
      7, 8, 9,
    ];

    const result = hillshade(dem, 3, 3, 1, { altitude: 45, azimuth: 315 });

    expect(result).not.toBeNull();
    expect(result.data.length).toBe(dem.length);
  });

  describe('validation errors', () => {
    it('throws on null grid', () => {
      expect(() => {
        hillshade(null as any, 3, 3, 1);
      }).toThrow('Grid data cannot be null or empty');
    });

    it('throws on empty grid', () => {
      expect(() => {
        hillshade([], 3, 3, 1);
      }).toThrow('Grid data cannot be null or empty');
    });

    it('throws on zero width', () => {
      expect(() => {
        hillshade(new Array(9).fill(0), 0, 3, 1);
      }).toThrow('Grid dimensions must be positive');
    });

    it('throws on zero height', () => {
      expect(() => {
        hillshade(new Array(9).fill(0), 3, 0, 1);
      }).toThrow('Grid dimensions must be positive');
    });

    it('throws on grid/dimension mismatch', () => {
      expect(() => {
        hillshade(new Array(9).fill(0), 2, 2, 1);
      }).toThrow();
    });

    it('throws on altitude below 0', () => {
      expect(() => {
        hillshade(new Array(9).fill(0), 3, 3, 1, { altitude: -1, azimuth: 315 });
      }).toThrow('Altitude must be between 0 and 90 degrees');
    });

    it('throws on altitude above 90', () => {
      expect(() => {
        hillshade(new Array(9).fill(0), 3, 3, 1, { altitude: 91, azimuth: 315 });
      }).toThrow('Altitude must be between 0 and 90 degrees');
    });

    it('throws on azimuth below 0', () => {
      expect(() => {
        hillshade(new Array(9).fill(0), 3, 3, 1, { altitude: 45, azimuth: -1 });
      }).toThrow('Azimuth must be between 0 and 360 degrees');
    });

    it('throws on azimuth above 360', () => {
      expect(() => {
        hillshade(new Array(9).fill(0), 3, 3, 1, { altitude: 45, azimuth: 361 });
      }).toThrow('Azimuth must be between 0 and 360 degrees');
    });
  });

  it('produces output in 0-255 range', () => {
    const dem = new Array(100).fill(0).map(() => Math.random() * 1000);

    const result = hillshade(dem, 10, 10, 1, { altitude: 45, azimuth: 315 });

    for (const value of result.data) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(255);
    }
  });
});

describe('getResolution', () => {
  it('returns expected values for zoom levels', () => {
    // At zoom level 0, one tile covers the whole world
    const res0 = getResolution(0);
    expect(res0).toBeCloseTo(156543.03, 1); // ~156km per pixel

    // At zoom level 10, much higher resolution
    const res10 = getResolution(10);
    expect(res10).toBeCloseTo(152.87, 1); // ~153m per pixel

    // Each zoom level doubles the resolution
    const res1 = getResolution(1);
    expect(res0 / res1).toBeCloseTo(2, 5);
  });
});

describe('toImageData', () => {
  it('converts hillshade grid to RGBA ImageData', () => {
    const grid = {
      data: new Float64Array([0, 128, 255, 64]),
      width: 2,
      height: 2,
    };

    const imageData = toImageData(grid);

    expect(imageData.width).toBe(2);
    expect(imageData.height).toBe(2);
    expect(imageData.data.length).toBe(16); // 4 pixels * 4 channels (RGBA)
  });

  it('maps grayscale values to RGB channels with full alpha', () => {
    const grid = {
      data: new Float64Array([100, 200]),
      width: 2,
      height: 1,
    };

    const imageData = toImageData(grid);

    // First pixel: R=100, G=100, B=100, A=255
    expect(imageData.data[0]).toBe(100);
    expect(imageData.data[1]).toBe(100);
    expect(imageData.data[2]).toBe(100);
    expect(imageData.data[3]).toBe(255);

    // Second pixel: R=200, G=200, B=200, A=255
    expect(imageData.data[4]).toBe(200);
    expect(imageData.data[5]).toBe(200);
    expect(imageData.data[6]).toBe(200);
    expect(imageData.data[7]).toBe(255);
  });

  it('rounds fractional values', () => {
    const grid = {
      data: new Float64Array([127.4, 127.6]),
      width: 2,
      height: 1,
    };

    const imageData = toImageData(grid);

    // 127.4 rounds to 127, 127.6 rounds to 128
    expect(imageData.data[0]).toBe(127);
    expect(imageData.data[4]).toBe(128);
  });

  it('works with hillshade output', () => {
    const dem = [
      100, 150, 200,
      120, 170, 220,
      140, 190, 240,
    ];

    const result = hillshade(dem, 3, 3, 1, { altitude: 45, azimuth: 315 });
    const imageData = toImageData(result);

    expect(imageData.width).toBe(3);
    expect(imageData.height).toBe(3);
    expect(imageData.data.length).toBe(36); // 9 pixels * 4 channels

    // All alpha values should be 255
    for (let i = 3; i < imageData.data.length; i += 4) {
      expect(imageData.data[i]).toBe(255);
    }
  });
});
