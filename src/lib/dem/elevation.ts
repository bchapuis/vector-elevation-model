/**
 * Elevation encoding and decoding for terrain RGB formats.
 *
 * Converts between elevation values (meters) and RGB-encoded pixel data
 * using MapBox terrain-rgb or Terrarium encoding schemes.
 *
 * @see https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-rgb-v1/
 * @see https://github.com/tilezen/joerd/blob/master/docs/formats.md
 */

import { type Grid, gridMap } from './grid';
import { type ImageDataLike, WorkersImageData } from './image-data';

// Encoding constants
const MAPBOX_OFFSET = 10000.0;
const TERRARIUM_OFFSET = 32768.0;

/**
 * Supported terrain encoding formats.
 */
export type TerrainEncoding = 'mapbox' | 'terrarium';

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decodes terrain-rgb ImageData to elevation values.
 *
 * @param imageData Source image in terrain-rgb format
 * @param encoding Encoding format (default: 'mapbox')
 * @returns Grid of elevation values in meters
 *
 * @example
 * const elevation = decodeElevation(imageData);
 * const elevation = decodeElevation(imageData, 'terrarium');
 */
export function decodeElevation(
  imageData: ImageDataLike,
  encoding: TerrainEncoding = 'mapbox'
): Grid {
  const { width, height, data } = imageData;
  const result = new Float64Array(width * height);
  const decode = encoding === 'mapbox' ? decodeMapbox : decodeTerrarium;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      result[y * width + x] = decode(data[i], data[i + 1], data[i + 2]);
    }
  }

  return { data: result, width, height };
}

/**
 * Encodes elevation values to terrain-rgb ImageData.
 *
 * @param elevation Grid of elevation values in meters
 * @param encoding Encoding format (default: 'mapbox')
 * @returns ImageData in terrain-rgb format
 *
 * @example
 * const imageData = encodeElevation(elevation);
 */
export function encodeElevation(
  elevation: Grid,
  encoding: TerrainEncoding = 'mapbox'
): WorkersImageData {
  const { data, width, height } = elevation;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const encode = encoding === 'mapbox' ? encodeMapbox : encodeTerrarium;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = encode(data[y * width + x]);
      const i = (y * width + x) * 4;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255;
    }
  }

  return new WorkersImageData(pixels, width, height);
}

/**
 * Inverts grid values (255 - value). Useful for hillshade inversion.
 */
export function invertGrid(grid: Grid): Grid {
  return gridMap(grid, (v) => 255.0 - v);
}

/**
 * Clamps grid values to a range.
 */
export function clampGrid(grid: Grid, min: number, max: number): Grid {
  return gridMap(grid, (v) => Math.max(min, Math.min(max, v)));
}


// ─────────────────────────────────────────────────────────────────────────────
// MapBox Terrain-RGB Encoding
// Formula: elevation = (r * 256² + g * 256 + b) / 10 - 10000
// ─────────────────────────────────────────────────────────────────────────────

function decodeMapbox(r: number, g: number, b: number): number {
  return (r * 256 * 256 + g * 256 + b) / 10.0 - MAPBOX_OFFSET;
}

function encodeMapbox(elevation: number): [number, number, number] {
  const value = Math.round((elevation + MAPBOX_OFFSET) * 10.0);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

// ─────────────────────────────────────────────────────────────────────────────
// Terrarium Encoding
// Formula: elevation = (r * 256 + g + b/256) - 32768
// ─────────────────────────────────────────────────────────────────────────────

function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256.0 + g + b / 256.0 - TERRARIUM_OFFSET;
}

function encodeTerrarium(elevation: number): [number, number, number] {
  const adjusted = elevation + TERRARIUM_OFFSET;
  const r = Math.floor(adjusted / 256.0);
  const g = Math.floor(adjusted % 256.0);
  const b = Math.floor((adjusted - r * 256.0 - g) * 256.0);
  return [r, g, b];
}
