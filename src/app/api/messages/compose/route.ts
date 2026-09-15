import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { sendAndStore } from "@/lib/mail/send";
import { boundedText, jsonBody, requireEmailList } from "@/lib/validation";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const idempotencyHeader = request.headers.get("idempotency-key");
    const idempotencyKey = idempotencyHeader ? boundedText(idempotencyHeader, "Idempotency key", 160) : undefined;
    const body = await jsonBody<any>(request, 350_000);
    const mailboxId = boundedText(body.mailboxId, "Mailbox", 100);
    const to = requireEmailList(body.to, "recipients", 50);
    const cc = body.cc?.length ? requireEmailList(body.cc, "CC recipients", 50) : [];
    const subject = boundedText(body.subject, "Subject", 998);
    const text = boundedText(body.body, "Body", 250_000);

    const { data: mailbox, error } = await supabase.from("mailboxes").select("*").eq("id", mailboxId).eq("user_id", user.id).single();
    if (error || !mailbox) throw new Error("Mailbox not found");

    if (body.mode === "schedule") {
      const when = body.scheduledAt ? new Date(body.scheduledAt) : null;
      if (!when || Number.isNaN(when.getTime()) || when <= new Date()) return NextResponse.json({ error: "Choose a future schedule time" }, { status: 400 });
      const { data, error: insertError } = await supabase.from("scheduled_messages").insert({
        user_id: user.id,
        mailbox_id: mailbox.id,
        to_emails: to,
        cc_emails: cc,
        subject,
        body_text: text,
        status: "scheduled",
        scheduled_at: when.toISOString(),
      }).select("id").single();
      if (insertError) throw insertError;
      await writeAudit(supabase, { userId: user.id, actorType: "user", action: "message.scheduled", entityType: "scheduled_message", entityId: data.id, metadata: { mailboxId, recipientCount: to.length } });
      return NextResponse.json({ ok: true, scheduled: data });
    }

    const sent = await sendAndStore(supabase, { userId: user.id, mailbox, to, cc, subject, body: text, idempotencyKey });
    await writeAudit(supabase, { userId: user.id, actorType: "user", action: "message.sent", entityType: "mail_message", entityId: sent.messageId, metadata: { mailboxId, recipientCount: to.length } });
    return NextResponse.json({ ok: true, sent });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send message";
    return NextResponse.json({ error: message }, { status: /daily sending limit/i.test(message) ? 429 : 400 });
  }
}
