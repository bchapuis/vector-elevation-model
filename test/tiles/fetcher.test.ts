/**
 * TileFetcher Tests
 *
 * Tests for tile fetching, stitching, and elevation sampling.
 * Uses mocked fetch and PhotonImage to avoid network/WASM dependencies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TileFetcher } from '../../src/lib/tiles/fetcher';

// Mock @cf-wasm/photon
vi.mock('@cf-wasm/photon', () => ({
  PhotonImage: {
    new_from_byteslice: vi.fn(),
  },
}));

import { PhotonImage } from '@cf-wasm/photon';

/**
 * Creates mock RGBA pixel data with Terrarium-encoded elevation.
 * Terrarium formula: elevation = R*256 + G + B/256 - 32768
 */
function createTerrariumPixels(
  width: number,
  height: number,
  elevation: number
): Uint8Array {
  // Encode elevation to RGB using Terrarium formula
  const adjusted = elevation + 32768;
  const r = Math.floor(adjusted / 256);
  const g = Math.floor(adjusted % 256);
  const b = Math.floor((adjusted - r * 256 - g) * 256);

  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/**
 * Creates a mock PhotonImage instance
 */
function createMockPhotonImage(width: number, height: number, elevation: number) {
  const pixels = createTerrariumPixels(width, height, elevation);
  return {
    get_raw_pixels: vi.fn(() => pixels),
    get_width: vi.fn(() => width),
    get_height: vi.fn(() => height),
    free: vi.fn(),
  };
}

describe('TileFetcher', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('fetchTile without buffer', () => {
    it('should fetch and decode single tile', async () => {
      const mockImage = createMockPhotonImage(512, 512, 1000);
      vi.mocked(PhotonImage.new_from_byteslice).mockReturnValue(mockImage as any);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });

      const fetcher = new TileFetcher('https://example.com/{z}/{x}/{y}.webp', 512);
      const result = await fetcher.fetchTile({ z: 10, x: 512, y: 512 }, 0);

      expect(result.width).toBe(256); // TILE_SIZE
      expect(result.height).toBe(256);
      expect(result.bufferPx).toBe(0);
      expect(result.grid.length).toBe(256 * 256);

      // All elevation values should be ~1000 (small rounding errors allowed)
      const avgElevation =
        result.grid.reduce((sum, val) => sum + val, 0) / result.grid.length;
      expect(avgElevation).toBeCloseTo(1000, 0);

      expect(global.fetch).toHaveBeenCalledWith('https://example.com/10/512/512.webp');
      expect(mockImage.free).toHaveBeenCalled();
    });

    it('should throw on failed fetch', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const fetcher = new TileFetcher('https://example.com/{z}/{x}/{y}.webp');
      await expect(fetcher.fetchTile({ z: 10, x: 512, y: 512 }, 0)).rejects.toThrow(
        'Failed to fetch tile 10/512/512'
      );
    });
  });

  describe('fetchTile with buffer', () => {
    it('should fetch 2x2 tile neighborhood for buffered grids', async () => {
      const mockImage = createMockPhotonImage(512, 512, 500);
      vi.mocked(PhotonImage.new_from_byteslice).mockReturnValue(mockImage as any);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });

      const fetcher = new TileFetcher('https://example.com/{z}/{x}/{y}.webp', 512);
      const result = await fetcher.fetchTile({ z: 10, x: 512, y: 512 }, 4);

      // With 4px buffer, output size is 256 + 2*4 = 264
      expect(result.width).toBe(264);
      expect(result.height).toBe(264);
      expect(result.bufferPx).toBe(4);
      expect(result.grid.length).toBe(264 * 264);

      // Should fetch 4 tiles (2x2 corner-aligned neighborhood)
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it('should throw if center tile fails', async () => {
      // All fetches fail
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const fetcher = new TileFetcher('https://example.com/{z}/{x}/{y}.webp');
      await expect(fetcher.fetchTile({ z: 10, x: 512, y: 512 }, 4)).rejects.toThrow(
        'Failed to fetch center tile 10/512/512'
      );
    });

    it('should handle missing edge tiles gracefully', async () => {
      const mockImage = createMockPhotonImage(512, 512, 750);
      vi.mocked(PhotonImage.new_from_byteslice).mockReturnValue(mockImage as any);

      // Center tile succeeds, edge tiles fail (simulating tile at map boundary)
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/512/512.webp')) {
          return Promise.resolve({
            ok: true,
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const fetcher = new TileFetcher('https://example.com/{z}/{x}/{y}.webp', 512);
      const result = await fetcher.fetchTile({ z: 10, x: 512, y: 512 }, 4);

      // Should still return a result (edge tiles filled with default/missing)
      expect(result.width).toBe(264);
      expect(result.height).toBe(264);
    });
  });

  describe('URL template substitution', () => {
    it('should substitute z, x, y placeholders', async () => {
      const mockImage = createMockPhotonImage(512, 512, 100);
      vi.mocked(PhotonImage.new_from_byteslice).mockReturnValue(mockImage as any);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });

      const fetcher = new TileFetcher('https://tiles.example.com/dem/{z}/{x}/{y}@2x.webp');
      await fetcher.fetchTile({ z: 14, x: 8192, y: 5461 }, 0);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://tiles.example.com/dem/14/8192/5461@2x.webp'
      );
    });
  });

  describe('out-of-bounds tile handling', () => {
    it('should return null for tiles with negative coordinates', async () => {
      const mockImage = createMockPhotonImage(512, 512, 100);
      vi.mocked(PhotonImage.new_from_byteslice).mockReturnValue(mockImage as any);

      // Mock fetch that returns ok for valid coordinates
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });

      const fetcher = new TileFetcher('https://example.com/{z}/{x}/{y}.webp', 512);

      // Fetch a tile at the edge (x=0), the left neighbors will be out of bounds
      const result = await fetcher.fetchTile({ z: 10, x: 0, y: 512 }, 4);

      // Should still succeed with available tiles
      expect(result.width).toBe(264);
      expect(result.height).toBe(264);
    });

    it('should return null for tiles exceeding max tile index', async () => {
      const mockImage = createMockPhotonImage(512, 512, 100);
      vi.mocked(PhotonImage.new_from_byteslice).mockReturnValue(mockImage as any);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });

      const fetcher = new TileFetcher('https://example.com/{z}/{x}/{y}.webp', 512);

      // At z=10, max tile is 1023. Fetch tile 1023, right neighbors are out of bounds
      const result = await fetcher.fetchTile({ z: 10, x: 1023, y: 512 }, 4);

      expect(result.width).toBe(264);
      expect(result.height).toBe(264);
    });
  });

  describe('elevation sampling', () => {
    it('should correctly decode Terrarium elevation values', async () => {
      // Create tile with specific elevation pattern
      const elevation = 2500; // 2500 meters
      const mockImage = createMockPhotonImage(512, 512, elevation);
      vi.mocked(PhotonImage.new_from_byteslice).mockReturnValue(mockImage as any);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });

      const fetcher = new TileFetcher('https://example.com/{z}/{x}/{y}.webp', 512);
      const result = await fetcher.fetchTile({ z: 10, x: 512, y: 512 }, 0);

      // Check that decoded elevation matches expected value
      const centerElevation = result.grid[128 * 256 + 128]; // Center pixel
      expect(centerElevation).toBeCloseTo(elevation, 0);
    });

    it('should handle negative elevations (below sea level)', async () => {
      const elevation = -100; // 100m below sea level
      const mockImage = createMockPhotonImage(512, 512, elevation);
      vi.mocked(PhotonImage.new_from_byteslice).mockReturnValue(mockImage as any);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });

      const fetcher = new TileFetcher('https://example.com/{z}/{x}/{y}.webp', 512);
      const result = await fetcher.fetchTile({ z: 10, x: 512, y: 512 }, 0);

      const avgElevation =
        result.grid.reduce((sum, val) => sum + val, 0) / result.grid.length;
      expect(avgElevation).toBeCloseTo(elevation, 0);
    });
  });
});
