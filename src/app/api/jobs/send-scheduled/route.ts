import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAndStore } from "@/lib/mail/send";
import { dateKeyInTimeZone, insideLocalHours } from "@/lib/time";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;


function retryAt(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = createAdminClient();
  const { data: rows, error } = await db.rpc("claim_due_scheduled_messages", { p_limit: 25 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let failed = 0;
  let deferred = 0;

  for (const row of rows ?? []) {
    let aiQuotaReserved = false;
    let aiUsageDate = "";
    try {
      const { data: mailbox, error: mailboxError } = await db.from("mailboxes").select("*").eq("id", row.mailbox_id).eq("user_id", row.user_id).single();
      if (mailboxError || !mailbox) throw new Error("Mailbox not found");

      if (!["healthy", "warning"].includes(mailbox.status)) {
        await db.from("scheduled_messages").update({
          status: "scheduled",
          claimed_at: null,
          lock_token: null,
          scheduled_at: retryAt(60),
          last_error: `Mailbox status is ${mailbox.status}`,
        }).eq("id", row.id).eq("user_id", row.user_id);
        deferred++;
        continue;
      }

      if (row.is_ai_generated && row.metadata?.source === "automation") {
        const { data: settings } = await db.from("ai_settings").select("*").eq("user_id", row.user_id).maybeSingle();
        if ((settings?.reply_mode ?? "draft") !== "auto_send") {
          await db.from("scheduled_messages").update({ status: "draft", claimed_at: null, lock_token: null, last_error: "AI auto-send is disabled; review this draft manually." }).eq("id", row.id).eq("user_id", row.user_id);
          deferred++;
          continue;
        }
        const timezone = settings?.timezone ?? "UTC";
        if (!insideLocalHours(timezone, settings?.business_hours_start ?? "09:00", settings?.business_hours_end ?? "18:00")) {
          await db.from("scheduled_messages").update({ status: "scheduled", claimed_at: null, lock_token: null, scheduled_at: retryAt(15), last_error: null }).eq("id", row.id).eq("user_id", row.user_id);
          deferred++;
          continue;
        }

        aiUsageDate = dateKeyInTimeZone(timezone);
        const { data: reserved, error: aiReserveError } = await db.rpc("reserve_ai_auto_reply", { p_user_id: row.user_id, p_usage_date: aiUsageDate });
        if (aiReserveError) throw aiReserveError;
        if (!reserved) {
          await db.from("scheduled_messages").update({ status: "draft", claimed_at: null, lock_token: null, last_error: "Daily AI auto-reply cap reached; review manually." }).eq("id", row.id).eq("user_id", row.user_id);
          deferred++;
          continue;
        }
        aiQuotaReserved = true;
      }

      const sendResult = await sendAndStore(db, {
        userId: row.user_id,
        mailbox,
        to: row.to_emails,
        cc: row.cc_emails,
        subject: row.subject,
        body: row.body_text,
        threadId: row.thread_id,
        inReplyTo: row.in_reply_to,
        references: row.references_header,
        isAiGenerated: row.is_ai_generated,
        eventMetadata: { scheduledMessageId: row.id, source: row.metadata?.source ?? "scheduled" },
        idempotencyKey: `scheduled:${row.id}`,
      });

      // If this was a retry and the outbound send was already finalized earlier,
      // do not consume a second AI auto-reply quota slot.
      if (sendResult.deduplicated && aiQuotaReserved && aiUsageDate) {
        try { await db.rpc("release_ai_auto_reply", { p_user_id: row.user_id, p_usage_date: aiUsageDate }); } catch { /* best effort */ }
        aiQuotaReserved = false;
      }

      await db.from("scheduled_messages").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        claimed_at: null,
        lock_token: null,
        last_error: null,
      }).eq("id", row.id).eq("user_id", row.user_id);
      sent++;
    } catch (sendError) {
      if (aiQuotaReserved && aiUsageDate) {
        try { await db.rpc("release_ai_auto_reply", { p_user_id: row.user_id, p_usage_date: aiUsageDate }); } catch { /* best effort */ }
      }
      const reason = sendError instanceof Error ? sendError.message.slice(0, 500) : "Send failed";
      if (/delivery state is uncertain|SMTP accepted the message/i.test(reason)) {
        await db.from("scheduled_messages").update({ status: "failed", claimed_at: null, lock_token: null, last_error: reason }).eq("id", row.id).eq("user_id", row.user_id);
        failed++;
        continue;
      }
      if (/daily sending limit reached/i.test(reason)) {
        await db.from("scheduled_messages").update({ status: "scheduled", claimed_at: null, lock_token: null, scheduled_at: retryAt(30), last_error: reason }).eq("id", row.id).eq("user_id", row.user_id);
        deferred++;
        continue;
      }

      const attempts = Number(row.attempt_count ?? 0) + 1;
      const terminal = attempts >= Number(row.max_attempts ?? 3);
      const backoffMinutes = Math.min(120, 5 * (2 ** Math.max(0, attempts - 1)));
      await db.from("scheduled_messages").update({
        status: terminal ? "failed" : "scheduled",
        attempt_count: attempts,
        claimed_at: null,
        lock_token: null,
        scheduled_at: terminal ? row.scheduled_at : retryAt(backoffMinutes),
        last_error: reason,
      }).eq("id", row.id).eq("user_id", row.user_id);
      failed++;
    }
  }

  return NextResponse.json({ ok: true, claimed: (rows ?? []).length, sent, failed, deferred });
}
