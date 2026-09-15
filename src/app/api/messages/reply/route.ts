import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { sendAndStore } from "@/lib/mail/send";
import { boundedText, jsonBody, requireEmail } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const idempotencyHeader = request.headers.get("idempotency-key");
    const idempotencyKey = idempotencyHeader ? boundedText(idempotencyHeader, "Idempotency key", 160) : undefined;
    const body = await jsonBody<any>(request, 300_000);
    const threadId = boundedText(body.threadId, "Thread", 100);
    const mailboxId = boundedText(body.mailboxId, "Mailbox", 100);
    const to = requireEmail(body.to, "recipient");
    const replyBody = boundedText(body.body, "Body", 250_000);
    const rawSubject = boundedText(body.subject || "(no subject)", "Subject", 998);

    const [{ data: mailbox, error: mailboxError }, { data: thread, error: threadError }, { data: last, error: lastError }] = await Promise.all([
      supabase.from("mailboxes").select("*").eq("id", mailboxId).eq("user_id", user.id).single(),
      supabase.from("mail_threads").select("id,mailbox_id").eq("id", threadId).eq("user_id", user.id).single(),
      supabase.from("mail_messages").select("provider_message_id,references_header").eq("thread_id", threadId).eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (mailboxError || !mailbox) throw new Error("Mailbox not found");
    if (threadError || !thread || thread.mailbox_id !== mailbox.id) throw new Error("Thread does not belong to this mailbox");
    if (lastError) throw lastError;

    const subject = /^re:/i.test(rawSubject) ? rawSubject : `Re: ${rawSubject}`;
    const references = [last?.references_header, last?.provider_message_id].filter(Boolean).join(" ");

    if (body.mode === "schedule") {
      const at = body.scheduledAt ? new Date(body.scheduledAt) : new Date(Date.now() + 10 * 60_000);
      if (Number.isNaN(at.getTime()) || at <= new Date()) throw new Error("Choose a future schedule time");
      const { data, error } = await supabase.from("scheduled_messages").insert({
        user_id: user.id,
        mailbox_id: mailbox.id,
        thread_id: threadId,
        to_emails: [to],
        subject,
        body_text: replyBody,
        in_reply_to: last?.provider_message_id ?? null,
        references_header: references || null,
        status: "scheduled",
        scheduled_at: at.toISOString(),
      }).select("id").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, scheduled: data });
    }

    const sent = await sendAndStore(supabase, { userId: user.id, mailbox, to: [to], subject, body: replyBody, threadId, inReplyTo: last?.provider_message_id, references, idempotencyKey });
    return NextResponse.json({ ok: true, sent });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reply failed";
    return NextResponse.json({ error: message }, { status: /daily sending limit/i.test(message) ? 429 : 400 });
  }
}
