import { Hono } from "hono";
import { cors } from "hono/cors";
import { terrainHandler } from "./routes/terrain";

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all routes - required for MapLibre to access tile responses
app.use("*", cors());

app.get("/api/", (c) => c.json({ name: "Cloudflare" }));

// Vector tile endpoint - single MVT with both contour and hillshade layers
app.get("/tiles/terrain/:z/:x/:y", terrainHandler);

export default app;
