/**
 * Test that decodes an actual MVT tile from the server
 * Run with: npx vitest run test/tiles/decode-server-tile.test.ts
 */

import { describe, it, expect } from 'vitest';
import Pbf from 'pbf';
import pako from 'pako';
import { VectorTile } from '@mapbox/vector-tile';

describe('Decode Server MVT Tile', () => {
  it('decodes tile from localhost', async () => {
    // Skip if server isn't running
    const url = 'http://localhost:5173/tiles/contour/12/2136/1441.mvt';

    let response;
    try {
      response = await fetch(url);
    } catch (e) {
      console.log('Server not running, skipping test');
      return;
    }

    expect(response.ok).toBe(true);

    const buffer = await response.arrayBuffer();
    console.log('MVT size:', buffer.byteLength, 'bytes');

    // Decompress if gzip compressed (tiles are now served compressed)
    // Check for gzip magic bytes (0x1f 0x8b) since Content-Encoding may be stripped
    let data = new Uint8Array(buffer);
    const isGzipped = data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
    if (isGzipped) {
      data = pako.ungzip(data);
      console.log('Decompressed size:', data.byteLength, 'bytes');
    }

    const pbf = new Pbf(data);
    const tile = new VectorTile(pbf);

    console.log('Layers:', Object.keys(tile.layers));

    const layer = tile.layers['contour'];
    expect(layer).toBeDefined();

    console.log('Layer name:', layer.name);
    console.log('Layer extent:', layer.extent);
    console.log('Feature count:', layer.length);

    if (layer.length > 0) {
      // Inspect first few features
      for (let i = 0; i < Math.min(3, layer.length); i++) {
        const feature = layer.feature(i);
        console.log(`\nFeature ${i}:`);
        console.log('  Type:', feature.type, '(1=Point, 2=Line, 3=Polygon)');
        console.log('  Properties:', feature.properties);

        const geom = feature.loadGeometry();
        console.log('  Geometry rings:', geom.length);

        if (geom.length > 0) {
          console.log('  Points in first ring:', geom[0].length);
          console.log('  First 5 points:', geom[0].slice(0, 5).map(p => ({ x: p.x, y: p.y })));

          // Check coordinate ranges
          const xs = geom[0].map(p => p.x);
          const ys = geom[0].map(p => p.y);
          console.log('  X range:', Math.min(...xs), 'to', Math.max(...xs));
          console.log('  Y range:', Math.min(...ys), 'to', Math.max(...ys));
        }
      }
    }

    // Basic assertions
    expect(layer.extent).toBe(4096);
    expect(layer.length).toBeGreaterThan(0);
  });
});
