/**
 * Tile processing utilities for generating vector tiles from DEM data.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type { TileCoord, BufferedGrid } from './types';
export type { TransformConfig } from './coordinate-transform';
export type { EncoderOptions } from './encoder';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export {
  MVT_EXTENT,
  TILE_SIZE,
  BUFFER_PX,
  DEFAULT_TILE_URL,
  MIN_ELEVATION,
  MAX_ELEVATION,
  MIN_LUMINANCE,
  MAX_LUMINANCE,
  DEFAULT_SUN_ALTITUDE,
  DEFAULT_SUN_AZIMUTH,
  getContourInterval,
  getHillshadeInterval,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Tile Fetching
// ─────────────────────────────────────────────────────────────────────────────

export { TileFetcher } from './fetcher';

// ─────────────────────────────────────────────────────────────────────────────
// Coordinate Transformation
// ─────────────────────────────────────────────────────────────────────────────

export {
  transformFeatures,
  transformAndClipFeatures,
  transformAndClipPolygonFeatures,
} from './coordinate-transform';

// ─────────────────────────────────────────────────────────────────────────────
// MVT Encoding
// ─────────────────────────────────────────────────────────────────────────────

export { encodeFeatures, getMvtHeaders } from './encoder';
