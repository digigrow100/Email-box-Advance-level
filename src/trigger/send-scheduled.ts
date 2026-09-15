import { schedules } from "@trigger.dev/sdk";
import { callInternalJob } from "./http";

export const sendScheduled = schedules.task({
  id: "send-scheduled-mail",
  cron: "*/2 * * * *",
  run: async () => callInternalJob("/api/jobs/send-scheduled"),
});
