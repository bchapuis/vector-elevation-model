/**
 * Chaikin corner-cutting algorithm for smoothing geometry coordinates.
 *
 * Iteratively subdivides line segments and moves vertices inward,
 * producing progressively smoother curves while preserving shape.
 *
 * @see https://www.cs.unc.edu/~dm/UNC/COMP258/LECTURES/Chaikins-Algorithm.pdf
 */

import type { Feature, LineString, Polygon, Position } from 'geojson';
import { lineString, polygon } from '@turf/helpers';

/**
 * Smoothing options.
 */
export interface SmoothOptions {
  /** Number of subdivision iterations (default: 2) */
  iterations?: number;
  /** Corner-cutting ratio, 0-0.5 (default: 0.25) */
  factor?: number;
}

const DEFAULT_ITERATIONS = 2;
const DEFAULT_FACTOR = 0.25;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Smooths a LineString or Polygon feature.
 *
 * @example
 * const smoothContour = smooth(contourLine);
 * const smoothRegion = smooth(polygonFeature, { iterations: 3 });
 */
export function smooth(
  feature: Feature<LineString | Polygon>,
  options?: SmoothOptions
): Feature<LineString | Polygon> {
  if (feature.geometry.type === 'Polygon') {
    return smoothPolygonFeature(feature as Feature<Polygon>, options);
  }
  return smoothLineStringFeature(feature as Feature<LineString>, options);
}

/**
 * Smooths raw coordinates.
 *
 * For closed rings, pass `closed: true` to maintain ring closure.
 *
 * @example
 * const smoothed = smoothCoords(coords, { iterations: 2 });
 */
export function smoothCoords(
  coords: Position[],
  options?: SmoothOptions & { closed?: boolean }
): Position[] {
  if (coords.length < 2) return [...coords];

  const { iterations = DEFAULT_ITERATIONS, factor = DEFAULT_FACTOR, closed = false } = options ?? {};

  if (closed || isClosedRing(coords)) {
    return smoothClosedRing(coords, iterations, factor);
  }
  return smoothOpenLine(coords, iterations, factor);
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature Smoothing
// ─────────────────────────────────────────────────────────────────────────────

function smoothLineStringFeature(
  feature: Feature<LineString>,
  options?: SmoothOptions
): Feature<LineString> {
  const smoothed = smoothCoords(feature.geometry.coordinates, options);
  return lineString(smoothed, feature.properties ?? {});
}

function smoothPolygonFeature(
  feature: Feature<Polygon>,
  options?: SmoothOptions
): Feature<Polygon> {
  const rings = feature.geometry.coordinates.map((ring) =>
    smoothCoords(ring, { ...options, closed: true })
  );
  return polygon(rings, feature.properties ?? {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Chaikin Algorithm Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applies Chaikin subdivision to a closed ring.
 */
function smoothClosedRing(coords: Position[], iterations: number, factor: number): Position[] {
  // Work with unique vertices (excluding closing duplicate)
  let current = isClosedRing(coords) ? coords.slice(0, -1) : coords;

  for (let i = 0; i < iterations; i++) {
    current = subdivideCoords(current, factor);
  }

  // Close the ring
  return [...current, current[0]];
}

/**
 * Applies Chaikin subdivision to an open line, preserving endpoints.
 */
function smoothOpenLine(coords: Position[], iterations: number, factor: number): Position[] {
  if (iterations <= 0 || coords.length < 2) return [...coords];

  let current = coords;

  for (let i = 0; i < iterations; i++) {
    current = subdivideCoords(current, factor);
  }

  // Trim excess points created by subdivision and restore original endpoints
  const trimLength = computeTrimLength(iterations);
  const result: Position[] = [coords[0]];

  for (let i = 0; i < current.length - trimLength; i++) {
    result.push(current[i]);
  }

  result.push(coords[coords.length - 1]);
  return result;
}

/**
 * Subdivides coordinates using corner-cutting.
 * Works for both closed rings and open lines (wraps around using modulo).
 */
function subdivideCoords(coords: Position[], factor: number): Position[] {
  const n = coords.length;
  const result: Position[] = new Array(n * 2);
  const f1 = 1 - factor;
  const f2 = factor;

  for (let i = 0; i < n; i++) {
    const c1 = coords[i];
    const c2 = coords[(i + 1) % n];

    result[i * 2] = [f1 * c1[0] + f2 * c2[0], f1 * c1[1] + f2 * c2[1]];
    result[i * 2 + 1] = [f2 * c1[0] + f1 * c2[0], f2 * c1[1] + f1 * c2[1]];
  }

  return result;
}

/**
 * Computes how many points to trim from the end after subdivision.
 * Formula: sum of squares from 1 to iterations.
 */
function computeTrimLength(iterations: number): number {
  return (iterations * (iterations + 1) * (2 * iterations + 1)) / 6;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function isClosedRing(coords: Position[]): boolean {
  if (coords.length < 4) return false;
  const first = coords[0];
  const last = coords[coords.length - 1];
  return Math.abs(first[0] - last[0]) < 1e-10 && Math.abs(first[1] - last[1]) < 1e-10;
}
