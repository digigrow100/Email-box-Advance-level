import { schedules } from "@trigger.dev/sdk";
import { callInternalJob } from "./http";

export const runAutomations = schedules.task({
  id: "run-email-automations",
  cron: "*/2 * * * *",
  run: async () => callInternalJob("/api/jobs/run-automations"),
});
