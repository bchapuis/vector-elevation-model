/**
 * Contour LineString Tests
 * Ported from ContourTracerLineStringTest.java
 *
 * Tests all 16 marching squares cases for linestring output
 */

import { describe, it, expect } from 'vitest';
import type { Feature, LineString } from 'geojson';
import { traceLines } from '../../src/lib/dem';
import {
  CASE_00, CASE_01, CASE_02, CASE_03,
  CASE_04, CASE_05, CASE_06, CASE_07,
  CASE_08, CASE_09, CASE_10, CASE_11,
  CASE_12, CASE_13, CASE_14, CASE_15,
  assertFeatureEquals,
} from './test-utils';

function trace(grid: number[]): Feature<LineString>[] {
  return traceLines(grid, 2, 2, 0.5);
}

describe('traceLines', () => {
  it('Test case 0 - no contour', () => {
    const lines = trace(CASE_00);
    expect(lines).toHaveLength(0);
  });

  it('Test case 1', () => {
    const lines = trace(CASE_01);
    expect(lines).toHaveLength(1);
    expect(assertFeatureEquals('LINESTRING (0 0.5, 0.5 0)', lines[0])).toBe(true);
  });

  it('Test case 2', () => {
    const lines = trace(CASE_02);
    expect(lines).toHaveLength(1);
    expect(assertFeatureEquals('LINESTRING (0.5 0, 1 0.5)', lines[0])).toBe(true);
  });

  it('Test case 3', () => {
    const lines = trace(CASE_03);
    expect(lines).toHaveLength(1);
    expect(assertFeatureEquals('LINESTRING (0 0.5, 1 0.5)', lines[0])).toBe(true);
  });

  it('Test case 4', () => {
    const lines = trace(CASE_04);
    expect(lines).toHaveLength(1);
    expect(assertFeatureEquals('LINESTRING (1 0.5, 0.5 1)', lines[0])).toBe(true);
  });

  it('Test case 5 - saddle point produces two lines', () => {
    const lines = trace(CASE_05);
    expect(lines).toHaveLength(2);
    // Order may vary, check both possibilities
    const hasLine1 = assertFeatureEquals('LINESTRING (0 0.5, 0.5 1)', lines[0]) ||
                     assertFeatureEquals('LINESTRING (0 0.5, 0.5 1)', lines[1]);
    const hasLine2 = assertFeatureEquals('LINESTRING (1 0.5, 0.5 0)', lines[0]) ||
                     assertFeatureEquals('LINESTRING (1 0.5, 0.5 0)', lines[1]);
    expect(hasLine1).toBe(true);
    expect(hasLine2).toBe(true);
  });

  it('Test case 6', () => {
    const lines = trace(CASE_06);
    expect(lines).toHaveLength(1);
    expect(assertFeatureEquals('LINESTRING (0.5 0, 0.5 1)', lines[0])).toBe(true);
  });

  it('Test case 7', () => {
    const lines = trace(CASE_07);
    expect(lines).toHaveLength(1);
    expect(assertFeatureEquals('LINESTRING (0 0.5, 0.5 1)', lines[0])).toBe(true);
  });

  it('Test case 8', () => {
    const lines = trace(CASE_08);
    expect(lines).toHaveLength(1);
    expect(assertFeatureEquals('LINESTRING (0.5 1, 0 0.5)', lines[0])).toBe(true);
  });

  it('Test case 9', () => {
    const lines = trace(CASE_09);
    expect(lines).toHaveLength(1);
    expect(assertFeatureEquals('LINESTRING (0.5 1, 0.5 0)', lines[0])).toBe(true);
  });

  it('Test case 10 - saddle point produces two lines', () => {
    const lines = trace(CASE_10);
    expect(lines).toHaveLength(2);
    // Order may vary, check both possibilities
    const hasLine1 = assertFeatureEquals('LINESTRING (0.5 0, 0 0.5)', lines[0]) ||
                     assertFeatureEquals('LINESTRING (0.5 0, 0 0.5)', lines[1]);
    const hasLine2 = assertFeatureEquals('LINESTRING (0.5 1, 1 0.5)', lines[0]) ||
                     assertFeatureEquals('LINESTRING (0.5 1, 1 0.5)', lines[1]);
    expect(hasLine1).toBe(true);
    expect(hasLine2).toBe(true);
  });

  it('Test case 11', () => {
    const lines = trace(CASE_11);
    expect(lines).toHaveLength(1);
    expect(assertFeatureEquals('LINESTRING (0.5 1, 1 0.5)', lines[0])).toBe(true);
  });

  it('Test case 12', () => {
    const lines = trace(CASE_12);
    expect(lines).toHaveLength(1);
    expect(assertFeatureEquals('LINESTRING (1 0.5, 0 0.5)', lines[0])).toBe(true);
  });

  it('Test case 13', () => {
    const lines = trace(CASE_13);
    expect(lines).toHaveLength(1);
    expect(assertFeatureEquals('LINESTRING (1 0.5, 0.5 0)', lines[0])).toBe(true);
  });

  it('Test case 14', () => {
    const lines = trace(CASE_14);
    expect(lines).toHaveLength(1);
    expect(assertFeatureEquals('LINESTRING (0.5 0, 0 0.5)', lines[0])).toBe(true);
  });

  it('Test case 15 - all above level, no contour', () => {
    const lines = trace(CASE_15);
    expect(lines).toHaveLength(0);
  });
});
