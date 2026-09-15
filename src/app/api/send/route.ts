// Backwards-compatible manual-send endpoint. New UI uses /api/messages/compose.
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
    const body = await jsonBody<any>(request, 350_000);
    const mailboxId = boundedText(body.mailboxId, "Mailbox", 100);
    const to = requireEmail(body.to, "recipient");
    const subject = boundedText(body.subject, "Subject", 998);
    const text = boundedText(body.text, "Body", 250_000);
    const { data: mailbox, error } = await supabase.from("mailboxes").select("*").eq("id", mailboxId).eq("user_id", user.id).single();
    if (error || !mailbox) throw new Error("Mailbox not found");
    const result = await sendAndStore(supabase, { userId: user.id, mailbox, to: [to], subject, body: text, idempotencyKey });
    return NextResponse.json({ ok: true, messageId: result.messageId, providerMessageId: result.providerMessageId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Send failed";
    return NextResponse.json({ error: message }, { status: /daily sending limit/i.test(message) ? 429 : 400 });
  }
}
