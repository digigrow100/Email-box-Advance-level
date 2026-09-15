import { schedules } from "@trigger.dev/sdk";
import { callInternalJob } from "./http";

export const syncInboxes = schedules.task({
  id: "mailpilot-sync-inboxes",
  cron: "*/10 * * * *",
  run: async () => callInternalJob("/api/jobs/sync-inboxes"),
});
