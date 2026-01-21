/**
 * Contour Polygon Tests
 * Ported from ContourTracerPolygonTest.java
 *
 * Tests all 16 marching squares cases for polygon output,
 * plus edge case tests for closed linestring bugs
 */

import { describe, it, expect } from 'vitest';
import type { Feature, Polygon } from 'geojson';
import { tracePolygons } from '../../src/lib/dem';
import {
  CASE_00, CASE_01, CASE_02, CASE_03,
  CASE_04, CASE_05, CASE_06, CASE_07,
  CASE_08, CASE_09, CASE_10, CASE_11,
  CASE_12, CASE_13, CASE_14, CASE_15,
  assertFeatureEquals,
  isPolygonFeature,
} from './test-utils';

function trace(grid: number[]): Feature<Polygon>[] {
  const size = Math.sqrt(grid.length);
  return tracePolygons(grid, size, size, 0.5);
}

describe('tracePolygons', () => {
  it('Test case 0 - no polygon', () => {
    const polygons = trace(CASE_00);
    expect(polygons).toHaveLength(0);
  });

  it('Test case 1', () => {
    const polygons = trace(CASE_01);
    expect(polygons).toHaveLength(1);
    expect(assertFeatureEquals('POLYGON ((0.5 0, 0 0, 0 0.5, 0.5 0))', polygons[0])).toBe(true);
  });

  it('Test case 2', () => {
    const polygons = trace(CASE_02);
    expect(polygons).toHaveLength(1);
    expect(assertFeatureEquals('POLYGON ((1 0.5, 1 0, 0.5 0, 1 0.5))', polygons[0])).toBe(true);
  });

  it('Test case 3', () => {
    const polygons = trace(CASE_03);
    expect(polygons).toHaveLength(1);
    expect(assertFeatureEquals('POLYGON ((0 0, 0 0.5, 1 0.5, 1 0, 0 0))', polygons[0])).toBe(true);
  });

  it('Test case 4', () => {
    const polygons = trace(CASE_04);
    expect(polygons).toHaveLength(1);
    expect(assertFeatureEquals('POLYGON ((1 1, 1 0.5, 0.5 1, 1 1))', polygons[0])).toBe(true);
  });

  it('Test case 5', () => {
    const polygons = trace(CASE_05);
    expect(polygons).toHaveLength(1);
    expect(assertFeatureEquals('POLYGON ((1 1, 1 0.5, 0.5 0, 0 0, 0 0.5, 0.5 1, 1 1))', polygons[0])).toBe(true);
  });

  it('Test case 6', () => {
    const polygons = trace(CASE_06);
    expect(polygons).toHaveLength(1);
    expect(assertFeatureEquals('POLYGON ((0.5 1, 1 1, 1 0, 0.5 0, 0.5 1))', polygons[0])).toBe(true);
  });

  it('Test case 7', () => {
    const polygons = trace(CASE_07);
    expect(polygons).toHaveLength(1);
    expect(assertFeatureEquals('POLYGON ((1 1, 1 0, 0 0, 0 0.5, 0.5 1, 1 1))', polygons[0])).toBe(true);
  });

  it('Test case 8', () => {
    const polygons = trace(CASE_08);
    expect(polygons).toHaveLength(1);
    expect(assertFeatureEquals('POLYGON ((0.5 1, 0 0.5, 0 1, 0.5 1))', polygons[0])).toBe(true);
  });

  it('Test case 9', () => {
    const polygons = trace(CASE_09);
    expect(polygons).toHaveLength(1);
    expect(assertFeatureEquals('POLYGON ((0.5 1, 0.5 0, 0 0, 0 1, 0.5 1))', polygons[0])).toBe(true);
  });

  it('Test case 10', () => {
    const polygons = trace(CASE_10);
    expect(polygons).toHaveLength(1);
    expect(assertFeatureEquals('POLYGON ((0.5 1, 1 0.5, 1 0, 0.5 0, 0 0.5, 0 1, 0.5 1))', polygons[0])).toBe(true);
  });

  it('Test case 11', () => {
    const polygons = trace(CASE_11);
    expect(polygons).toHaveLength(1);
    expect(assertFeatureEquals('POLYGON ((1 0, 0 0, 0 1, 0.5 1, 1 0.5, 1 0))', polygons[0])).toBe(true);
  });

  it('Test case 12', () => {
    const polygons = trace(CASE_12);
    expect(polygons).toHaveLength(1);
    expect(assertFeatureEquals('POLYGON ((1 0.5, 0 0.5, 0 1, 1 1, 1 0.5))', polygons[0])).toBe(true);
  });

  it('Test case 13', () => {
    const polygons = trace(CASE_13);
    expect(polygons).toHaveLength(1);
    expect(assertFeatureEquals('POLYGON ((0.5 0, 0 0, 0 1, 1 1, 1 0.5, 0.5 0))', polygons[0])).toBe(true);
  });

  it('Test case 14', () => {
    const polygons = trace(CASE_14);
    expect(polygons).toHaveLength(1);
    expect(assertFeatureEquals('POLYGON ((0 0.5, 0 1, 1 1, 1 0, 0.5 0, 0 0.5))', polygons[0])).toBe(true);
  });

  it('Test case 15 - full cell covered', () => {
    const polygons = trace(CASE_15);
    expect(polygons).toHaveLength(1);
    expect(assertFeatureEquals('POLYGON ((0 0, 0 1, 1 1, 1 0, 0 0))', polygons[0])).toBe(true);
  });

  describe('Edge cases - Closed LineString Bugs', () => {
    it('Closed LineString Bug 1', () => {
      const grid = [
        133.3801854240864, 121.23325422569911, 153.52819487296264, 167.57377406292332,
        100.937349262252, 96.62896517856514, 132.65708268451803, 147.307915356104,
        98.7659308960914, 104.55934526711907, 141.3071569592299, 151.71211629894563,
        139.87179431281479, 144.5483699607932, 171.74295402684095, 175.7901414451639,
      ];
      const contours = tracePolygons(grid, 4, 4, 99);

      expect(contours.length).toBeGreaterThan(0);
      expect(contours.every(isPolygonFeature)).toBe(true);
    });

    it('Closed LineString Bug 2', () => {
      const grid = [
        491.0, 495.0, 502.0, 503.0,
        487.0, 493.0, 500.0, 499.0,
        490.0, 495.0, 500.0, 497.0,
        499.0, 502.0, 505.0, 500.0,
      ];
      const contours = tracePolygons(grid, 4, 4, 500);

      expect(contours.length).toBeGreaterThan(0);
      expect(contours.every(isPolygonFeature)).toBe(true);
    });
  });
});
