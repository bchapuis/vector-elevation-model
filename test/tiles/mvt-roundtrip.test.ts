/**
 * MVT Encoding/Decoding roundtrip tests
 * Verifies that our MVT encoding produces valid tiles that can be decoded
 */

import { describe, it, expect } from 'vitest';
import { lineString } from '@turf/helpers';
import type { Feature, LineString } from 'geojson';
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';

import { encodeFeatures, getMvtHeaders } from '../../src/lib/tiles/encoder';
import { MVT_EXTENT } from '../../src/lib/tiles/types';

describe('encodeFeatures', () => {
  it('produces decodable MVT', () => {
    const features: Feature<LineString>[] = [
      lineString([[0, 0], [2048, 2048], [4096, 4096]], { level: 100, index: true }),
    ];

    const mvtBytes = encodeFeatures(features, {
      layerName: 'contour',
      extent: MVT_EXTENT,
      compress: false,
    });

    // Try to decode
    const pbf = new Pbf(mvtBytes);
    const tile = new VectorTile(pbf);

    console.log('Layers in tile:', Object.keys(tile.layers));

    expect(tile.layers['contour']).toBeDefined();

    const layer = tile.layers['contour'];
    console.log('Layer extent:', layer.extent);
    console.log('Layer length (features):', layer.length);

    expect(layer.length).toBe(1);

    const feature = layer.feature(0);
    console.log('Feature type:', feature.type);
    console.log('Feature properties:', feature.properties);

    expect(feature.type).toBe(2); // LineString
    expect(feature.properties.level).toBe(100);
    expect(feature.properties.index).toBe(true);

    // Get geometry
    const geom = feature.loadGeometry();
    console.log('Geometry rings:', geom.length);
    console.log('First ring points:', geom[0]?.length);
    console.log('First 3 points:', geom[0]?.slice(0, 3).map(p => ({ x: p.x, y: p.y })));

    expect(geom.length).toBe(1); // One line
    expect(geom[0].length).toBe(3); // 3 points

    // Check coordinates
    expect(geom[0][0].x).toBe(0);
    expect(geom[0][0].y).toBe(0);
    expect(geom[0][1].x).toBe(2048);
    expect(geom[0][1].y).toBe(2048);
    expect(geom[0][2].x).toBe(4096);
    expect(geom[0][2].y).toBe(4096);
  });

  it('handles multiple features', () => {
    const features: Feature<LineString>[] = [
      lineString([[0, 0], [1000, 1000]], { level: 100, index: false }),
      lineString([[2000, 2000], [4096, 4096]], { level: 200, index: false }),
      lineString([[0, 2048], [4096, 2048]], { level: 500, index: true }),
    ];

    const mvtBytes = encodeFeatures(features, {
      layerName: 'contour',
      extent: MVT_EXTENT,
      compress: false,
    });

    const pbf = new Pbf(mvtBytes);
    const tile = new VectorTile(pbf);
    const layer = tile.layers['contour'];

    console.log('Features in layer:', layer.length);
    expect(layer.length).toBe(3);

    // Check each feature
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      console.log(`Feature ${i}: type=${feature.type}, level=${feature.properties.level}`);
      expect(feature.type).toBe(2);
    }
  });

  it('preserves coordinates correctly', () => {
    // Test with coordinates similar to actual contours
    const features: Feature<LineString>[] = [
      lineString([
        [100, 200],
        [150, 250],
        [200, 300],
        [250, 350],
        [300, 400],
      ], { level: 700, index: false }),
    ];

    const mvtBytes = encodeFeatures(features, {
      layerName: 'contour',
      extent: MVT_EXTENT,
      compress: false,
    });

    const pbf = new Pbf(mvtBytes);
    const tile = new VectorTile(pbf);
    const layer = tile.layers['contour'];
    const feature = layer.feature(0);
    const geom = feature.loadGeometry();

    console.log('Coords:', geom[0].map(p => [p.x, p.y]));

    expect(geom[0][0].x).toBe(100);
    expect(geom[0][0].y).toBe(200);
    expect(geom[0][4].x).toBe(300);
    expect(geom[0][4].y).toBe(400);
  });
});

describe('getMvtHeaders', () => {
  it('returns compressed headers by default', () => {
    const headers = getMvtHeaders();

    expect(headers['Content-Type']).toBe('application/vnd.mapbox-vector-tile');
    expect(headers['Cache-Control']).toBe('public, max-age=3600');
    expect(headers['Content-Encoding']).toBe('gzip');
  });

  it('returns compressed headers when explicitly true', () => {
    const headers = getMvtHeaders(true);

    expect(headers['Content-Encoding']).toBe('gzip');
  });

  it('excludes Content-Encoding when uncompressed', () => {
    const headers = getMvtHeaders(false);

    expect(headers['Content-Type']).toBe('application/vnd.mapbox-vector-tile');
    expect(headers['Cache-Control']).toBe('public, max-age=3600');
    expect(headers['Content-Encoding']).toBeUndefined();
  });
});
