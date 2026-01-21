/**
 * Elevation Utilities Tests
 * Tests for elevation encoding/decoding and grid utilities
 */

import { describe, it, expect } from 'vitest';
import {
  decodeElevation,
  encodeElevation,
  invertGrid,
  clampGrid,
  createGrid,
  WorkersImageData,
} from '../../src/lib/dem';

/**
 * Creates mock ImageData with specific RGB values for testing.
 */
function createMockImageData(pixels: [number, number, number][]): WorkersImageData {
  const size = Math.ceil(Math.sqrt(pixels.length));
  const data = new Uint8ClampedArray(size * size * 4);

  for (let i = 0; i < pixels.length; i++) {
    const [r, g, b] = pixels[i];
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }

  return new WorkersImageData(data, size, size);
}

describe('Elevation Utilities', () => {
  describe('MapBox RGB encoding', () => {
    it('decodes sea level correctly', () => {
      // elevation = (r * 256^2 + g * 256 + b) / 10 - 10000
      // For elevation = 0: value = 100000, so r=1, g=134, b=160
      const imageData = createMockImageData([[1, 134, 160]]);
      const grid = decodeElevation(imageData, 'mapbox');
      expect(grid.data[0]).toBeCloseTo(0, 1);
    });

    it('handles positive elevations', () => {
      // Mount Everest ~8849m
      // First encode then decode to verify round-trip
      const elevation = createGrid([8849], 1, 1);
      const encoded = encodeElevation(elevation, 'mapbox');
      const decoded = decodeElevation(encoded, 'mapbox');
      expect(decoded.data[0]).toBeCloseTo(8849, 0);
    });

    it('handles negative elevations', () => {
      // Dead Sea ~-430m
      const elevation = createGrid([-430], 1, 1);
      const encoded = encodeElevation(elevation, 'mapbox');
      const decoded = decodeElevation(encoded, 'mapbox');
      expect(decoded.data[0]).toBeCloseTo(-430, 0);
    });

    it('round-trips correctly', () => {
      const testElevations = [0, 100, 1000, 5000, 8849, -430, -100];

      for (const original of testElevations) {
        const grid = createGrid([original], 1, 1);
        const encoded = encodeElevation(grid, 'mapbox');
        const decoded = decodeElevation(encoded, 'mapbox');
        expect(decoded.data[0]).toBeCloseTo(original, 0);
      }
    });
  });

  describe('Terrarium encoding', () => {
    it('decodes sea level correctly', () => {
      // elevation = (r * 256 + g + b/256) - 32768
      // For elevation = 0: r=128, g=0, b=0
      const imageData = createMockImageData([[128, 0, 0]]);
      const grid = decodeElevation(imageData, 'terrarium');
      expect(grid.data[0]).toBeCloseTo(0, 1);
    });

    it('handles positive elevations in Terrarium', () => {
      // For 1000m: r*256 + g + b/256 = 33768
      // r = 131, g = 232, b ~ 0
      const imageData = createMockImageData([[131, 232, 0]]);
      const grid = decodeElevation(imageData, 'terrarium');
      expect(grid.data[0]).toBeCloseTo(1000, 0);
    });

    it('handles negative elevations in Terrarium', () => {
      // For -500m: r*256 + g = 32268
      // r = 126, g = 12
      const imageData = createMockImageData([[126, 12, 0]]);
      const grid = decodeElevation(imageData, 'terrarium');
      expect(grid.data[0]).toBeCloseTo(-500, 0);
    });

    it('round-trips Terrarium correctly', () => {
      const testElevations = [0, 100, 1000, 5000, -500, -100];

      for (const original of testElevations) {
        const grid = createGrid([original], 1, 1);
        const encoded = encodeElevation(grid, 'terrarium');
        const decoded = decodeElevation(encoded, 'terrarium');
        expect(decoded.data[0]).toBeCloseTo(original, 1);
      }
    });
  });

  describe('Grid utilities', () => {
    it('inverts grid values', () => {
      const grid = createGrid([0, 50, 100, 255], 2, 2);
      const inverted = invertGrid(grid);

      expect(inverted.data[0]).toBe(255);
      expect(inverted.data[1]).toBe(205);
      expect(inverted.data[2]).toBe(155);
      expect(inverted.data[3]).toBe(0);
    });

    it('clamps grid values', () => {
      const grid = createGrid([-10, 0, 50, 100, 300], 5, 1);
      const clamped = clampGrid(grid, 0, 255);

      expect(clamped.data[0]).toBe(0);
      expect(clamped.data[1]).toBe(0);
      expect(clamped.data[2]).toBe(50);
      expect(clamped.data[3]).toBe(100);
      expect(clamped.data[4]).toBe(255);
    });
  });
});
