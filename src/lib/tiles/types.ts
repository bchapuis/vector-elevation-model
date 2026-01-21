/**
 * Core types for tile processing and vector tile generation.
 */

/**
 * Tile coordinates in the XYZ scheme
 */
export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

/**
 * An elevation grid with buffer information
 */
export interface BufferedGrid {
  /** The elevation data as a flat array (row-major order) */
  grid: Float64Array;
  /** Total width including buffer */
  width: number;
  /** Total height including buffer */
  height: number;
  /** Buffer size in pixels on each side */
  bufferPx: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tile Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MVT extent (standard is 4096)
 */
export const MVT_EXTENT = 4096;

/**
 * Standard web mercator tile size
 */
export const TILE_SIZE = 256;

/**
 * Source tile size from Mapterhorn
 */
export const SOURCE_TILE_SIZE = 512;

/**
 * Gets the contour interval for a given zoom level
 */
export function getContourInterval(zoom: number): number {
  if (zoom <= 2) return 2000;
  if (zoom <= 7) return 1000;
  if (zoom <= 9) return 500;
  if (zoom <= 11) return 250;
  if (zoom <= 13) return 100;
  if (zoom === 14) return 50;
  return 10; // z15+
}

/**
 * Gets the hillshade band interval for a given zoom level.
 * Returns the luminance step between shade bands (0-255 range).
 */
export function getHillshadeInterval(zoom: number): number {
  if (zoom <= 7) return 32;  // 8 bands
  if (zoom <= 11) return 21; // ~12 bands
  return 16;                  // 16 bands at z12+
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Buffer size in pixels for tile processing.
 * Provides context for smooth curve/shade calculation near tile edges.
 * Features are clipped to tile extent after processing for seamless boundaries.
 */
export const BUFFER_PX = 8;

/** Default Mapterhorn tile URL template */
export const DEFAULT_TILE_URL = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';

/** Elevation range for contour generation */
export const MIN_ELEVATION = -500;
export const MAX_ELEVATION = 9000;

/** Luminance range for hillshade band generation */
export const MIN_LUMINANCE = 0;
export const MAX_LUMINANCE = 256;

/** Default sun position - classic cartographic convention */
export const DEFAULT_SUN_ALTITUDE = 45;
export const DEFAULT_SUN_AZIMUTH = 315;

/**
 * Calculates the hillshade baseline for flat terrain.
 * This is the luminance value a perfectly flat surface receives
 * given the sun altitude (Lambertian: cos(zenith) * 255).
 */
export function getHillshadeBaseline(sunAltitude: number = DEFAULT_SUN_ALTITUDE): number {
  const zenithRad = ((90 - sunAltitude) * Math.PI) / 180;
  return Math.round(Math.cos(zenithRad) * 255);
}

/**
 * Cache version for invalidation.
 * Bump this when algorithms change to invalidate all cached tiles.
 */
export const CACHE_VERSION = '3';

/** Default cache TTL: 1 day in seconds */
export const DEFAULT_CACHE_TTL = 24 * 3600;

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates an array of level values from min (inclusive) to max (exclusive).
 * Used for both contour elevations and hillshade luminance bands.
 */
export function generateLevels(min: number, max: number, interval: number): number[] {
  const levels: number[] = [];
  for (let level = min; level < max; level += interval) {
    levels.push(level);
  }
  return levels;
}
