/**
 * Hillshade calculation using Lambertian reflectance.
 *
 * Computes illumination values for terrain based on sun position,
 * using Sobel filters for gradient calculation. Produces grayscale
 * values (0-255) suitable for raster or vector rendering.
 *
 * @see https://en.wikipedia.org/wiki/Hillshading
 */

import { type Grid, createGrid, gridGet } from './grid';
import { WorkersImageData } from './image-data';

/** Earth's radius in meters (WGS84 semi-major axis) */
const EARTH_RADIUS = 6378137;

/**
 * Hillshade calculation options.
 */
export interface HillshadeOptions {
  /** Sun altitude angle in degrees (0-90, where 90 is directly overhead). Default: 45 */
  altitude?: number;
  /** Sun azimuth angle in degrees (0-360, where 0/360 is North, 90 is East). Default: 315 */
  azimuth?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates hillshade values for elevation data.
 *
 * @param data Elevation values in row-major order (meters)
 * @param width Grid width
 * @param height Grid height
 * @param cellSize Ground resolution in meters per cell
 * @param options Sun position options
 * @returns Grid of hillshade values (0-255)
 *
 * @example
 * const resolution = getResolution(zoom);
 * const hillshade = hillshade(elevation, 257, 257, resolution);
 */
export function hillshade(
  data: Float64Array | number[],
  width: number,
  height: number,
  cellSize: number,
  options?: HillshadeOptions
): Grid {
  const grid = createGrid(data, width, height);
  const { altitude = 45, azimuth = 315 } = options ?? {};

  validateSunPosition(altitude, azimuth);

  const result = new Float64Array(width * height);

  // Convert sun angles from geographic to math convention
  // Geographic: azimuth 0° = North, clockwise; altitude from horizon
  // Math: 0° = East, counter-clockwise; zenith from vertical
  const azimuthRad = ((360 - azimuth + 90) * Math.PI) / 180;
  const zenithRad = ((90 - altitude) * Math.PI) / 180;

  // Pre-compute sun direction vector for dot product optimization
  const cosZenith = Math.cos(zenithRad);
  const sinZenith = Math.sin(zenithRad);
  const sunX = sinZenith * Math.cos(azimuthRad);
  const sunY = sinZenith * Math.sin(azimuthRad);
  const sunZ = cosZenith;

  // Pre-compute gradient scale factor (1 / 8*cellSize)
  const gradientScale = 1 / (8 * cellSize);

  // Flat terrain illumination (slope = 0)
  const flatIllumination = 255 * cosZenith;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = computePixelHillshadeFast(
        grid,
        x,
        y,
        gradientScale,
        sunX,
        sunY,
        sunZ,
        flatIllumination
      );
      result[y * width + x] = value;
    }
  }

  return { data: result, width, height };
}

/**
 * Converts hillshade grid to ImageData for raster rendering.
 *
 * @example
 * const imageData = toImageData(hillshade);
 */
export function toImageData(hillshade: Grid): WorkersImageData {
  const { data, width, height } = hillshade;
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < data.length; i++) {
    const value = Math.round(data[i]);
    const j = i * 4;
    pixels[j] = value;
    pixels[j + 1] = value;
    pixels[j + 2] = value;
    pixels[j + 3] = 255;
  }

  return new WorkersImageData(pixels, width, height);
}

/**
 * Calculates ground resolution for a web Mercator zoom level.
 *
 * @param zoom Zoom level (0-22)
 * @param tileSize Tile size in pixels (default: 256)
 * @returns Meters per pixel at equator
 *
 * @example
 * const resolution = getResolution(14); // ~9.55 m/px
 */
export function getResolution(zoom: number, tileSize: number = 256): number {
  return (2 * Math.PI * EARTH_RADIUS) / (tileSize * Math.pow(2, zoom));
}

// ─────────────────────────────────────────────────────────────────────────────
// Hillshade Computation (Optimized)
// ─────────────────────────────────────────────────────────────────────────────

/** Threshold for flat terrain fast-path (gradient magnitude squared) */
const FLAT_THRESHOLD_SQ = 1e-10;

/**
 * Computes hillshade using direct dot product formulation.
 *
 * Instead of computing slope/aspect angles and using trig functions,
 * we compute the dot product of the sun vector and surface normal directly:
 *
 *   normal = (-dzdx, -dzdy, 1) / |normal|
 *   illumination = sun · normal
 *
 * This avoids atan, atan2, and multiple sin/cos calls per pixel.
 */
function computePixelHillshadeFast(
  grid: Grid,
  x: number,
  y: number,
  gradientScale: number,
  sunX: number,
  sunY: number,
  sunZ: number,
  flatIllumination: number
): number {
  // Sample 3x3 neighborhood (with clamping at boundaries)
  const a = gridGet(grid, x - 1, y - 1);
  const b = gridGet(grid, x, y - 1);
  const c = gridGet(grid, x + 1, y - 1);
  const d = gridGet(grid, x - 1, y);
  const f = gridGet(grid, x + 1, y);
  const g = gridGet(grid, x - 1, y + 1);
  const h = gridGet(grid, x, y + 1);
  const i = gridGet(grid, x + 1, y + 1);

  // Sobel gradients (pre-scaled)
  const dzdx = (c + 2 * f + i - (a + 2 * d + g)) * gradientScale;
  const dzdy = (g + 2 * h + i - (a + 2 * b + c)) * gradientScale;

  // Fast path for flat terrain (very common case)
  const gradMagSq = dzdx * dzdx + dzdy * dzdy;
  if (gradMagSq < FLAT_THRESHOLD_SQ) {
    return flatIllumination;
  }

  // Surface normal (unnormalized): (-dzdx, -dzdy, 1)
  // Magnitude: sqrt(dzdx² + dzdy² + 1)
  const normalMag = Math.sqrt(gradMagSq + 1);

  // Dot product of sun direction and normalized surface normal
  // sun · (normal / |normal|) = (sunX*(-dzdx) + sunY*(-dzdy) + sunZ*1) / |normal|
  const dotProduct = (-sunX * dzdx - sunY * dzdy + sunZ) / normalMag;

  // Clamp to [0, 255]
  const illumination = 255 * dotProduct;
  return illumination < 0 ? 0 : illumination > 255 ? 255 : illumination;
}

function validateSunPosition(altitude: number, azimuth: number): void {
  if (altitude < 0 || altitude > 90) {
    throw new Error('Altitude must be between 0 and 90 degrees');
  }
  if (azimuth < 0 || azimuth > 360) {
    throw new Error('Azimuth must be between 0 and 360 degrees');
  }
}
