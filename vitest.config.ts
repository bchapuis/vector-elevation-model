import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		// Only include worker-specific tests
		include: ["test/index.test.ts"],
		poolOptions: {
			workers: {
				wrangler: { configPath: "./wrangler.json" },
			},
		},
	},
});
