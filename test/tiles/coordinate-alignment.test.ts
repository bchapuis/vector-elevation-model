/**
 * Coordinate Alignment Test
 *
 * Verifies that the 2×2 corner-aligned approach samples from the
 * same geographic locations as the original 3×3 approach.
 */

import { describe, it, expect } from 'vitest';

const TILE_SIZE = 256;
const SOURCE_TILE_SIZE = 512;

/**
 * Simulates the 3×3 sampling formula (original approach)
 * Canvas layout: [topLeft][top][topRight]
 *                [left][CENTER][right]
 *                [bottomLeft][bottom][bottomRight]
 * Center tile is at offset (512, 512)
 */
function sample3x3(tileX: number, tileY: number): { srcX: number; srcY: number; tile: string } {
  const scale = SOURCE_TILE_SIZE / TILE_SIZE; // 2
  const s = SOURCE_TILE_SIZE; // 512

  const srcX = s + Math.floor((tileX + 0.5) * scale);
  const srcY = s + Math.floor((tileY + 0.5) * scale);

  // Determine which tile in the 3×3 grid
  const tileCol = Math.floor(srcX / s); // 0=left, 1=center, 2=right
  const tileRow = Math.floor(srcY / s); // 0=top, 1=center, 2=bottom

  const tiles = [
    ['topLeft', 'top', 'topRight'],
    ['left', 'CENTER', 'right'],
    ['bottomLeft', 'bottom', 'bottomRight'],
  ];

  return { srcX, srcY, tile: tiles[tileRow][tileCol] };
}

/**
 * Simulates the 2×2 sampling formula (centered on tile C approach)
 * Canvas layout: [CENTER][right]
 *                [bottom][bottomRight]
 * Center tile is at offset (0, 0)
 */
function sample2x2(tileX: number, tileY: number): { srcX: number; srcY: number; tile: string } {
  const scale = SOURCE_TILE_SIZE / TILE_SIZE; // 2
  const canvasSize = SOURCE_TILE_SIZE * 2; // 1024

  // Centered on tile C (no offset)
  let srcX = Math.floor((tileX + 0.5) * scale);
  let srcY = Math.floor((tileY + 0.5) * scale);

  // Clamp to canvas bounds (left/top buffer clamps to 0)
  srcX = Math.max(0, Math.min(canvasSize - 1, srcX));
  srcY = Math.max(0, Math.min(canvasSize - 1, srcY));

  // Determine which tile in the 2×2 grid
  const tileCol = Math.floor(srcX / SOURCE_TILE_SIZE); // 0=center, 1=right
  const tileRow = Math.floor(srcY / SOURCE_TILE_SIZE); // 0=center, 1=bottom

  const tiles = [
    ['CENTER', 'right'],
    ['bottom', 'bottomRight'],
  ];

  return { srcX, srcY, tile: tiles[tileRow][tileCol] };
}

/**
 * Converts stitched canvas coordinates to coordinates within the CENTER tile.
 * This represents the "ground truth" geographic location.
 */
function toLocalCenterCoord3x3(srcX: number, srcY: number): { localX: number; localY: number } {
  // In 3×3, center tile starts at (512, 512)
  return { localX: srcX - 512, localY: srcY - 512 };
}

function toLocalCenterCoord2x2(srcX: number, srcY: number): { localX: number; localY: number } {
  // In 2×2, center tile starts at (0, 0)
  return { localX: srcX, localY: srcY };
}

describe('Coordinate Alignment Analysis', () => {
  describe('sampling location comparison', () => {
    it('should show where each approach samples for key output coordinates', () => {
      const testPoints = [
        { name: 'tile start', tileX: 0, tileY: 0 },
        { name: 'tile center', tileX: 128, tileY: 128 },
        { name: 'tile end', tileX: 255, tileY: 255 },
        { name: 'left buffer', tileX: -8, tileY: 0 },
        { name: 'right buffer', tileX: 263, tileY: 0 },
      ];

      console.log('\n=== Sampling Location Comparison ===');
      console.log('tileX/Y = output coordinate relative to tile (0-255), negative/excess = buffer\n');

      for (const point of testPoints) {
        const s3x3 = sample3x3(point.tileX, point.tileY);
        const s2x2 = sample2x2(point.tileX, point.tileY);

        const local3x3 = toLocalCenterCoord3x3(s3x3.srcX, s3x3.srcY);
        const local2x2 = toLocalCenterCoord2x2(s2x2.srcX, s2x2.srcY);

        console.log(`${point.name} (tileX=${point.tileX}, tileY=${point.tileY}):`);
        console.log(`  3×3: srcX=${s3x3.srcX}, srcY=${s3x3.srcY} in [${s3x3.tile}]`);
        console.log(`       local to CENTER: (${local3x3.localX}, ${local3x3.localY})`);
        console.log(`  2×2: srcX=${s2x2.srcX}, srcY=${s2x2.srcY} in [${s2x2.tile}]`);
        console.log(`       local to CENTER: (${local2x2.localX}, ${local2x2.localY})`);

        // Check if they sample from the same location in the CENTER tile
        if (s3x3.tile === 'CENTER' && s2x2.tile === 'CENTER') {
          const offsetX = local2x2.localX - local3x3.localX;
          const offsetY = local2x2.localY - local3x3.localY;
          console.log(`  OFFSET: (${offsetX}, ${offsetY}) source pixels`);
        }
        console.log('');
      }
    });

    it('should verify geographic alignment between 3×3 and 2×2 approaches', () => {
      // For the tile center (output coordinate 128), where does each approach sample?
      const s3x3 = sample3x3(128, 128);
      const s2x2 = sample2x2(128, 128);

      const local3x3 = toLocalCenterCoord3x3(s3x3.srcX, s3x3.srcY);
      const local2x2 = toLocalCenterCoord2x2(s2x2.srcX, s2x2.srcY);

      console.log('\n=== Geographic Alignment Verification ===');
      console.log(`Output tile center (128, 128):`);
      console.log(`  3×3 samples from CENTER tile at local (${local3x3.localX}, ${local3x3.localY})`);
      console.log(`  2×2 samples from CENTER tile at local (${local2x2.localX}, ${local2x2.localY})`);

      // The offset in source pixels (should be 0 with corrected formula)
      const offsetSourcePx = local2x2.localX - local3x3.localX;
      console.log(`  Source pixel offset: ${offsetSourcePx} px`);

      if (offsetSourcePx === 0) {
        console.log(`\n  ✓ Geographic alignment is correct!`);
      } else {
        console.log(`\n  ⚠️  WARNING: ${offsetSourcePx}px offset detected!`);
      }

      // With corrected formula, both should sample from the same location
      expect(offsetSourcePx).toBe(0);
      expect(local3x3.localX).toBe(local2x2.localX);
      expect(local3x3.localY).toBe(local2x2.localY);
    });

    it('should verify left/top buffer is clamped in 2×2 approach', () => {
      // Left buffer (tileX = -8) should clamp to 0 in 2×2
      const s3x3 = sample3x3(-8, 0);
      const s2x2 = sample2x2(-8, 0);

      console.log('\n=== Buffer Behavior Comparison ===');
      console.log(`Left buffer (tileX=-8):`);
      console.log(`  3×3: srcX=${s3x3.srcX} in [${s3x3.tile}] - has left neighbor data`);
      console.log(`  2×2: srcX=${s2x2.srcX} in [${s2x2.tile}] - clamped to edge`);

      // 3×3 can sample from left neighbor (srcX < 512)
      expect(s3x3.srcX).toBeLessThan(512);
      expect(s3x3.tile).toBe('left');

      // 2×2 clamps to 0 (edge of center tile)
      expect(s2x2.srcX).toBe(0);
      expect(s2x2.tile).toBe('CENTER');
    });

    it('should verify right/bottom buffer works in 2×2 approach', () => {
      // Right buffer (tileX = 263) should extend into right tile
      const s3x3 = sample3x3(263, 0);
      const s2x2 = sample2x2(263, 0);

      console.log('\n=== Right Buffer Comparison ===');
      console.log(`Right buffer (tileX=263):`);
      console.log(`  3×3: srcX=${s3x3.srcX} in [${s3x3.tile}]`);
      console.log(`  2×2: srcX=${s2x2.srcX} in [${s2x2.tile}]`);

      // Both should sample from right neighbor
      expect(s3x3.tile).toBe('right');
      expect(s2x2.tile).toBe('right');

      // Both should sample from same relative position in right tile
      const local3x3InRight = s3x3.srcX - 1024; // Right tile starts at 1024 in 3×3
      const local2x2InRight = s2x2.srcX - 512;  // Right tile starts at 512 in 2×2
      expect(local3x3InRight).toBe(local2x2InRight);
    });
  });

  describe('2×2 centered approach summary', () => {
    it('should document the trade-offs of the 2×2 centered approach', () => {
      console.log('\n=== 2×2 Centered Approach Summary ===');
      console.log('');
      console.log('Benefits:');
      console.log('  ✓ Fetches only 4 tiles instead of 9 (56% reduction)');
      console.log('  ✓ Single Promise.all() batch (faster network)');
      console.log('  ✓ 55% less memory for stitched canvas');
      console.log('  ✓ Correct geographic alignment maintained');
      console.log('');
      console.log('Trade-offs:');
      console.log('  - Left buffer: clamped to tile edge (no neighbor data)');
      console.log('  - Top buffer: clamped to tile edge (no neighbor data)');
      console.log('  - Right buffer: ✓ has neighbor data from R tile');
      console.log('  - Bottom buffer: ✓ has neighbor data from B tile');
      console.log('');
      console.log('Impact on algorithms:');
      console.log('  - Contours at left/top edges may have slight discontinuities');
      console.log('  - Hillshade at left/top edges may have edge artifacts');
      console.log('  - Same behavior as tiles at world boundary (x=0, y=0)');
      console.log('');
      console.log('This is acceptable because:');
      console.log('  - Buffer is small (8px) relative to tile size (256px)');
      console.log('  - Edge artifacts are typically not noticeable');
      console.log('  - Performance gain outweighs minor visual impact');
    });
  });
});

