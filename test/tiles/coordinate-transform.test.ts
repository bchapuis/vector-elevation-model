import { describe, it, expect } from 'vitest';
import {
  createTransform,
  transformCoordinates,
  transformLineString,
  transformPolygon,
  transformFeature,
  transformFeatures,
  transformAndClipFeatures,
  transformAndClipPolygonFeatures,
} from '../../src/lib/tiles/coordinate-transform';
import { lineString, polygon } from '@turf/helpers';

describe('coordinate-transform', () => {
  describe('createTransform', () => {
    it('should transform with 0 buffer', () => {
      const transform = createTransform({ bufferPx: 0, tileSizePx: 256, mvtExtent: 4096 });

      // Grid (0,0) top-left -> MVT (0,0) top-left
      expect(transform([0, 0])).toEqual([0, 0]);

      // Grid (256,256) bottom-right -> MVT (4096,4096) bottom-right
      expect(transform([256, 256])).toEqual([4096, 4096]);

      // Grid (128,128) center -> MVT (2048,2048) center
      expect(transform([128, 128])).toEqual([2048, 2048]);
    });

    it('should translate and scale with 4px buffer', () => {
      const transform = createTransform({ bufferPx: 4, tileSizePx: 256, mvtExtent: 4096 });
      // Scale is 4096 / 256 = 16

      // Grid buffer edge (4,4) -> MVT (0,0) top-left
      expect(transform([4, 4])).toEqual([0, 0]);

      // Grid opposite buffer edge (260,260) -> MVT (4096,4096) bottom-right
      expect(transform([260, 260])).toEqual([4096, 4096]);

      // Grid center (132,132) -> MVT (2048,2048) center
      expect(transform([132, 132])).toEqual([2048, 2048]);

      // Grid origin (0,0) -> MVT (-64, -64) - in buffer zone
      expect(transform([0, 0])).toEqual([-64, -64]);
    });

    it('should handle 16px buffer for hillshade', () => {
      const transform = createTransform({ bufferPx: 16, tileSizePx: 256, mvtExtent: 4096 });

      // Grid buffer edge (16,16) -> MVT (0,0) top-left
      expect(transform([16, 16])).toEqual([0, 0]);

      // Grid opposite edge (272,272) -> MVT (4096,4096) bottom-right
      expect(transform([272, 272])).toEqual([4096, 4096]);
    });
  });

  describe('transformCoordinates', () => {
    it('should transform array of coordinates', () => {
      const transform = createTransform({ bufferPx: 4, tileSizePx: 256, mvtExtent: 4096 });
      const coords = [
        [4, 4],
        [132, 132],
        [260, 260],
      ];

      const result = transformCoordinates(coords, transform);

      expect(result).toEqual([
        [0, 0],
        [2048, 2048],
        [4096, 4096],
      ]);
    });
  });

  describe('transformLineString', () => {
    it('should transform LineString coordinates preserving properties', () => {
      const feature = lineString(
        [
          [4, 4],
          [132, 132],
          [260, 260],
        ],
        { level: 100 }
      );

      const result = transformLineString(feature, {
        bufferPx: 4,
        tileSizePx: 256,
        mvtExtent: 4096,
      });

      expect(result.geometry.coordinates).toEqual([
        [0, 0],
        [2048, 2048],
        [4096, 4096],
      ]);
      expect(result.properties).toEqual({ level: 100 });
    });
  });

  describe('transformPolygon', () => {
    it('should transform Polygon coordinates including holes', () => {
      const feature = polygon(
        [
          // Exterior ring
          [
            [4, 4],
            [260, 4],
            [260, 260],
            [4, 260],
            [4, 4],
          ],
          // Hole
          [
            [68, 68],
            [196, 68],
            [196, 196],
            [68, 196],
            [68, 68],
          ],
        ],
        { level: 200 }
      );

      const result = transformPolygon(feature, {
        bufferPx: 4,
        tileSizePx: 256,
        mvtExtent: 4096,
      });

      // Exterior ring
      expect(result.geometry.coordinates[0]).toEqual([
        [0, 0],
        [4096, 0],
        [4096, 4096],
        [0, 4096],
        [0, 0],
      ]);

      // Hole
      expect(result.geometry.coordinates[1]).toEqual([
        [1024, 1024],
        [3072, 1024],
        [3072, 3072],
        [1024, 3072],
        [1024, 1024],
      ]);

      expect(result.properties).toEqual({ level: 200 });
    });
  });

  describe('transformFeature', () => {
    it('should transform LineString feature', () => {
      const feature = lineString([[4, 4], [132, 132]], { level: 100 });
      const result = transformFeature(feature, { bufferPx: 4, tileSizePx: 256, mvtExtent: 4096 });

      expect(result.geometry.type).toBe('LineString');
      expect(result.geometry.coordinates).toEqual([[0, 0], [2048, 2048]]);
    });

    it('should transform Polygon feature', () => {
      const feature = polygon([[[4, 4], [260, 4], [260, 260], [4, 260], [4, 4]]], { level: 200 });
      const result = transformFeature(feature, { bufferPx: 4, tileSizePx: 256, mvtExtent: 4096 });

      expect(result.geometry.type).toBe('Polygon');
    });
  });

  describe('transformFeatures', () => {
    it('should transform array of mixed features', () => {
      const features = [
        lineString([[4, 4], [132, 132]], { level: 100 }),
        polygon([[[4, 4], [260, 4], [260, 260], [4, 260], [4, 4]]], { level: 200 }),
      ];

      const result = transformFeatures(features, { bufferPx: 4, tileSizePx: 256, mvtExtent: 4096 });

      expect(result).toHaveLength(2);
      expect(result[0].geometry.type).toBe('LineString');
      expect(result[1].geometry.type).toBe('Polygon');
    });
  });

  describe('transformAndClipFeatures (LineString clipping)', () => {
    const config = { bufferPx: 4, tileSizePx: 256, mvtExtent: 4096 };

    it('should keep line entirely inside tile', () => {
      // Line from (4,4) to (260,260) in buffered coords = (0,0) to (4096,4096) in MVT
      const feature = lineString([[4, 4], [132, 132], [260, 260]], { level: 100 });
      const result = transformAndClipFeatures([feature], config);

      expect(result).toHaveLength(1);
      expect(result[0].geometry.coordinates).toEqual([[0, 0], [2048, 2048], [4096, 4096]]);
    });

    it('should clip line that exits tile boundary', () => {
      // Line that extends beyond right edge (past MVT extent 4096)
      // (132, 132) -> (2048, 2048) in MVT, (300, 132) -> (4736, 2048) which is outside
      const feature = lineString([[132, 132], [300, 132]], { level: 100 });
      const result = transformAndClipFeatures([feature], config);

      expect(result).toHaveLength(1);
      // Should be clipped at x=4096
      const coords = result[0].geometry.coordinates;
      expect(coords[0]).toEqual([2048, 2048]);
      expect(coords[coords.length - 1][0]).toBe(4096); // Clipped at right edge
    });

    it('should clip line that enters tile from outside', () => {
      // Line from outside (left of tile) entering the tile
      // (0, 132) -> (-64, 2048) in MVT, (132, 132) -> (2048, 2048) in MVT
      const feature = lineString([[0, 132], [132, 132]], { level: 100 });
      const result = transformAndClipFeatures([feature], config);

      expect(result).toHaveLength(1);
      // First point should be clipped at x=0
      expect(result[0].geometry.coordinates[0][0]).toBe(0);
    });

    it('should produce multiple segments for line exiting and re-entering', () => {
      // Line that goes outside top, then re-enters
      // This creates two segments
      const feature = lineString([
        [68, 68],   // Inside: (1024, 1024)
        [68, 0],    // Outside top: (1024, -64)
        [132, 0],   // Outside top: (2048, -64)
        [132, 68],  // Inside: (2048, 1024)
      ], { level: 100 });
      const result = transformAndClipFeatures([feature], config);

      // Should produce 2 segments
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('should skip lines entirely outside the tile', () => {
      // Line entirely outside the tile (above it)
      const feature = lineString([[0, 0], [4, 0]], { level: 100 }); // Both points in buffer zone
      const result = transformAndClipFeatures([feature], config);

      // Line transforms to ((-64, -64), (0, -64)) which is outside y >= 0
      // Should either be empty or have no valid segments
      expect(result.length).toBeLessThanOrEqual(1);
    });

    it('should filter out Polygon features (only processes LineStrings)', () => {
      const features = [
        lineString([[4, 4], [260, 260]], { level: 100 }),
        polygon([[[4, 4], [260, 4], [260, 260], [4, 260], [4, 4]]], { level: 200 }) as any,
      ];
      const result = transformAndClipFeatures(features, config);

      // Should only include the LineString
      expect(result).toHaveLength(1);
      expect(result[0].properties?.level).toBe(100);
    });

    it('should preserve properties through clipping', () => {
      const feature = lineString([[4, 4], [260, 260]], { level: 500, index: true });
      const result = transformAndClipFeatures([feature], config);

      expect(result[0].properties).toEqual({ level: 500, index: true });
    });
  });

  describe('transformAndClipPolygonFeatures (Polygon clipping)', () => {
    const config = { bufferPx: 4, tileSizePx: 256, mvtExtent: 4096 };

    it('should keep polygon entirely inside tile', () => {
      const feature = polygon([
        [[68, 68], [196, 68], [196, 196], [68, 196], [68, 68]]
      ], { level: 200 });
      const result = transformAndClipPolygonFeatures([feature], config);

      expect(result).toHaveLength(1);
      // Coordinates should be scaled to MVT extent
      const coords = result[0].geometry.coordinates[0];
      expect(coords[0]).toEqual([1024, 1024]);
    });

    it('should clip polygon extending beyond tile boundary', () => {
      // Polygon that extends beyond right edge
      const feature = polygon([
        [[132, 68], [300, 68], [300, 196], [132, 196], [132, 68]]
      ], { level: 200 });
      const result = transformAndClipPolygonFeatures([feature], config);

      expect(result).toHaveLength(1);
      // All x coordinates should be <= 4096
      for (const coord of result[0].geometry.coordinates[0]) {
        expect(coord[0]).toBeLessThanOrEqual(4096);
      }
    });

    it('should handle polygon with holes', () => {
      const feature = polygon([
        // Exterior ring (covers whole tile area)
        [[4, 4], [260, 4], [260, 260], [4, 260], [4, 4]],
        // Hole in the middle
        [[68, 68], [196, 68], [196, 196], [68, 196], [68, 68]]
      ], { level: 300 });
      const result = transformAndClipPolygonFeatures([feature], config);

      expect(result).toHaveLength(1);
      expect(result[0].geometry.coordinates).toHaveLength(2); // Exterior + hole
    });

    it('should ensure ring closure after clipping', () => {
      const feature = polygon([
        [[68, 68], [300, 68], [300, 196], [68, 196], [68, 68]]
      ], { level: 200 });
      const result = transformAndClipPolygonFeatures([feature], config);

      const ring = result[0].geometry.coordinates[0];
      const first = ring[0];
      const last = ring[ring.length - 1];
      expect(first[0]).toBe(last[0]);
      expect(first[1]).toBe(last[1]);
    });

    it('should drop polygons that become too small after clipping', () => {
      // Polygon entirely in buffer zone (transforms to negative coords)
      const feature = polygon([
        [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]
      ], { level: 100 });
      const result = transformAndClipPolygonFeatures([feature], config);

      // Should be empty because polygon is entirely outside tile bounds
      expect(result).toHaveLength(0);
    });

    it('should preserve properties through clipping', () => {
      const feature = polygon([
        [[68, 68], [196, 68], [196, 196], [68, 196], [68, 68]]
      ], { level: 400, index: false });
      const result = transformAndClipPolygonFeatures([feature], config);

      expect(result[0].properties).toEqual({ level: 400, index: false });
    });
  });
});
