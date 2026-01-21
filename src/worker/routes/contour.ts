/**
 * Contour tile endpoint.
 * Generates vector tile contour lines from DEM data.
 */

import type { Feature, LineString } from 'geojson';
import { traceLines } from '../../lib/dem';
import {
  generateLevels,
  getContourInterval,
  MIN_ELEVATION,
  MAX_ELEVATION,
} from '../../lib/tiles/types';
import { createTileHandler, type ProcessResult } from '../tile-handler';

/**
 * Processes elevation grid into contour line features.
 * Every 5th contour is marked as an index contour for emphasized styling.
 */
function processContours(
  grid: Float64Array,
  width: number,
  height: number,
  zoom: number
): ProcessResult {
  const interval = getContourInterval(zoom);
  const levels = generateLevels(MIN_ELEVATION, MAX_ELEVATION, interval);
  const contours = traceLines(grid, width, height, levels);

  // Add index property - every 5th contour is an index contour for map legibility
  const features = contours.map((contour) => {
    const level = contour.properties?.level ?? 0;
    return {
      ...contour,
      properties: {
        ...contour.properties,
        index: level % (interval * 5) === 0,
      },
    } as Feature<LineString>;
  });

  return { features, geometryType: 'LineString' };
}

/**
 * Handler for contour tile requests
 * GET /tiles/contour/:z/:x/:y.mvt
 */
export const contourHandler = createTileHandler({
  cachePrefix: 'contour',
  layerName: 'contour',
  process: processContours,
});
