/**
 * Coordinate transformation and clipping utilities.
 *
 * Transforms features from buffered grid coordinates to MVT tile coordinates,
 * and clips them to tile boundaries for seamless cross-tile rendering.
 */

import type { Feature, LineString, Polygon, Position } from 'geojson';
import { lineString, polygon } from '@turf/helpers';
import { MVT_EXTENT, TILE_SIZE } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for coordinate transformation
 */
export interface TransformConfig {
  /** Buffer size in pixels */
  bufferPx: number;
  /** Source tile size in pixels (default: 256) */
  tileSizePx?: number;
  /** Target MVT extent (default: 4096) */
  mvtExtent?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Coordinate Transformation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a transform function from buffered grid space to MVT tile space.
 *
 * Why buffered grids? Algorithms like contour tracing need neighboring pixel
 * context to produce smooth curves at tile edges. The buffer is stripped
 * during transformation so features align at tile boundaries.
 */
export function createTransform(config: TransformConfig): (coord: Position) => Position {
  const { bufferPx, tileSizePx = TILE_SIZE, mvtExtent = MVT_EXTENT } = config;
  const scale = mvtExtent / tileSizePx;

  return (coord: Position): Position => {
    const x = (coord[0] - bufferPx) * scale;
    const y = (coord[1] - bufferPx) * scale;
    return [x, y];
  };
}

/**
 * Transforms a coordinate array using the given transform function
 */
export function transformCoordinates(
  coords: Position[],
  transform: (coord: Position) => Position
): Position[] {
  return coords.map(transform);
}

/**
 * Transforms a LineString feature
 */
export function transformLineString(
  feature: Feature<LineString>,
  config: TransformConfig
): Feature<LineString> {
  const transform = createTransform(config);
  const newCoords = transformCoordinates(feature.geometry.coordinates, transform);
  return lineString(newCoords, feature.properties ?? {});
}

/**
 * Transforms a Polygon feature (including holes)
 */
export function transformPolygon(
  feature: Feature<Polygon>,
  config: TransformConfig
): Feature<Polygon> {
  const transform = createTransform(config);
  const exterior = transformCoordinates(feature.geometry.coordinates[0], transform);
  const holes = feature.geometry.coordinates.slice(1).map((hole) =>
    transformCoordinates(hole, transform)
  );
  return polygon([exterior, ...holes], feature.properties ?? {});
}

/**
 * Transforms any Feature (LineString or Polygon)
 */
export function transformFeature(
  feature: Feature<LineString | Polygon>,
  config: TransformConfig
): Feature<LineString | Polygon> {
  if (feature.geometry.type === 'Polygon') {
    return transformPolygon(feature as Feature<Polygon>, config);
  }
  return transformLineString(feature as Feature<LineString>, config);
}

/**
 * Transforms an array of features
 */
export function transformFeatures(
  features: Feature<LineString | Polygon>[],
  config: TransformConfig
): Feature<LineString | Polygon>[] {
  return features.map((f) => transformFeature(f, config));
}

// ─────────────────────────────────────────────────────────────────────────────
// Edge Clipping Primitives
// ─────────────────────────────────────────────────────────────────────────────

type Edge = 'left' | 'right' | 'top' | 'bottom';

/**
 * Tests if a point is inside (or on) a given edge boundary.
 *
 * Coordinate system: origin at top-left, Y increases downward (screen coords).
 * - left:   x >= edgeValue
 * - right:  x <= edgeValue
 * - top:    y >= edgeValue (closer to origin)
 * - bottom: y <= edgeValue
 */
function isInsideEdge(p: Position, edge: Edge, edgeValue: number): boolean {
  switch (edge) {
    case 'left':   return p[0] >= edgeValue;
    case 'right':  return p[0] <= edgeValue;
    case 'top':    return p[1] >= edgeValue;
    case 'bottom': return p[1] <= edgeValue;
  }
}

/**
 * Computes the intersection point where segment p1→p2 crosses an edge.
 *
 * Uses parametric line equation: P(t) = p1 + t*(p2-p1), solving for t
 * where P(t) lies on the edge boundary.
 */
function computeEdgeIntersection(
  p1: Position,
  p2: Position,
  edge: Edge,
  edgeValue: number
): Position {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const dx = x2 - x1;
  const dy = y2 - y1;

  let t: number;
  switch (edge) {
    case 'left':
    case 'right':
      t = (edgeValue - x1) / dx;
      return [edgeValue, y1 + t * dy];
    case 'top':
    case 'bottom':
      t = (edgeValue - y1) / dy;
      return [x1 + t * dx, edgeValue];
  }
}

/**
 * Determines which edge a point is outside of (for exit/entry detection).
 * Returns the first violated edge, checking in order: left, right, top, bottom.
 *
 * Note: This function assumes the point is already known to be outside the box.
 * If none of the first three conditions match, the point must violate the bottom edge.
 */
function findViolatedEdge(
  p: Position,
  minX: number,
  minY: number,
  maxX: number
): Edge {
  if (p[0] < minX) return 'left';
  if (p[0] > maxX) return 'right';
  if (p[1] < minY) return 'top';
  return 'bottom';
}

// ─────────────────────────────────────────────────────────────────────────────
// Line Clipping (Cohen-Sutherland variant)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clips a polyline to a bounding box.
 *
 * Why clipping? Contour lines generated from buffered grids extend beyond
 * tile boundaries. Clipping ensures clean edges for seamless MVT rendering
 * where adjacent tiles meet.
 *
 * Returns potentially multiple segments if the line exits and re-enters the box.
 * Simplified: doesn't handle lines that cross through the box without touching
 * the interior (rare case for contour data).
 */
function clipLineToBox(
  coords: Position[],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): Position[][] {
  if (coords.length < 2) return [];

  const result: Position[][] = [];
  let currentSegment: Position[] = [];

  const inside = (p: Position): boolean =>
    p[0] >= minX && p[0] <= maxX && p[1] >= minY && p[1] <= maxY;

  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p1Inside = inside(p1);
    const p2Inside = inside(p2);

    if (p1Inside && p2Inside) {
      // Both inside - extend current segment
      if (currentSegment.length === 0) currentSegment.push(p1);
      currentSegment.push(p2);
    } else if (p1Inside && !p2Inside) {
      // Exiting the box - find exit point and close segment
      if (currentSegment.length === 0) currentSegment.push(p1);
      const exitEdge = findViolatedEdge(p2, minX, minY, maxX);
      const edgeValue = exitEdge === 'left' ? minX : exitEdge === 'right' ? maxX :
                        exitEdge === 'top' ? minY : maxY;
      currentSegment.push(computeEdgeIntersection(p1, p2, exitEdge, edgeValue));
      if (currentSegment.length >= 2) result.push(currentSegment);
      currentSegment = [];
    } else if (!p1Inside && p2Inside) {
      // Entering the box - find entry point and start new segment
      const entryEdge = findViolatedEdge(p1, minX, minY, maxX);
      const edgeValue = entryEdge === 'left' ? minX : entryEdge === 'right' ? maxX :
                        entryEdge === 'top' ? minY : maxY;
      currentSegment = [computeEdgeIntersection(p1, p2, entryEdge, edgeValue), p2];
    }
    // Both outside - skip (doesn't handle through-crossing, acceptable for contours)
  }

  if (currentSegment.length >= 2) {
    result.push(currentSegment);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Polygon Clipping (Sutherland-Hodgman)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clips a polygon ring against a single edge using Sutherland-Hodgman algorithm.
 *
 * Sutherland-Hodgman iteratively clips against each edge of the clip rectangle.
 * For each edge, it walks the polygon vertices and outputs:
 * - Vertices inside the edge
 * - Intersection points where edges cross the boundary
 *
 * The result is a new ring clipped to that edge, which is then passed to
 * the next edge for further clipping.
 */
function clipPolygonAgainstEdge(
  ring: Position[],
  edge: Edge,
  edgeValue: number
): Position[] {
  if (ring.length === 0) return [];

  const output: Position[] = [];

  for (let i = 0; i < ring.length; i++) {
    const current = ring[i];
    const previous = ring[(i + ring.length - 1) % ring.length];
    const currentInside = isInsideEdge(current, edge, edgeValue);
    const previousInside = isInsideEdge(previous, edge, edgeValue);

    if (currentInside) {
      if (!previousInside) {
        // Entering: add intersection point before current vertex
        output.push(computeEdgeIntersection(previous, current, edge, edgeValue));
      }
      output.push(current);
    } else if (previousInside) {
      // Leaving: add intersection point (current vertex is outside, skip it)
      output.push(computeEdgeIntersection(previous, current, edge, edgeValue));
    }
    // Both outside: skip vertex
  }

  return output;
}

/**
 * Clips a polygon ring to a bounding box using Sutherland-Hodgman algorithm.
 *
 * Applies edge clipping in sequence: left → right → top → bottom.
 * Each pass reduces the polygon to fit within that edge boundary.
 */
function clipPolygonRingToBox(
  ring: Position[],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): Position[] {
  let result = ring;
  result = clipPolygonAgainstEdge(result, 'left', minX);
  result = clipPolygonAgainstEdge(result, 'right', maxX);
  result = clipPolygonAgainstEdge(result, 'top', minY);
  result = clipPolygonAgainstEdge(result, 'bottom', maxY);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public Transform + Clip Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transforms and clips LineString features to tile extent.
 *
 * Why both transform AND clip? Features are generated in buffered grid
 * coordinates (for algorithm context), then:
 * 1. Transformed to remove buffer offset and scale to MVT coordinates
 * 2. Clipped so features end exactly at tile boundaries
 *
 * This ensures seamless rendering when tiles are assembled.
 */
export function transformAndClipFeatures(
  features: Feature<LineString | Polygon>[],
  config: TransformConfig
): Feature<LineString>[] {
  const { mvtExtent = MVT_EXTENT } = config;
  const transform = createTransform(config);
  const result: Feature<LineString>[] = [];

  for (const feature of features) {
    if (feature.geometry.type !== 'LineString') continue;

    const coords = feature.geometry.coordinates;
    const transformedCoords = coords.map(transform);
    const clipped = clipLineToBox(transformedCoords, 0, 0, mvtExtent, mvtExtent);

    for (const segment of clipped) {
      if (segment.length >= 2) {
        result.push(lineString(segment, feature.properties ?? {}));
      }
    }
  }

  return result;
}

/**
 * Transforms and clips Polygon features to tile extent.
 */
export function transformAndClipPolygonFeatures(
  features: Feature<Polygon>[],
  config: TransformConfig
): Feature<Polygon>[] {
  const { mvtExtent = MVT_EXTENT } = config;
  const transform = createTransform(config);
  const result: Feature<Polygon>[] = [];

  for (const feature of features) {
    const rings = feature.geometry.coordinates;
    const transformedRings: Position[][] = [];

    for (const ring of rings) {
      const transformedRing = ring.map(transform);
      const clippedRing = clipPolygonRingToBox(transformedRing, 0, 0, mvtExtent, mvtExtent);

      // Minimum 4 points: 3 unique vertices + closing point for valid ring
      if (clippedRing.length >= 4) {
        // Ensure ring closure (Sutherland-Hodgman may not preserve it)
        const first = clippedRing[0];
        const last = clippedRing[clippedRing.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          clippedRing.push([...first]);
        }
        transformedRings.push(clippedRing);
      }
    }

    if (transformedRings.length > 0) {
      result.push(polygon(transformedRings, feature.properties ?? {}));
    }
  }

  return result;
}
