// Copy alongside copilot-proof.test.ts in the repository root of /lab.
import { defineConfig } from "vitest/config";
import { sharedVitestConfig } from "./test/vitest/vitest.shared.config.ts";

export default defineConfig({
  ...sharedVitestConfig,
  test: {
    ...sharedVitestConfig.test,
    include: ["copilot-proof.test.ts"],
    exclude: [],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
