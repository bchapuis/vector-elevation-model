/**
 * Test utilities for DEM library tests
 * Ported from MarchingSquareUtils.java
 */

import type { Feature, LineString, Polygon, Position } from 'geojson';

// Marching Squares test cases - 2x2 grids representing all 16 configurations
export const CASE_00 = [0, 0, 0, 0];
export const CASE_01 = [1, 0, 0, 0];
export const CASE_02 = [0, 1, 0, 0];
export const CASE_03 = [1, 1, 0, 0];
export const CASE_04 = [0, 0, 0, 1];
export const CASE_05 = [1, 0, 0, 1];
export const CASE_06 = [0, 1, 0, 1];
export const CASE_07 = [1, 1, 0, 1];
export const CASE_08 = [0, 0, 1, 0];
export const CASE_09 = [1, 0, 1, 0];
export const CASE_10 = [0, 1, 1, 0];
export const CASE_11 = [1, 1, 1, 0];
export const CASE_12 = [0, 0, 1, 1];
export const CASE_13 = [1, 0, 1, 1];
export const CASE_14 = [0, 1, 1, 1];
export const CASE_15 = [1, 1, 1, 1];

export const ALL_CASES = [
  CASE_00, CASE_01, CASE_02, CASE_03,
  CASE_04, CASE_05, CASE_06, CASE_07,
  CASE_08, CASE_09, CASE_10, CASE_11,
  CASE_12, CASE_13, CASE_14, CASE_15,
];

/**
 * Surrounds a 2x2 grid with zeros to create a 4x4 grid
 */
export function buffer(grid: number[]): number[] {
  return [
    0, 0, 0, 0,
    0, grid[0], grid[1], 0,
    0, grid[2], grid[3], 0,
    0, 0, 0, 0,
  ];
}

export const BUFFERED_CASES = ALL_CASES.map(buffer);

/**
 * Converts a LineString Feature to WKT format for comparison
 */
export function lineStringToWkt(feature: Feature<LineString>): string {
  const coords = feature.geometry.coordinates;
  if (coords.length === 0) return 'LINESTRING EMPTY';
  const coordStr = coords.map(c => `${c[0]} ${c[1]}`).join(', ');
  return `LINESTRING (${coordStr})`;
}

/**
 * Converts a Polygon Feature to WKT format for comparison
 */
export function polygonToWkt(feature: Feature<Polygon>): string {
  const rings = feature.geometry.coordinates;
  const exterior = rings[0].map(c => `${c[0]} ${c[1]}`).join(', ');
  if (rings.length === 1) {
    return `POLYGON ((${exterior}))`;
  }
  const holes = rings.slice(1).map(hole => {
    const holeCoords = hole.map(c => `${c[0]} ${c[1]}`).join(', ');
    return `(${holeCoords})`;
  }).join(', ');
  return `POLYGON ((${exterior}), ${holes})`;
}

/**
 * Converts any Feature to WKT
 */
export function featureToWkt(feature: Feature<LineString | Polygon>): string {
  if (feature.geometry.type === 'Polygon') {
    return polygonToWkt(feature as Feature<Polygon>);
  }
  return lineStringToWkt(feature as Feature<LineString>);
}

/**
 * Parses a WKT linestring into coordinates
 */
export function parseWktLineString(wkt: string): Position[] {
  const match = wkt.match(/LINESTRING\s*\(([^)]+)\)/);
  if (!match) throw new Error(`Invalid WKT: ${wkt}`);

  return match[1].split(',').map(pair => {
    const [x, y] = pair.trim().split(/\s+/).map(Number);
    return [x, y] as Position;
  });
}

/**
 * Parses a WKT polygon into coordinate rings
 */
export function parseWktPolygon(wkt: string): Position[][] {
  const rings: Position[][] = [];
  const ringRegex = /\(([^()]+)\)/g;
  let match;

  while ((match = ringRegex.exec(wkt)) !== null) {
    const coords = match[1].split(',').map(pair => {
      const [x, y] = pair.trim().split(/\s+/).map(Number);
      return [x, y] as Position;
    });
    rings.push(coords);
  }

  if (rings.length === 0) throw new Error(`Invalid WKT polygon: ${wkt}`);
  return rings;
}

/**
 * Checks if two coordinate arrays represent the same ring (can start at different vertices)
 */
function ringsEqual(
  expected: Position[],
  actual: Position[],
  tolerance: number
): boolean {
  if (expected.length !== actual.length) return false;

  // For rings, the last point equals the first - work with unique points only
  const expUnique = expected.slice(0, -1);
  const actUnique = actual.slice(0, -1);

  if (expUnique.length !== actUnique.length) return false;
  if (expUnique.length === 0) return true;

  const n = expUnique.length;
  for (let offset = 0; offset < n; offset++) {
    let match = true;
    for (let i = 0; i < n; i++) {
      const expIdx = i;
      const actIdx = (i + offset) % n;
      if (
        Math.abs(expUnique[expIdx][0] - actUnique[actIdx][0]) > tolerance ||
        Math.abs(expUnique[expIdx][1] - actUnique[actIdx][1]) > tolerance
      ) {
        match = false;
        break;
      }
    }
    if (match) return true;

    // Try reverse direction
    match = true;
    for (let i = 0; i < n; i++) {
      const expIdx = i;
      const actIdx = (offset - i + n) % n;
      if (
        Math.abs(expUnique[expIdx][0] - actUnique[actIdx][0]) > tolerance ||
        Math.abs(expUnique[expIdx][1] - actUnique[actIdx][1]) > tolerance
      ) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }

  return false;
}

/**
 * Asserts that a Feature equals the expected WKT
 */
export function assertFeatureEquals(
  expectedWkt: string,
  actual: Feature<LineString | Polygon>,
  tolerance: number = 1e-6
): boolean {
  if (expectedWkt.startsWith('LINESTRING')) {
    if (actual.geometry.type !== 'LineString') return false;
    const expected = parseWktLineString(expectedWkt);
    const actualCoords = actual.geometry.coordinates;

    if (expected.length !== actualCoords.length) return false;

    return expected.every((coord, i) =>
      Math.abs(coord[0] - actualCoords[i][0]) < tolerance &&
      Math.abs(coord[1] - actualCoords[i][1]) < tolerance
    );
  } else if (expectedWkt.startsWith('POLYGON')) {
    if (actual.geometry.type !== 'Polygon') return false;
    const expectedRings = parseWktPolygon(expectedWkt);
    const actualRings = actual.geometry.coordinates;

    if (!ringsEqual(expectedRings[0], actualRings[0], tolerance)) {
      return false;
    }

    if (expectedRings.length !== actualRings.length) return false;
    return true;
  }

  return false;
}

/**
 * Type guard for Polygon features
 */
export function isPolygonFeature(
  feature: Feature<LineString | Polygon>
): feature is Feature<Polygon> {
  return feature.geometry.type === 'Polygon';
}

/**
 * Type guard for LineString features
 */
export function isLineStringFeature(
  feature: Feature<LineString | Polygon>
): feature is Feature<LineString> {
  return feature.geometry.type === 'LineString';
}
