/**
 * Tile fetcher for DEM data.
 * Fetches Terrarium-encoded elevation tiles from WebP/PNG sources.
 */

import { PhotonImage } from '@cf-wasm/photon';
import type { TileCoord, BufferedGrid } from './types';
import { TILE_SIZE, SOURCE_TILE_SIZE } from './types';

/**
 * Decodes Terrarium RGB to elevation.
 * Formula: elevation = (R * 256 + G + B / 256) - 32768
 */
function terrariumToElevation(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Earth's semi-major axis in meters (WGS84) */
const EARTH_RADIUS = 6378137;

/** Origin offset for Web Mercator projection */
const ORIGIN_SHIFT = Math.PI * EARTH_RADIUS;

// ─────────────────────────────────────────────────────────────────────────────
// Coordinate Conversion Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts tile coordinates to Web Mercator bounding box.
 */
export function tileToMercatorBounds(
  z: number,
  x: number,
  y: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  const tileSize = (2 * ORIGIN_SHIFT) / Math.pow(2, z);

  const minX = -ORIGIN_SHIFT + x * tileSize;
  const maxX = minX + tileSize;
  const maxY = ORIGIN_SHIFT - y * tileSize;
  const minY = maxY - tileSize;

  return { minX, minY, maxX, maxY };
}

/**
 * Converts tile coordinates to WGS84 bounding box.
 */
export function tileToWgs84Bounds(
  z: number,
  x: number,
  y: number
): { minLon: number; minLat: number; maxLon: number; maxLat: number } {
  const n = Math.pow(2, z);

  const minLon = (x / n) * 360 - 180;
  const maxLon = ((x + 1) / n) * 360 - 180;

  const maxLatRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const minLatRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n)));

  const minLat = (minLatRad * 180) / Math.PI;
  const maxLat = (maxLatRad * 180) / Math.PI;

  return { minLon, minLat, maxLon, maxLat };
}

// ─────────────────────────────────────────────────────────────────────────────
// WebP Tile Fetcher
// ─────────────────────────────────────────────────────────────────────────────

/** RGBA pixel data from a decoded tile */
interface TilePixels {
  data: Uint8Array;
  width: number;
  height: number;
}

/**
 * Fetches Terrarium-encoded DEM tiles and converts to elevation grids.
 *
 * Terrarium encoding stores elevation in RGB channels:
 * elevation = (R * 256 + G + B / 256) - 32768
 */
export class TileFetcher {
  constructor(
    private readonly urlTemplate: string,
    private readonly sourceTileSize: number = SOURCE_TILE_SIZE
  ) {}

  /**
   * Fetches elevation grid for a tile with buffer.
   *
   * Why buffer matters: Algorithms like contour tracing need neighboring pixel
   * context at tile edges. Without buffer, contours would be discontinuous at
   * tile boundaries.
   *
   * Why 9-tile stitching: Source tiles are typically larger (512px) than output
   * tiles (256px). The buffer region may extend into neighboring tiles, so we
   * fetch a 3x3 grid of source tiles, stitch them, then sample the center
   * region with buffer.
   */
  async fetchTile(coord: TileCoord, bufferPx: number = 0): Promise<BufferedGrid> {
    const { z, x, y } = coord;
    const outputSize = TILE_SIZE + 2 * bufferPx;

    // Simple case: no buffer means single tile fetch
    if (bufferPx === 0) {
      const center = await this.fetchTilePixels(z, x, y);
      if (!center) {
        throw new Error(`Failed to fetch tile ${z}/${x}/${y}`);
      }
      return this.sampleElevationGrid(center, outputSize, bufferPx);
    }

    // Buffer case: fetch 3x3 tile neighborhood and stitch
    const tiles = await this.fetch3x3Neighborhood(z, x, y);
    if (!tiles.center) {
      throw new Error(`Failed to fetch center tile ${z}/${x}/${y}`);
    }

    const stitched = this.stitchTiles(tiles);
    return this.sampleFromStitched(stitched, outputSize, bufferPx);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Tile Fetching
  // ───────────────────────────────────────────────────────────────────────────

  private buildUrl(z: number, x: number, y: number): string {
    return this.urlTemplate
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y));
  }

  /**
   * Fetches and decodes a single tile's RGBA pixel data.
   * Returns null for out-of-bounds or failed requests.
   */
  private async fetchTilePixels(z: number, x: number, y: number): Promise<TilePixels | null> {
    const maxTile = Math.pow(2, z);
    if (x < 0 || x >= maxTile || y < 0 || y >= maxTile) {
      return null;
    }

    const response = await fetch(this.buildUrl(z, x, y));
    if (!response.ok) {
      return null;
    }

    const buffer = await response.arrayBuffer();
    const image = PhotonImage.new_from_byteslice(new Uint8Array(buffer));
    const pixels = {
      data: image.get_raw_pixels(),
      width: image.get_width(),
      height: image.get_height(),
    };
    image.free();

    return pixels;
  }

  /**
   * Fetches all 9 tiles in a 3x3 neighborhood.
   * Batched into three logical groups to respect Cloudflare's 6-connection limit.
   */
  private async fetch3x3Neighborhood(z: number, x: number, y: number): Promise<{
    center: TilePixels | null;
    left: TilePixels | null;
    right: TilePixels | null;
    top: TilePixels | null;
    bottom: TilePixels | null;
    topLeft: TilePixels | null;
    topRight: TilePixels | null;
    bottomLeft: TilePixels | null;
    bottomRight: TilePixels | null;
  }> {
    // Batch 1: center tile
    const center = await this.fetchTilePixels(z, x, y);

    // Batch 2: cardinal directions (4 tiles)
    const [left, right, top, bottom] = await Promise.all([
      this.fetchTilePixels(z, x - 1, y),
      this.fetchTilePixels(z, x + 1, y),
      this.fetchTilePixels(z, x, y - 1),
      this.fetchTilePixels(z, x, y + 1),
    ]);

    // Batch 3: corners (4 tiles)
    const [topLeft, topRight, bottomLeft, bottomRight] = await Promise.all([
      this.fetchTilePixels(z, x - 1, y - 1),
      this.fetchTilePixels(z, x + 1, y - 1),
      this.fetchTilePixels(z, x - 1, y + 1),
      this.fetchTilePixels(z, x + 1, y + 1),
    ]);

    return { center, left, right, top, bottom, topLeft, topRight, bottomLeft, bottomRight };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Tile Stitching
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Stitches 9 tiles into a 3x3 canvas of RGBA pixels.
   *
   * Layout:  [topLeft]    [top]    [topRight]
   *          [left]     [center]   [right]
   *          [bottomLeft][bottom] [bottomRight]
   */
  private stitchTiles(tiles: {
    center: TilePixels | null;
    left: TilePixels | null;
    right: TilePixels | null;
    top: TilePixels | null;
    bottom: TilePixels | null;
    topLeft: TilePixels | null;
    topRight: TilePixels | null;
    bottomLeft: TilePixels | null;
    bottomRight: TilePixels | null;
  }): { data: Uint8Array; size: number } {
    const s = this.sourceTileSize;
    const stitchedSize = s * 3;
    const stitched = new Uint8Array(stitchedSize * stitchedSize * 4);

    // Copy each tile to its position in the 3x3 grid
    this.copyTileToCanvas(tiles.topLeft, stitched, stitchedSize, 0, 0);
    this.copyTileToCanvas(tiles.top, stitched, stitchedSize, s, 0);
    this.copyTileToCanvas(tiles.topRight, stitched, stitchedSize, 2 * s, 0);
    this.copyTileToCanvas(tiles.left, stitched, stitchedSize, 0, s);
    this.copyTileToCanvas(tiles.center, stitched, stitchedSize, s, s);
    this.copyTileToCanvas(tiles.right, stitched, stitchedSize, 2 * s, s);
    this.copyTileToCanvas(tiles.bottomLeft, stitched, stitchedSize, 0, 2 * s);
    this.copyTileToCanvas(tiles.bottom, stitched, stitchedSize, s, 2 * s);
    this.copyTileToCanvas(tiles.bottomRight, stitched, stitchedSize, 2 * s, 2 * s);

    return { data: stitched, size: stitchedSize };
  }

  /**
   * Copies tile pixels to a position in the stitched canvas.
   */
  private copyTileToCanvas(
    tile: TilePixels | null,
    canvas: Uint8Array,
    canvasSize: number,
    offsetX: number,
    offsetY: number
  ): void {
    if (!tile) return;

    for (let ty = 0; ty < tile.height; ty++) {
      for (let tx = 0; tx < tile.width; tx++) {
        const srcIdx = (ty * tile.width + tx) * 4;
        const dstIdx = ((offsetY + ty) * canvasSize + (offsetX + tx)) * 4;
        canvas[dstIdx] = tile.data[srcIdx];
        canvas[dstIdx + 1] = tile.data[srcIdx + 1];
        canvas[dstIdx + 2] = tile.data[srcIdx + 2];
        canvas[dstIdx + 3] = tile.data[srcIdx + 3];
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Elevation Sampling
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Samples elevation values from a stitched 3x3 canvas.
   *
   * Samples the center region plus buffer from the stitched canvas,
   * converting Terrarium-encoded RGB to elevation values.
   */
  private sampleFromStitched(
    stitched: { data: Uint8Array; size: number },
    outputSize: number,
    bufferPx: number
  ): BufferedGrid {
    const { data, size: stitchedSize } = stitched;
    const scale = this.sourceTileSize / TILE_SIZE;
    const s = this.sourceTileSize;
    const grid = new Float64Array(outputSize * outputSize);

    for (let oy = 0; oy < outputSize; oy++) {
      for (let ox = 0; ox < outputSize; ox++) {
        // Map output coords to tile-relative coords (with buffer offset)
        const tileX = ox - bufferPx;
        const tileY = oy - bufferPx;

        // Scale to source resolution and offset to center tile position
        let srcX = s + Math.floor((tileX + 0.5) * scale);
        let srcY = s + Math.floor((tileY + 0.5) * scale);

        // Clamp to stitched canvas bounds
        srcX = Math.max(0, Math.min(stitchedSize - 1, srcX));
        srcY = Math.max(0, Math.min(stitchedSize - 1, srcY));

        const srcIdx = (srcY * stitchedSize + srcX) * 4;
        grid[oy * outputSize + ox] = terrariumToElevation(
          data[srcIdx],
          data[srcIdx + 1],
          data[srcIdx + 2]
        );
      }
    }

    return { grid, width: outputSize, height: outputSize, bufferPx };
  }

  /**
   * Samples elevation values from a single tile (no-buffer case).
   */
  private sampleElevationGrid(
    tile: TilePixels,
    outputSize: number,
    bufferPx: number
  ): BufferedGrid {
    const scale = this.sourceTileSize / TILE_SIZE;
    const grid = new Float64Array(outputSize * outputSize);

    for (let y = 0; y < outputSize; y++) {
      for (let x = 0; x < outputSize; x++) {
        const tileX = x - bufferPx;
        const tileY = y - bufferPx;

        let srcX = Math.floor((tileX + 0.5) * scale);
        let srcY = Math.floor((tileY + 0.5) * scale);

        srcX = Math.max(0, Math.min(tile.width - 1, srcX));
        srcY = Math.max(0, Math.min(tile.height - 1, srcY));

        const srcIdx = (srcY * tile.width + srcX) * 4;
        grid[y * outputSize + x] = terrariumToElevation(
          tile.data[srcIdx],
          tile.data[srcIdx + 1],
          tile.data[srcIdx + 2]
        );
      }
    }

    return { grid, width: outputSize, height: outputSize, bufferPx };
  }
}
