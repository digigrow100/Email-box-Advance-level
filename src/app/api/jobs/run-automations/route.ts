import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processInboundAutomations } from "@/lib/automation";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;


export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = createAdminClient();
  const { data: messages, error } = await db.rpc("claim_inbound_automation_messages", { p_limit: 100 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let processed = 0;
  let errors = 0;
  for (const message of messages ?? []) {
    try {
      const [{ data: thread }, { data: mailbox }] = await Promise.all([
        db.from("mail_threads").select("*").eq("id", message.thread_id).eq("user_id", message.user_id).single(),
        db.from("mailboxes").select("*").eq("id", message.mailbox_id).eq("user_id", message.user_id).single(),
      ]);
      if (!thread || !mailbox) throw new Error("Thread or mailbox missing");

      const matched = await processInboundAutomations(db, { userId: message.user_id, mailbox, thread, message });
      if (matched === 0) {
        await db.from("automation_runs").insert({
          user_id: message.user_id,
          mailbox_id: message.mailbox_id,
          thread_id: message.thread_id,
          message_id: message.id,
          status: "skipped",
          detail: { reason: "No rule matched" },
        });
      }
      await db.from("mail_messages").update({ automation_processed_at: new Date().toISOString(), automation_claimed_at: null, automation_last_error: null }).eq("id", message.id);
      processed++;
    } catch (e) {
      errors++;
      const reason = e instanceof Error ? e.message.slice(0, 500) : "Automation failed";
      await db.from("mail_messages").update({ automation_claimed_at: null, automation_last_error: reason }).eq("id", message.id);
      await db.from("automation_runs").insert({
        user_id: message.user_id,
        mailbox_id: message.mailbox_id,
        thread_id: message.thread_id,
        message_id: message.id,
        status: "failed",
        detail: { reason },
      });
    }
  }
  return NextResponse.json({ ok: true, claimed: (messages ?? []).length, processed, errors });
}
