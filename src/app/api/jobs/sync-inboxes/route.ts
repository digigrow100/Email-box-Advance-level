import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncMailboxToDatabase } from "@/lib/mail/sync";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;


export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = createAdminClient();
  const { data: mailboxes, error } = await db.rpc("claim_mailboxes_for_sync", { p_limit: 20 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let synced = 0;
  let inserted = 0;
  let errors = 0;
  for (const mailbox of mailboxes ?? []) {
    try {
      const result = await syncMailboxToDatabase(db, mailbox, 100);
      inserted += result.inserted;
      synced++;
    } catch (error) {
      errors++;
      const reason = error instanceof Error ? error.message.slice(0, 500) : "Sync failed";
      const failures = Number(mailbox.consecutive_failures ?? 0) + 1;
      await db.from("mailboxes").update({
        status: failures >= 5 ? "error" : "warning",
        consecutive_failures: failures,
        last_error: reason,
        last_error_at: new Date().toISOString(),
        sync_claimed_at: null,
      }).eq("id", mailbox.id).eq("user_id", mailbox.user_id);
      await db.from("message_events").insert({
        user_id: mailbox.user_id,
        mailbox_id: mailbox.id,
        type: "sync_failed",
        metadata: { source: "inbox_sync", reason, failures },
      });
    }
  }
  return NextResponse.json({ ok: true, claimed: (mailboxes ?? []).length, synced, inserted, errors });
}
