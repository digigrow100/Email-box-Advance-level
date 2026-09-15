import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { sendAndStore } from "@/lib/mail/send";
import { jsonBody } from "@/lib/validation";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, user } = await requireUser();
    const body = await jsonBody(request, 16_000);
    const { data: row, error } = await supabase.from("scheduled_messages").select("*").eq("id", id).eq("user_id", user.id).single();
    if (error || !row) throw new Error("Scheduled message not found");

    if (body.action === "cancel") {
      if (["sent", "cancelled"].includes(row.status)) throw new Error(`Message is already ${row.status}`);
      await supabase.from("scheduled_messages").update({ status: "cancelled", claimed_at: null, lock_token: null }).eq("id", id).eq("user_id", user.id);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "send_now") {
      if (!["draft", "scheduled", "failed"].includes(row.status)) throw new Error(`Cannot send a message with status ${row.status}`);
      const claimed = await supabase.from("scheduled_messages").update({ status: "sending", claimed_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).in("status", ["draft", "scheduled", "failed"]).select("id").maybeSingle();
      if (claimed.error || !claimed.data) throw new Error("Message is already being processed");

      const { data: mailbox, error: mailboxError } = await supabase.from("mailboxes").select("*").eq("id", row.mailbox_id).eq("user_id", user.id).single();
      if (mailboxError || !mailbox) throw new Error("Mailbox not found");
      try {
        await sendAndStore(supabase, { userId: user.id, mailbox, to: row.to_emails, cc: row.cc_emails, subject: row.subject, body: row.body_text, threadId: row.thread_id, inReplyTo: row.in_reply_to, references: row.references_header, isAiGenerated: row.is_ai_generated, idempotencyKey: `scheduled:${row.id}` });
        await supabase.from("scheduled_messages").update({ status: "sent", sent_at: new Date().toISOString(), claimed_at: null, lock_token: null, last_error: null }).eq("id", id).eq("user_id", user.id);
        return NextResponse.json({ ok: true });
      } catch (sendError) {
        await supabase.from("scheduled_messages").update({ status: "failed", claimed_at: null, lock_token: null, last_error: sendError instanceof Error ? sendError.message.slice(0, 500) : "Send failed" }).eq("id", id).eq("user_id", user.id);
        throw sendError;
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action failed";
    return NextResponse.json({ error: message }, { status: /daily sending limit/i.test(message) ? 429 : 400 });
  }
}
