# Vector Elevation Model

Generate vector tiles (MVT) from Digital Elevation Model data. Produces contour lines and hillshade polygons on-the-fly from Terrarium-encoded elevation tiles.

![Vector contours and hillshade](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/ec7f4be5-d1d6-4e94-0851-126341745400/preview)

## Features

- **Vector Contours** - Isoline generation using Marching Squares algorithm
- **Vector Hillshade** - Terrain shading as nested polygons for smooth compositing
- **Edge-to-Edge Continuity** - Buffered tile processing ensures seamless boundaries
- **Cloudflare Workers** - Deployed at the edge with built-in caching

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to view the map.

## API Endpoints

### Contour Tiles

```
GET /tiles/contour/{z}/{x}/{y}.mvt
```

Returns LineString features with properties:
- `level` - Elevation in meters
- `index` - Boolean, true for every 5th contour (index contours)

### Hillshade Tiles

```
GET /tiles/hillshade/{z}/{x}/{y}.mvt
```

Returns Polygon features with properties:
- `level` - Luminance value (0-255)
- `shade` - Normalized shade (0=darkest, 0.5=flat, 1=brightest)

## Usage with MapLibre GL

```javascript
const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      contour: {
        type: 'vector',
        tiles: ['https://your-worker.workers.dev/tiles/contour/{z}/{x}/{y}.mvt'],
        maxzoom: 15,
      },
      hillshade: {
        type: 'vector',
        tiles: ['https://your-worker.workers.dev/tiles/hillshade/{z}/{x}/{y}.mvt'],
        maxzoom: 15,
      },
    },
    layers: [
      // Hillshade shadows (darker areas)
      {
        id: 'hillshade-shadow',
        type: 'fill',
        source: 'hillshade',
        'source-layer': 'hillshade',
        filter: ['<', ['get', 'shade'], 0.5],
        paint: {
          'fill-color': '#000',
          'fill-opacity': ['interpolate', ['linear'], ['get', 'shade'], 0, 0.5, 0.5, 0],
        },
      },
      // Hillshade highlights (brighter areas)
      {
        id: 'hillshade-highlight',
        type: 'fill',
        source: 'hillshade',
        'source-layer': 'hillshade',
        filter: ['>=', ['get', 'shade'], 0.5],
        paint: {
          'fill-color': '#fff',
          'fill-opacity': ['interpolate', ['linear'], ['get', 'shade'], 0.5, 0, 1, 0.4],
        },
      },
      // Contour lines
      {
        id: 'contours',
        type: 'line',
        source: 'contour',
        'source-layer': 'contour',
        paint: {
          'line-color': '#5a4d3f',
          'line-width': ['case', ['get', 'index'], 1.2, 0.6],
          'line-opacity': ['case', ['get', 'index'], 0.6, 0.3],
        },
      },
    ],
  },
});
```

## Development

```bash
npm run dev        # Start dev server
npm run build      # Build for production
npm run test:dem   # Run tests with coverage
npm run lint       # Lint code
```

## Deployment

```bash
npm run deploy
```

## Configuration

Environment variables (set in `wrangler.json` or Cloudflare dashboard):

| Variable | Description | Default |
|----------|-------------|---------|
| `DEM_TILE_URL` | Source tile URL template | Mapterhorn tiles |
| `CACHE_TTL` | Cache duration in seconds | 86400 (1 day) |
| `CACHE_ENABLED` | Enable/disable caching | true |
| `COMPRESSION_ENABLED` | Enable/disable gzip | true |

## How It Works

1. **Fetch** - Retrieves Terrarium-encoded DEM tiles (RGB → elevation)
2. **Buffer** - Stitches 3x3 tile neighborhood for edge context
3. **Process** - Runs Marching Squares (contours) or Lambertian reflectance (hillshade)
4. **Transform** - Converts grid coordinates to MVT extent with clipping
5. **Encode** - Outputs gzip-compressed MVT via vt-pbf

## Tech Stack

- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge compute
- [Hono](https://hono.dev/) - Web framework
- [Vite](https://vitejs.dev/) - Build tooling
- [MapLibre GL JS](https://maplibre.org/) - Map rendering
- [React](https://react.dev/) - Demo UI

## Acknowledgments

- [Mapterhorn](https://mapterhorn.com/) - Source of Terrarium-encoded DEM tiles
- [Apache Baremaps](https://baremaps.apache.org/) - Contour and hillshade algorithms ported to TypeScript

## License

MIT
