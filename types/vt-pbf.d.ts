declare module 'vt-pbf' {
  interface GeojsonVtTile {
    features: Array<{
      id?: number | string;
      type: number;
      geometry: number[][][] | number[][];
      tags?: Record<string, unknown>;
    }>;
    numPoints?: number;
    numSimplified?: number;
    numFeatures?: number;
    source?: unknown;
    x?: number;
    y?: number;
    z?: number;
    transformed?: boolean;
    minX?: number;
    minY?: number;
    maxX?: number;
    maxY?: number;
  }

  interface Options {
    version?: number;
    extent?: number;
  }

  function vtpbf(tile: unknown): Uint8Array;

  namespace vtpbf {
    function fromGeojsonVt(
      layers: Record<string, GeojsonVtTile | null>,
      options?: Options
    ): Uint8Array;
  }

  export = vtpbf;
}
