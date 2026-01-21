/**
 * DEM (Digital Elevation Model) Processing Library
 *
 * Provides utilities for processing digital elevation data:
 *
 * - **Elevation**: Decode/encode terrain-rgb images (MapBox, Terrarium)
 * - **Hillshade**: Calculate terrain illumination
 * - **Contours**: Trace isolines and filled polygons
 * - **Smooth**: Apply Chaikin corner-cutting to geometries
 *
 * @example
 * // Decode terrain-rgb and compute hillshade
 * const elevation = decodeElevation(imageData);
 * const resolution = getResolution(zoom);
 * const shade = hillshade(elevation.data, elevation.width, elevation.height, resolution);
 *
 * // Trace contour lines
 * const contours = traceLines(elevation.data, elevation.width, elevation.height, [100, 200, 300]);
 *
 * // Smooth the results
 * const smoothContours = contours.map(c => smooth(c));
 *
 * @see https://github.com/apache/incubator-baremaps
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type { Position, Feature, LineString, Polygon, Geometry } from './types';
export type { ImageDataLike } from './image-data';
export { WorkersImageData } from './image-data';
export { createGrid, type Grid } from './grid';

// ─────────────────────────────────────────────────────────────────────────────
// Elevation Encoding/Decoding
// ─────────────────────────────────────────────────────────────────────────────

export {
  decodeElevation,
  encodeElevation,
  invertGrid,
  clampGrid,
  type TerrainEncoding,
} from './elevation';

// ─────────────────────────────────────────────────────────────────────────────
// Hillshade
// ─────────────────────────────────────────────────────────────────────────────

export {
  hillshade,
  toImageData,
  getResolution,
  type HillshadeOptions,
} from './hillshade';

// ─────────────────────────────────────────────────────────────────────────────
// Contours
// ─────────────────────────────────────────────────────────────────────────────

export {
  traceLines,
  tracePolygons,
} from './contour';

// ─────────────────────────────────────────────────────────────────────────────
// Smoothing
// ─────────────────────────────────────────────────────────────────────────────

export {
  smooth,
  smoothCoords,
  type SmoothOptions,
} from './smooth';
