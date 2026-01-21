/**
 * MVT (Mapbox Vector Tile) encoder.
 * Converts GeoJSON features to compressed MVT format.
 */

import { fromGeojsonVt as fromGeojsonVtTyped } from '@maplibre/vt-pbf';
import pako from 'pako';
import type { Feature, LineString, Polygon } from 'geojson';
import { MVT_EXTENT } from './types';

// The @maplibre/vt-pbf types are incorrect - it expects Tile[] but API actually accepts { layerName: tile }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromGeojsonVt = fromGeojsonVtTyped as any;

/**
 * Options for MVT encoding
 */
export interface EncoderOptions {
  /** Layer name in the MVT */
  layerName: string;
  /** MVT extent (default: 4096) */
  extent?: number;
  /** Whether to GZIP compress the output (default: true) */
  compress?: boolean;
  /** MVT version (default: 2) */
  version?: number;
}

/**
 * Encodes GeoJSON features to MVT format.
 *
 * Features should be pre-transformed to MVT coordinates [0, extent].
 * This encoder directly builds the vt-pbf tile structure for efficiency,
 * avoiding the overhead of geojson-vt indexing.
 */
export function encodeFeatures(
  features: Feature<LineString | Polygon>[],
  options: EncoderOptions
): Uint8Array {
  const {
    layerName,
    extent = MVT_EXTENT,
    compress = true,
    version = 2,
  } = options;

  // Convert features to geojson-vt tile format
  const vtFeatures = features.map((feature, index) => {
    const geom = feature.geometry;
    const props = feature.properties ?? {};

    if (geom.type === 'LineString') {
      return {
        id: feature.id ?? index,
        type: 2 as const, // LineString in MVT
        geometry: [geom.coordinates.map((c) => [Math.round(c[0]), Math.round(c[1])])],
        tags: props,
      };
    }
    // Must be Polygon
    return {
      id: feature.id ?? index,
      type: 3 as const, // Polygon in MVT
      geometry: (geom as Polygon).coordinates.map((ring) =>
        ring.map((c) => [Math.round(c[0]), Math.round(c[1])])
      ),
      tags: props,
    };
  });

  // Create a minimal tile structure that vt-pbf expects
  const tile = {
    features: vtFeatures,
    numPoints: 0,
    numSimplified: 0,
    numFeatures: vtFeatures.length,
    source: null,
    x: 0,
    y: 0,
    z: 0,
    transformed: true,
    minX: 0,
    minY: 0,
    maxX: extent,
    maxY: extent,
  };

  // Encode to Protocol Buffer format
  const buffer = fromGeojsonVt({ [layerName]: tile }, { extent, version });

  // Compress if requested
  return compress ? pako.gzip(buffer) : buffer;
}

/**
 * Creates HTTP response headers for an MVT tile
 *
 * @param compressed Whether the tile is gzip compressed
 * @param maxAge Cache TTL in seconds (default: 3600)
 */
export function getMvtHeaders(compressed: boolean = true, maxAge: number = 3600): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/vnd.mapbox-vector-tile',
    'Cache-Control': `public, max-age=${maxAge}`,
  };

  if (compressed) {
    headers['Content-Encoding'] = 'gzip';
  }

  return headers;
}
