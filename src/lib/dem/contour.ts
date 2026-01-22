/**
 * Contour line and polygon generation using Marching Squares.
 *
 * Traces isolines through gridded data (elevation DEMs, hillshade values, etc.)
 * producing either open polylines or closed polygons with proper hole detection.
 *
 * @see https://en.wikipedia.org/wiki/Marching_squares
 */

import type { Feature, LineString, Polygon } from 'geojson';
import { lineString, polygon } from '@turf/helpers';

import { type Grid, createGrid, gridGetAt } from './grid';

type Coordinate = [number, number];

const EPSILON = 1e-10;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Traces contour lines at specified levels.
 *
 * Use for elevation contours, isobars, isotherms, or any isoline visualization.
 *
 * @param data Grid values in row-major order
 * @param width Grid width
 * @param height Grid height
 * @param levels Single level or array of levels to trace
 * @returns LineString features with `{ level }` properties
 *
 * @example
 * const contours = traceLines(elevationData, 257, 257, [100, 200, 300]);
 */
export function traceLines(
  data: Float64Array | number[],
  width: number,
  height: number,
  levels: number | number[]
): Feature<LineString>[] {
  const grid = createGrid(data, width, height);
  const levelArray = Array.isArray(levels) ? levels : [levels];

  const features: Feature<LineString>[] = [];
  for (const level of levelArray) {
    const segments = collectSegments(grid, level, false);
    const lines = mergeSegments(segments);
    for (const coords of lines) {
      features.push(lineString(coords, { level }));
    }
  }
  return features;
}

/**
 * Traces filled contour polygons at specified levels.
 *
 * Use for hillshade bands, choropleth regions, or any filled area visualization.
 * Smaller regions inside larger ones become holes rather than overlapping polygons.
 *
 * @param data Grid values in row-major order
 * @param width Grid width
 * @param height Grid height
 * @param levels Single level or array of levels to trace
 * @returns Polygon features with `{ level }` properties
 *
 * @example
 * const bands = tracePolygons(hillshadeData, 257, 257, [0, 64, 128, 192]);
 */
export function tracePolygons(
  data: Float64Array | number[],
  width: number,
  height: number,
  levels: number | number[]
): Feature<Polygon>[] {
  const grid = createGrid(data, width, height);
  const levelArray = Array.isArray(levels) ? levels : [levels];

  const features: Feature<Polygon>[] = [];
  for (const level of levelArray) {
    const segments = collectSegments(grid, level, true);
    const lines = mergeSegments(segments);
    features.push(...buildPolygonsWithHoles(lines, level));
  }
  return features;
}

// ─────────────────────────────────────────────────────────────────────────────
// Marching Squares Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collects line segments for a level using Marching Squares.
 *
 * Each 2x2 cell is classified into one of 16 cases based on which corners
 * are above/below the threshold. Each case maps to 0-2 line segments.
 */
function collectSegments(grid: Grid, level: number, forPolygons: boolean): Coordinate[][] {
  const segments: Coordinate[][] = [];

  for (let y = 0; y < grid.height - 1; y++) {
    for (let x = 0; x < grid.width - 1; x++) {
      segments.push(...processCellMarching(grid, level, x, y, forPolygons));
    }
  }

  return segments;
}

/**
 * Processes a single cell using Marching Squares lookup.
 */
function processCellMarching(
  grid: Grid,
  level: number,
  x: number,
  y: number,
  forPolygons: boolean
): Coordinate[][] {
  const segments: Coordinate[][] = [];

  // Boundary flags for polygon mode - ensures polygons close at tile edges
  const atTop = forPolygons && y === grid.height - 2;
  const atRight = forPolygons && x === grid.width - 2;
  const atBottom = forPolygons && y === 0;
  const atLeft = forPolygons && x === 0;

  // Corner coordinates
  const tl: Coordinate = [x, y + 1];
  const tr: Coordinate = [x + 1, y + 1];
  const br: Coordinate = [x + 1, y];
  const bl: Coordinate = [x, y];

  // Interpolated midpoints along edges
  const tm = interpolate(grid, level, x, y + 1, x + 1, y + 1);
  const rm = interpolate(grid, level, x + 1, y, x + 1, y + 1);
  const bm = interpolate(grid, level, x, y, x + 1, y);
  const lm = interpolate(grid, level, x, y, x, y + 1);

  // Corner values (note: grid is row-major, y*width+x)
  const tlv = gridGetAt(grid, y * grid.width + x);
  const trv = gridGetAt(grid, y * grid.width + (x + 1));
  const brv = gridGetAt(grid, (y + 1) * grid.width + (x + 1));
  const blv = gridGetAt(grid, (y + 1) * grid.width + x);

  // Marching squares case index (0-15)
  const caseIndex =
    (tlv >= level ? 1 : 0) |
    (trv >= level ? 2 : 0) |
    (brv >= level ? 4 : 0) |
    (blv >= level ? 8 : 0);

  // Case lookup - each case defines which segments to emit
  switch (caseIndex) {
    case 0:
      break;
    case 1:
      segments.push([lm, bm]);
      if (atBottom) segments.push([bm, bl]);
      if (atLeft) segments.push([bl, lm]);
      break;
    case 2:
      segments.push([bm, rm]);
      if (atRight) segments.push([rm, br]);
      if (atBottom) segments.push([br, bm]);
      break;
    case 3:
      segments.push([lm, rm]);
      if (atRight) segments.push([rm, br]);
      if (atBottom) segments.push([br, bl]);
      if (atLeft) segments.push([bl, lm]);
      break;
    case 4:
      segments.push([rm, tm]);
      if (atTop) segments.push([tm, tr]);
      if (atRight) segments.push([tr, rm]);
      break;
    case 5:
      segments.push([lm, tm]);
      if (atTop) segments.push([tm, tr]);
      if (atRight) segments.push([tr, rm]);
      segments.push([rm, bm]);
      if (atBottom) segments.push([bm, bl]);
      if (atLeft) segments.push([bl, lm]);
      break;
    case 6:
      segments.push([bm, tm]);
      if (atTop) segments.push([tm, tr]);
      if (atRight) segments.push([tr, br]);
      if (atBottom) segments.push([br, bm]);
      break;
    case 7:
      segments.push([lm, tm]);
      if (atTop) segments.push([tm, tr]);
      if (atRight) segments.push([tr, br]);
      if (atBottom) segments.push([br, bl]);
      if (atLeft) segments.push([bl, lm]);
      break;
    case 8:
      segments.push([tm, lm]);
      if (atLeft) segments.push([lm, tl]);
      if (atTop) segments.push([tl, tm]);
      break;
    case 9:
      segments.push([tm, bm]);
      if (atBottom) segments.push([bm, bl]);
      if (atLeft) segments.push([bl, tl]);
      if (atTop) segments.push([tl, tm]);
      break;
    case 10:
      segments.push([bm, lm]);
      if (atLeft) segments.push([lm, tl]);
      if (atTop) segments.push([tl, tm]);
      segments.push([tm, rm]);
      if (atRight) segments.push([rm, br]);
      if (atBottom) segments.push([br, bm]);
      break;
    case 11:
      segments.push([tm, rm]);
      if (atRight) segments.push([rm, br]);
      if (atBottom) segments.push([br, bl]);
      if (atLeft) segments.push([bl, tl]);
      if (atTop) segments.push([tl, tm]);
      break;
    case 12:
      segments.push([rm, lm]);
      if (atLeft) segments.push([lm, tl]);
      if (atTop) segments.push([tl, tr]);
      if (atRight) segments.push([tr, rm]);
      break;
    case 13:
      segments.push([rm, bm]);
      if (atBottom) segments.push([bm, bl]);
      if (atLeft) segments.push([bl, tl]);
      if (atTop) segments.push([tl, tr]);
      if (atRight) segments.push([tr, rm]);
      break;
    case 14:
      segments.push([bm, lm]);
      if (atLeft) segments.push([lm, tl]);
      if (atTop) segments.push([tl, tr]);
      if (atRight) segments.push([tr, br]);
      if (atBottom) segments.push([br, bm]);
      break;
    case 15:
      if (atTop) segments.push([tl, tr]);
      if (atRight) segments.push([tr, br]);
      if (atBottom) segments.push([br, bl]);
      if (atLeft) segments.push([bl, tl]);
      break;
  }

  return segments;
}

/**
 * Interpolates a point along an edge where the contour crosses.
 */
function interpolate(
  grid: Grid,
  level: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): Coordinate {
  const v1 = gridGetAt(grid, y1 * grid.width + x1);
  const v2 = gridGetAt(grid, y2 * grid.width + x2);

  let t = Math.abs(v2 - v1) < EPSILON ? 0.5 : (level - v1) / (v2 - v1);
  t = Math.max(EPSILON, Math.min(1 - EPSILON, t));

  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Segment Merging (Optimized with coordinate-indexed lookup)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quantizes a coordinate to a string key for hash-based lookups.
 * Uses fixed precision to handle floating-point tolerance matching.
 */
function coordKey(coord: Coordinate): string {
  // Quantize to 6 decimal places (~0.1mm precision at equator)
  const x = Math.round(coord[0] * 1e6);
  const y = Math.round(coord[1] * 1e6);
  return `${x},${y}`;
}

/**
 * A chain is a mutable polyline that can grow at either end.
 * Using a doubly-ended structure avoids expensive array reversals.
 */
interface Chain {
  coords: Coordinate[];
  startKey: string;
  endKey: string;
  merged: boolean;
}

/**
 * Merges disconnected segments into continuous polylines.
 *
 * Optimized algorithm: O(n) average case using coordinate-indexed maps
 * instead of O(n²) brute-force matching. Each segment endpoint is indexed
 * for O(1) lookup when finding merge candidates.
 */
function mergeSegments(segments: Coordinate[][]): Coordinate[][] {
  if (segments.length === 0) return [];

  // Index maps: coordinate key -> chains that have this coordinate as endpoint
  const byStart = new Map<string, Chain[]>();
  const byEnd = new Map<string, Chain[]>();

  // Initialize each segment as its own chain
  const chains: Chain[] = segments.map((seg) => ({
    coords: [...seg],
    startKey: coordKey(seg[0]),
    endKey: coordKey(seg[seg.length - 1]),
    merged: false,
  }));

  // Build initial index
  for (const chain of chains) {
    addToIndex(byStart, chain.startKey, chain);
    addToIndex(byEnd, chain.endKey, chain);
  }

  // Process each chain, attempting to extend it
  for (const chain of chains) {
    if (chain.merged) continue;
    extendChain(chain, byStart, byEnd);
  }

  // Collect non-merged chains
  return chains.filter((c) => !c.merged).map((c) => c.coords);
}

function addToIndex(index: Map<string, Chain[]>, key: string, chain: Chain): void {
  const list = index.get(key);
  if (list) {
    list.push(chain);
  } else {
    index.set(key, [chain]);
  }
}

function removeFromIndex(index: Map<string, Chain[]>, key: string, chain: Chain): void {
  const list = index.get(key);
  if (list) {
    const idx = list.indexOf(chain);
    if (idx >= 0) list.splice(idx, 1);
  }
}

/**
 * Extends a chain by repeatedly finding and merging connected segments.
 */
function extendChain(
  chain: Chain,
  byStart: Map<string, Chain[]>,
  byEnd: Map<string, Chain[]>
): void {
  let changed = true;

  while (changed) {
    changed = false;

    // Try to extend at the end of this chain
    const endCandidates = byStart.get(chain.endKey) ?? [];
    for (const other of endCandidates) {
      if (other === chain || other.merged) continue;

      // other.start matches chain.end -> append other to chain
      removeFromIndex(byStart, other.startKey, other);
      removeFromIndex(byEnd, other.endKey, other);
      removeFromIndex(byEnd, chain.endKey, chain);

      // Append (skip duplicate junction point)
      chain.coords.push(...other.coords.slice(1));
      chain.endKey = other.endKey;
      other.merged = true;

      addToIndex(byEnd, chain.endKey, chain);
      changed = true;
      break;
    }

    if (changed) continue;

    // Try other.end matches chain.end -> append reversed other
    const endEndCandidates = byEnd.get(chain.endKey) ?? [];
    for (const other of endEndCandidates) {
      if (other === chain || other.merged) continue;

      removeFromIndex(byStart, other.startKey, other);
      removeFromIndex(byEnd, other.endKey, other);
      removeFromIndex(byEnd, chain.endKey, chain);

      // Append reversed (skip duplicate junction point)
      for (let i = other.coords.length - 2; i >= 0; i--) {
        chain.coords.push(other.coords[i]);
      }
      chain.endKey = other.startKey;
      other.merged = true;

      addToIndex(byEnd, chain.endKey, chain);
      changed = true;
      break;
    }

    if (changed) continue;

    // Try to extend at the start of this chain
    const startCandidates = byEnd.get(chain.startKey) ?? [];
    for (const other of startCandidates) {
      if (other === chain || other.merged) continue;

      // other.end matches chain.start -> prepend other to chain
      removeFromIndex(byStart, other.startKey, other);
      removeFromIndex(byEnd, other.endKey, other);
      removeFromIndex(byStart, chain.startKey, chain);

      // Prepend (skip duplicate junction point)
      const newCoords = [...other.coords.slice(0, -1), ...chain.coords];
      chain.coords = newCoords;
      chain.startKey = other.startKey;
      other.merged = true;

      addToIndex(byStart, chain.startKey, chain);
      changed = true;
      break;
    }

    if (changed) continue;

    // Try other.start matches chain.start -> prepend reversed other
    const startStartCandidates = byStart.get(chain.startKey) ?? [];
    for (const other of startStartCandidates) {
      if (other === chain || other.merged) continue;

      removeFromIndex(byStart, other.startKey, other);
      removeFromIndex(byEnd, other.endKey, other);
      removeFromIndex(byStart, chain.startKey, chain);

      // Prepend reversed (skip duplicate junction point)
      const reversed: Coordinate[] = [];
      for (let i = other.coords.length - 1; i >= 1; i--) {
        reversed.push(other.coords[i]);
      }
      chain.coords = [...reversed, ...chain.coords];
      chain.startKey = other.endKey;
      other.merged = true;

      addToIndex(byStart, chain.startKey, chain);
      changed = true;
      break;
    }
  }
}

function coordsEqual(a: Coordinate, b: Coordinate): boolean {
  return Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON;
}

// ─────────────────────────────────────────────────────────────────────────────
// Polygon Construction with Hole Detection (Optimized)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes signed area of a ring using the shoelace formula.
 * Positive = counter-clockwise, negative = clockwise.
 */
function ringArea(ring: Coordinate[]): number {
  let area = 0;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    area += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return area / 2;
}

/**
 * Ray-casting point-in-ring test.
 * Counts intersections of a horizontal ray from point to +infinity.
 * Odd count = inside, even = outside.
 */
function pointInRing(point: Coordinate, ring: Coordinate[]): boolean {
  const [px, py] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    // Check if edge crosses the horizontal ray from point
    if ((yi > py) !== (yj > py)) {
      // Compute x-coordinate of intersection
      const xIntersect = ((xj - xi) * (py - yi)) / (yj - yi) + xi;
      if (px < xIntersect) {
        inside = !inside;
      }
    }
  }

  return inside;
}

/**
 * Converts closed contour lines to polygons with proper hole detection.
 */
function buildPolygonsWithHoles(lines: Coordinate[][], level: number): Feature<Polygon>[] {
  // Build and sort polygons by area (largest first)
  const polys: { ring: Coordinate[]; area: number }[] = [];

  for (const line of lines) {
    const ring = closeRing(line);

    // Skip degenerate rings (need at least 4 positions for a valid LinearRing)
    if (ring.length < 4) {
      continue;
    }

    // Force exact coordinate equality for first/last position
    ring[ring.length - 1] = ring[0];

    polys.push({ ring, area: Math.abs(ringArea(ring)) });
  }

  polys.sort((a, b) => b.area - a.area);

  // Assign smaller polygons as holes of larger containing polygons
  const result: Feature<Polygon>[] = [];
  const used = new Set<number>();

  for (let i = 0; i < polys.length; i++) {
    if (used.has(i)) continue;

    const shell = polys[i];
    const holes: Coordinate[][] = [];

    for (let j = i + 1; j < polys.length; j++) {
      if (used.has(j)) continue;

      const candidate = polys[j];
      if (isInsidePolygon(candidate.ring[0], shell.ring, holes)) {
        holes.push(candidate.ring);
        used.add(j);
      }
    }

    result.push(polygon([shell.ring, ...holes], { level }));
    used.add(i);
  }

  return result;
}

function closeRing(coords: Coordinate[]): Coordinate[] {
  const ring = [...coords];
  if (!coordsEqual(ring[0], ring[ring.length - 1])) {
    ring.push(ring[0]);
  }
  return ring;
}

/**
 * Tests if a point is inside a shell polygon but not inside any existing holes.
 * Uses inline ray-casting for O(n) per-ring performance.
 */
function isInsidePolygon(
  point: Coordinate,
  shell: Coordinate[],
  existingHoles: Coordinate[][]
): boolean {
  if (!pointInRing(point, shell)) {
    return false;
  }
  // Check it's not inside an existing hole
  for (const hole of existingHoles) {
    if (pointInRing(point, hole)) {
      return false;
    }
  }
  return true;
}
