/**
 * Internal grid abstraction for DEM processing.
 *
 * Encapsulates a 2D grid of values (elevations, hillshade intensities, etc.)
 * with dimensions and provides validated access. This pulls validation and
 * bounds-checking complexity down into a single location.
 */

/**
 * A 2D grid of numeric values in row-major order.
 */
export interface Grid {
  readonly data: Float64Array;
  readonly width: number;
  readonly height: number;
}

/**
 * Creates a validated Grid from raw data.
 *
 * @param data Grid values as Float64Array or number array
 * @param width Grid width in cells
 * @param height Grid height in cells
 * @returns Validated Grid instance
 * @throws Error if data is null/empty, dimensions are non-positive, or length doesn't match
 */
export function createGrid(
  data: Float64Array | number[],
  width: number,
  height: number
): Grid {
  if (!data || data.length === 0) {
    throw new Error('Grid data cannot be null or empty');
  }
  if (width <= 0 || height <= 0) {
    throw new Error('Grid dimensions must be positive');
  }
  if (data.length !== width * height) {
    throw new Error(
      `Grid data length (${data.length}) does not match dimensions (${width}x${height}=${width * height})`
    );
  }

  const floatData = data instanceof Float64Array ? data : Float64Array.from(data);
  return { data: floatData, width, height };
}

/**
 * Gets a value from the grid, clamping coordinates to bounds.
 *
 * @param grid Source grid
 * @param x X coordinate (column)
 * @param y Y coordinate (row)
 * @returns Value at the specified position, with out-of-bounds coordinates clamped
 */
export function gridGet(grid: Grid, x: number, y: number): number {
  const clampedX = Math.max(0, Math.min(grid.width - 1, x));
  const clampedY = Math.max(0, Math.min(grid.height - 1, y));
  return grid.data[clampedY * grid.width + clampedX];
}

/**
 * Gets a value at a linear index.
 *
 * @param grid Source grid
 * @param index Linear index into the data array (y * width + x)
 * @returns Value at the specified index
 */
export function gridGetAt(grid: Grid, index: number): number {
  return grid.data[index];
}

/**
 * Maps each cell of a grid to a new value.
 *
 * @param grid Source grid
 * @param fn Transform function receiving (value, x, y) and returning new value
 * @returns New grid with transformed values
 */
export function gridMap(grid: Grid, fn: (value: number, x: number, y: number) => number): Grid {
  const result = new Float64Array(grid.data.length);
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const i = y * grid.width + x;
      result[i] = fn(grid.data[i], x, y);
    }
  }
  return { data: result, width: grid.width, height: grid.height };
}

