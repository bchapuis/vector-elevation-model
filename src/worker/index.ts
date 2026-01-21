import { Hono } from "hono";
import { cors } from "hono/cors";
import { contourHandler } from "./routes/contour";
import { hillshadeHandler } from "./routes/hillshade";

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all routes - required for MapLibre to access tile responses
app.use("*", cors());

app.get("/api/", (c) => c.json({ name: "Cloudflare" }));

// Vector tile endpoints
app.get("/tiles/contour/:z/:x/:y", contourHandler);
app.get("/tiles/hillshade/:z/:x/:y", hillshadeHandler);

export default app;
