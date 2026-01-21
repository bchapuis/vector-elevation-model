import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("Worker API", () => {
	it("returns JSON response from /api/", async () => {
		const response = await SELF.fetch("http://localhost/api/");
		expect(response.status).toBe(200);

		const json = await response.json();
		expect(json).toEqual({ name: "Cloudflare" });
	});

	it("returns 404 for unknown routes", async () => {
		const response = await SELF.fetch("http://localhost/unknown");
		expect(response.status).toBe(404);
	});
});
