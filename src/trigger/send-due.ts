import { schedules } from "@trigger.dev/sdk";
import { callInternalJob } from "./http";

export const sendDueEmails = schedules.task({
  id: "mailpilot-send-due",
  cron: "*/5 * * * *",
  run: async () => callInternalJob("/api/jobs/send-due"),
});
