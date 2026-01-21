/**
 * Hillshade tile endpoint.
 * Generates vector tile polygons representing shade bands from DEM data.
 *
 * Produces two sets of nested polygons:
 * - Shadow polygons: darker areas nested inside, shade 0-0.5
 * - Highlight polygons: brighter areas nested inside, shade 0.5-1
 *
 * Flat terrain (baseline) has shade = 0.5, allowing symmetric
 * accumulation of black (shadows) and white (highlights) overlays.
 */

import type { Feature, Polygon } from 'geojson';
import { hillshade, getResolution, tracePolygons } from '../../lib/dem';
import {
  generateLevels,
  getHillshadeInterval,
  getHillshadeBaseline,
  MIN_LUMINANCE,
  MAX_LUMINANCE,
  DEFAULT_SUN_ALTITUDE,
  DEFAULT_SUN_AZIMUTH,
} from '../../lib/tiles/types';
import { createTileHandler, type ProcessResult } from '../tile-handler';

/**
 * Processes elevation grid into hillshade polygon features.
 *
 * Creates two polygon sets with opposite nesting:
 * - Shadows: traced on inverted data so darker areas are nested inside
 * - Highlights: traced normally so brighter areas are nested inside
 *
 * Shade values are normalized: 0 = darkest, 0.5 = flat terrain, 1 = brightest
 */
function processHillshade(
  grid: Float64Array,
  width: number,
  height: number,
  zoom: number
): ProcessResult {
  // Calculate ground resolution for proper hillshade gradient
  const cellSize = getResolution(zoom);

  // Calculate hillshade values using Lambertian reflectance
  const hillshadeGrid = hillshade(grid, width, height, cellSize, {
    altitude: DEFAULT_SUN_ALTITUDE,
    azimuth: DEFAULT_SUN_AZIMUTH,
  });

  // Baseline: luminance value for flat terrain (~180 for 45° sun)
  const baseline = getHillshadeBaseline(DEFAULT_SUN_ALTITUDE);
  const interval = getHillshadeInterval(zoom);

  // Generate levels for highlights (baseline to max) and shadows (min to baseline)
  const highlightLevels = generateLevels(baseline, MAX_LUMINANCE, interval);
  const shadowOriginalLevels = generateLevels(MIN_LUMINANCE, baseline, interval);

  // Invert shadow levels for tracing (to get proper nesting)
  // Tracing inverted data at level X captures areas where original <= (255-X)
  const shadowInvertedLevels = shadowOriginalLevels.map(l => 255 - l);

  // Create inverted hillshade data for shadow tracing
  const invertedData = new Float64Array(hillshadeGrid.data.length);
  for (let i = 0; i < hillshadeGrid.data.length; i++) {
    invertedData[i] = 255 - hillshadeGrid.data[i];
  }

  // Trace highlight polygons (normal data, brighter areas nested inside)
  const highlightPolygons = tracePolygons(
    hillshadeGrid.data,
    width,
    height,
    highlightLevels
  );

  // Trace shadow polygons (inverted data, darker areas nested inside)
  const shadowPolygons = tracePolygons(
    invertedData,
    width,
    height,
    shadowInvertedLevels
  );

  // Normalize highlight features: shade = 0.5 to 1.0
  const highlightFeatures = highlightPolygons.map((feature) => {
    const level = feature.properties?.level ?? baseline;
    const shade = 0.5 + ((level - baseline) / (255 - baseline)) * 0.5;
    return {
      ...feature,
      properties: { level, shade },
    } as Feature<Polygon>;
  });

  // Normalize shadow features: shade = 0 to 0.5
  // Convert inverted level back to original for the level property
  const shadowFeatures = shadowPolygons.map((feature) => {
    const invertedLevel = feature.properties?.level ?? 255;
    const originalLevel = 255 - invertedLevel;
    const shade = (originalLevel / baseline) * 0.5;
    return {
      ...feature,
      properties: { level: originalLevel, shade },
    } as Feature<Polygon>;
  });

  // Combine: shadows first (bottom), then highlights (top)
  const features = [...shadowFeatures, ...highlightFeatures];

  return { features, geometryType: 'Polygon' };
}

/**
 * Handler for hillshade tile requests
 * GET /tiles/hillshade/:z/:x/:y.mvt
 */
export const hillshadeHandler = createTileHandler({
  cachePrefix: 'hillshade',
  layerName: 'hillshade',
  process: processHillshade,
});
