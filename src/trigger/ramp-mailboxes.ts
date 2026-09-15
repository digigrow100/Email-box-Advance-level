import { schedules } from "@trigger.dev/sdk";
import { callInternalJob } from "./http";

export const rampMailboxes = schedules.task({
  id: "mailpilot-ramp-mailboxes",
  cron: "0 5 * * *",
  run: async () => callInternalJob("/api/jobs/ramp-mailboxes"),
});
