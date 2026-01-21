# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vector Elevation Model is a Cloudflare Workers application that generates vector tiles (MVT) from Digital Elevation Model (DEM) data. It serves contour lines and hillshade polygons derived from Terrarium-encoded elevation tiles, consumed by a MapLibre GL JS frontend.

## Commands

```bash
npm run dev          # Start development server (Vite + Workers)
npm run build        # TypeScript compile + Vite build
npm run deploy       # Deploy to Cloudflare Workers
npm run lint         # ESLint
npm run test         # Worker-specific tests (Cloudflare vitest pool)
npm run test:dem     # DEM library + tile tests with coverage
npm run test:tiles   # Tile processing tests only
npm run test:coverage # Coverage report for src/lib/
```

Run a single test file:
```bash
npx vitest --config vitest.dem.config.ts test/dem/contour-linestring.test.ts
```

## Architecture

### Processing Pipeline

```
DEM Source Tile (Terrarium WebP) → TileFetcher → Elevation Grid
    ↓
Elevation Grid + Buffer → Process Function (contour/hillshade)
    ↓
GeoJSON Features → Coordinate Transform + Clip → MVT Encode → Response
```

### Key Components

**`src/worker/`** - Hono API endpoints
- `tile-handler.ts` - Factory for creating tile handlers with caching, fetching, and encoding boilerplate
- `routes/contour.ts` - Contour line generation (Marching Squares → LineString features)
- `routes/hillshade.ts` - Hillshade bands (shadow/highlight polygons with `shade` property 0-1)

**`src/lib/dem/`** - Core DEM processing algorithms
- `contour.ts` - Marching Squares isoline/polygon tracing with hole detection
- `hillshade.ts` - Lambertian reflectance hillshade calculation
- `elevation.ts` - Terrarium/MapBox terrain-rgb encoding/decoding
- `smooth.ts` - Chaikin corner-cutting for geometry smoothing

**`src/lib/tiles/`** - Vector tile infrastructure
- `fetcher.ts` - Fetches 3x3 tile neighborhoods for edge buffering, decodes Terrarium RGB
- `encoder.ts` - GeoJSON → MVT via vt-pbf with gzip compression
- `coordinate-transform.ts` - Grid coords → MVT coords with Sutherland-Hodgman clipping
- `types.ts` - Constants and zoom-dependent interval functions

**`src/react-app/`** - MapLibre GL visualization with layer toggles

### Buffer Strategy

Source tiles (512px) are larger than output tiles (256px). An 8px buffer is added for smooth algorithms at tile edges. The fetcher stitches a 3x3 neighborhood when buffering is needed, then samples the center region.

### Hillshade Polygon Model

Hillshade produces two polygon sets for compositing:
- **Shadows** (shade 0-0.5): darker areas nested inside, rendered with dark fill
- **Highlights** (shade 0.5-1): brighter areas nested inside, rendered with light fill

Flat terrain has shade=0.5 (baseline), allowing symmetric accumulation of shadows and highlights.

### Environment Variables

- `DEM_TILE_URL` - Override default tile source (default: Mapterhorn tiles)
- `CACHE_ENABLED` - Set `false` to disable caching during development
- `CACHE_TTL` - Cache duration in seconds (default: 86400)
- `COMPRESSION_ENABLED` - Set `false` to disable gzip (useful for local dev)

## Test Configuration

Three vitest configs exist:
- `vitest.config.ts` - Worker pool tests (`test/index.test.ts`)
- `vitest.dem.config.ts` - Library tests with 70% coverage threshold
- `vitest.tiles.config.ts` - Tile-specific tests
