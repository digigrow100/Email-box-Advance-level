import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_replace_me",
  dirs: ["./src/trigger"],
  runtime: "node-22",
  maxDuration: 120,
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 3, minTimeoutInMs: 1000, maxTimeoutInMs: 10_000, factor: 2, randomize: true },
  },
});
