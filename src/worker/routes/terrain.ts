/**
 * Combined terrain tile endpoint.
 * Generates a single vector tile containing both contour and hillshade layers.
 *
 * This reduces network requests by fetching source elevation data once
 * and producing both layer types in a single MVT response.
 */

import type { Context } from 'hono';
import type { Feature, LineString, Polygon } from 'geojson';
import { traceLines, hillshade, getResolution, tracePolygons } from '../../lib/dem';
import {
  type TileCoord,
  TILE_SIZE,
  MVT_EXTENT,
  BUFFER_PX,
  DEFAULT_TILE_URL,
  CACHE_VERSION,
  DEFAULT_CACHE_TTL,
  generateLevels,
  getContourInterval,
  getHillshadeInterval,
  getHillshadeBaseline,
  MIN_ELEVATION,
  MAX_ELEVATION,
  MIN_LUMINANCE,
  MAX_LUMINANCE,
  DEFAULT_SUN_ALTITUDE,
  DEFAULT_SUN_AZIMUTH,
} from '../../lib/tiles/types';
import { TileFetcher } from '../../lib/tiles/fetcher';
import { transformAndClipFeatures, transformAndClipPolygonFeatures } from '../../lib/tiles/coordinate-transform';
import { encodeMultiLayerFeatures, getMvtHeaders, type LayerDefinition } from '../../lib/tiles/encoder';

// Cached tile fetcher
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
 * Processes elevation grid into contour line features.
 */
function processContours(
  grid: Float64Array,
  width: number,
  height: number,
  zoom: number
): Feature<LineString>[] {
  const interval = getContourInterval(zoom);
  const levels = generateLevels(MIN_ELEVATION, MAX_ELEVATION, interval);
  const contours = traceLines(grid, width, height, levels);

  return contours.map((contour) => {
    const level = contour.properties?.level ?? 0;
    return {
      ...contour,
      properties: {
        ...contour.properties,
        index: level % (interval * 5) === 0,
      },
    } as Feature<LineString>;
  });
}

/**
 * Processes elevation grid into hillshade polygon features.
 */
function processHillshade(
  grid: Float64Array,
  width: number,
  height: number,
  zoom: number
): Feature<Polygon>[] {
  const cellSize = getResolution(zoom);
  const hillshadeGrid = hillshade(grid, width, height, cellSize, {
    altitude: DEFAULT_SUN_ALTITUDE,
    azimuth: DEFAULT_SUN_AZIMUTH,
  });

  const baseline = getHillshadeBaseline(DEFAULT_SUN_ALTITUDE);
  const interval = getHillshadeInterval(zoom);

  const highlightLevels = generateLevels(baseline, MAX_LUMINANCE, interval);
  const shadowOriginalLevels = generateLevels(MIN_LUMINANCE, baseline, interval);
  const shadowInvertedLevels = shadowOriginalLevels.map(l => 255 - l);

  const invertedData = new Float64Array(hillshadeGrid.data.length);
  for (let i = 0; i < hillshadeGrid.data.length; i++) {
    invertedData[i] = 255 - hillshadeGrid.data[i];
  }

  const highlightPolygons = tracePolygons(hillshadeGrid.data, width, height, highlightLevels);
  const shadowPolygons = tracePolygons(invertedData, width, height, shadowInvertedLevels);

  const highlightFeatures = highlightPolygons.map((feature) => {
    const level = feature.properties?.level ?? baseline;
    const shade = 0.5 + ((level - baseline) / (255 - baseline)) * 0.5;
    return { ...feature, properties: { level, shade } } as Feature<Polygon>;
  });

  const shadowFeatures = shadowPolygons.map((feature) => {
    const invertedLevel = feature.properties?.level ?? 255;
    const originalLevel = 255 - invertedLevel;
    const shade = (originalLevel / baseline) * 0.5;
    return { ...feature, properties: { level: originalLevel, shade } } as Feature<Polygon>;
  });

  return [...shadowFeatures, ...highlightFeatures];
}

/**
 * Handler for combined terrain tile requests.
 * GET /tiles/terrain/:z/:x/:y.mvt
 *
 * Returns a single MVT containing both 'contour' and 'hillshade' layers.
 */
export async function terrainHandler(c: Context): Promise<Response> {
  const coord = parseTileCoords(c);
  if (!coord) {
    return c.json({ error: 'Invalid tile coordinates' }, 400);
  }

  const { z, x, y } = coord;
  const env = c.env as Record<string, string>;
  const cacheEnabled = env.CACHE_ENABLED !== 'false';

  try {
    // Check cache
    const cacheKey = new Request(`https://cache/${CACHE_VERSION}/terrain/${z}/${x}/${y}.mvt`);
    const cache = caches.default;

    if (cacheEnabled) {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        return cachedResponse;
      }
    }

    // Fetch elevation data once for both layers
    const fetcher = getTileFetcher(c.env as Env);
    const { grid, width, height } = await fetcher.fetchTile(coord, BUFFER_PX);

    // Process both contours and hillshade from the same grid
    const contourFeatures = processContours(grid, width, height, z);
    const hillshadeFeatures = processHillshade(grid, width, height, z);

    // Transform and clip features
    const transformConfig = {
      bufferPx: BUFFER_PX,
      tileSizePx: TILE_SIZE,
      mvtExtent: MVT_EXTENT,
    };

    const transformedContours = transformAndClipFeatures(contourFeatures, transformConfig);
    const transformedHillshade = transformAndClipPolygonFeatures(hillshadeFeatures, transformConfig);

    // Encode both layers into a single MVT
    const compress = env.COMPRESSION_ENABLED !== 'false';
    const layers: LayerDefinition[] = [
      { name: 'hillshade', features: transformedHillshade },
      { name: 'contour', features: transformedContours },
    ];

    const mvtData = encodeMultiLayerFeatures(layers, {
      extent: MVT_EXTENT,
      compress,
    });

    // Create response and cache
    const cacheTTL = parseInt(env.CACHE_TTL ?? '', 10) || DEFAULT_CACHE_TTL;
    const headers = getMvtHeaders(compress, cacheTTL);
    const response = new Response(mvtData, { headers });

    if (cacheEnabled) {
      c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  } catch (error) {
    console.error('terrain generation error:', error);
    return c.json({ error: 'Failed to generate terrain tile', details: String(error) }, 500);
  }
}
