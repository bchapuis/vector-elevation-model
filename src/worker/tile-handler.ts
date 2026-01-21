/**
 * Factory for creating tile handlers with common boilerplate extracted.
 *
 * Handles: parameter parsing, validation, caching, tile fetching, and response construction.
 * Handlers only need to define their unique processing logic.
 */

import type { Context } from 'hono';
import type { Feature, LineString, Polygon } from 'geojson';
import {
  type TileCoord,
  TILE_SIZE,
  MVT_EXTENT,
  BUFFER_PX,
  DEFAULT_TILE_URL,
  CACHE_VERSION,
  DEFAULT_CACHE_TTL,
} from '../lib/tiles/types';
import { TileFetcher } from '../lib/tiles/fetcher';
import { transformAndClipFeatures, transformAndClipPolygonFeatures } from '../lib/tiles/coordinate-transform';
import { encodeFeatures, getMvtHeaders } from '../lib/tiles/encoder';

// Cached tile fetcher with URL tracking for invalidation.
// Reusing a single fetcher instance across requests avoids repeated initialization
// overhead. The fetcher is stateless aside from its URL template, so sharing is
// safe for concurrent requests. We track the URL to recreate the fetcher if it changes.
let tileFetcher: TileFetcher | null = null;
let tileFetcherUrl: string | null = null;

function getTileFetcher(env: Env): TileFetcher {
  const url = (env as Record<string, string>).DEM_TILE_URL ?? DEFAULT_TILE_URL;
  if (!tileFetcher || tileFetcherUrl !== url) {
    tileFetcher = new TileFetcher(url);
    tileFetcherUrl = url;
  }
  return tileFetcher;
}

/**
 * Parses tile coordinates from Hono context parameters.
 * Returns null if coordinates are invalid.
 */
function parseTileCoords(c: Context): TileCoord | null {
  const z = parseInt(c.req.param('z') ?? '', 10);
  const x = parseInt(c.req.param('x') ?? '', 10);
  const yParam = c.req.param('y') ?? '';
  const y = parseInt(yParam.replace(/\.mvt$/i, ''), 10);

  if (isNaN(z) || isNaN(x) || isNaN(y) || z < 0 || z > 22) {
    return null;
  }

  const maxTile = Math.pow(2, z) - 1;
  if (x < 0 || x > maxTile || y < 0 || y > maxTile) {
    return null;
  }

  return { z, x, y };
}

/**
 * Result from processing grid data into features
 */
export interface ProcessResult {
  features: Feature<LineString | Polygon>[];
  geometryType: 'LineString' | 'Polygon';
}

/**
 * Configuration for a tile handler
 */
export interface TileHandlerConfig {
  /** Cache key prefix (e.g., 'contour', 'hillshade') */
  cachePrefix: string;

  /** MVT layer name */
  layerName: string;

  /**
   * Process grid data into features.
   * This is where the unique handler logic lives.
   */
  process: (
    grid: Float64Array,
    width: number,
    height: number,
    zoom: number
  ) => ProcessResult;
}

/**
 * Creates a tile handler with all common operations extracted.
 *
 * The factory handles:
 * - Parameter parsing and validation
 * - Cache lookup and storage
 * - Tile fetching with buffer
 * - Coordinate transformation and clipping
 * - MVT encoding and response construction
 * - Error handling
 */
export function createTileHandler(config: TileHandlerConfig) {
  const { cachePrefix, layerName, process } = config;

  return async function handler(c: Context): Promise<Response> {
    const coord = parseTileCoords(c);
    if (!coord) {
      return c.json({ error: 'Invalid tile coordinates' }, 400);
    }

    const { z, x, y } = coord;
    const env = c.env as Record<string, string>;

    // Cache can be disabled for development
    const cacheEnabled = env.CACHE_ENABLED !== 'false';

    try {
      // Check cache (versioned key allows invalidation when algorithms change)
      const cacheKey = new Request(`https://cache/${CACHE_VERSION}/${cachePrefix}/${z}/${x}/${y}.mvt`);
      const cache = caches.default;

      if (cacheEnabled) {
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) {
          return cachedResponse;
        }
      }

      // Fetch elevation data with buffer
      const fetcher = getTileFetcher(c.env as Env);
      const { grid, width, height } = await fetcher.fetchTile(coord, BUFFER_PX);

      // Process grid into features - this is the handler-specific logic
      const { features, geometryType } = process(grid, width, height, z);

      // Transform to MVT coordinates and clip to tile extent
      const transformConfig = {
        bufferPx: BUFFER_PX,
        tileSizePx: TILE_SIZE,
        mvtExtent: MVT_EXTENT,
      };

      const transformed = geometryType === 'Polygon'
        ? transformAndClipPolygonFeatures(features as Feature<Polygon>[], transformConfig)
        : transformAndClipFeatures(features as Feature<LineString | Polygon>[], transformConfig);

      // Compress unless explicitly disabled (useful for local dev where Miniflare mangles Content-Encoding)
      const compress = env.COMPRESSION_ENABLED !== 'false';

      // Encode to MVT format
      const mvtData = encodeFeatures(transformed, {
        layerName,
        extent: MVT_EXTENT,
        compress,
      });

      // Cache TTL from environment variable or default (1 day)
      const cacheTTL = parseInt(env.CACHE_TTL ?? '', 10) || DEFAULT_CACHE_TTL;
      const headers = getMvtHeaders(compress, cacheTTL);
      const response = new Response(mvtData, { headers });

      if (cacheEnabled) {
        c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
      }

      return response;
    } catch (error) {
      console.error(`${cachePrefix} generation error:`, error);
      return c.json({ error: `Failed to generate ${cachePrefix} tile`, details: String(error) }, 500);
    }
  };
}
