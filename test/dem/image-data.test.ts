/**
 * WorkersImageData Tests
 * Tests for the ImageData polyfill used in Cloudflare Workers
 */

import { describe, it, expect } from 'vitest';
import { WorkersImageData } from '../../src/lib/dem/image-data';

describe('WorkersImageData', () => {
  describe('constructor with data array', () => {
    it('should create ImageData from existing pixel data', () => {
      const pixels = new Uint8ClampedArray(16); // 4 pixels (2x2)
      const imageData = new WorkersImageData(pixels, 2, 2);

      expect(imageData.width).toBe(2);
      expect(imageData.height).toBe(2);
      expect(imageData.data).toBe(pixels);
      expect(imageData.colorSpace).toBe('srgb');
    });

    it('should infer height from data length when not provided', () => {
      const pixels = new Uint8ClampedArray(48); // 12 pixels (4x3)
      const imageData = new WorkersImageData(pixels, 4);

      expect(imageData.width).toBe(4);
      expect(imageData.height).toBe(3); // 48 / 4 / 4 = 3
    });
  });

  describe('constructor with dimensions only', () => {
    it('should create empty ImageData with specified dimensions', () => {
      const imageData = new WorkersImageData(10, 20);

      expect(imageData.width).toBe(10);
      expect(imageData.height).toBe(20);
      expect(imageData.data.length).toBe(10 * 20 * 4); // 800 bytes
      expect(imageData.colorSpace).toBe('srgb');
    });

    it('should initialize data to zeros', () => {
      const imageData = new WorkersImageData(2, 2);

      // All pixels should be initialized to 0
      for (const value of imageData.data) {
        expect(value).toBe(0);
      }
    });

    it('should create correct size for 256x256 tile', () => {
      const imageData = new WorkersImageData(256, 256);

      expect(imageData.data.length).toBe(256 * 256 * 4);
    });
  });
});
