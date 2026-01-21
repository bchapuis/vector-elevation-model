import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/dem/**/*.test.ts", "test/tiles/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "json-summary"],
			reportsDirectory: "./coverage",
			include: ["src/lib/**/*.ts"],
			exclude: [
				"**/*.d.ts",
				"**/*.test.ts",
				"**/node_modules/**",
			],
			thresholds: {
				statements: 70,
				branches: 70,
				functions: 70,
				lines: 70,
			},
		},
	},
});
