import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runtimeCredentials, type StoredMailbox } from "@/lib/mail/account";
import { sendSmtpMail } from "@/lib/mail/smtp";
import { externalThreadKey } from "@/lib/mail/threading";
import { dateKeyInTimeZone } from "@/lib/time";
import { newTrackingToken, trackingHtml } from "@/lib/deliverability/tracking";

function generatedMessageId(email: string) {
  const domain = email.split("@")[1]?.replace(/[^a-z0-9.-]/gi, "") || "mailpilot.local";
  return `<${crypto.randomUUID()}@${domain}>`;
}

export async function sendAndStore(supabase: SupabaseClient, input: {
  userId: string;
  mailbox: StoredMailbox & { timezone?: string | null };
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  isAiGenerated?: boolean;
  campaignId?: string | null;
  contactId?: string | null;
  campaignContactId?: string | null;
  eventMetadata?: Record<string, unknown>;
  idempotencyKey?: string;
  listUnsubscribeUrl?: string;
}) {
  const idempotencyKey = input.idempotencyKey ?? `manual:${crypto.randomUUID()}`;
  const { data: existing, error: existingError } = await supabase.from("mail_messages")
    .select("id,thread_id,provider_message_id,delivery_state,sent_at")
    .eq("user_id", input.userId)
    .eq("send_idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.delivery_state === "sent") {
    return { messageId: existing.id, providerMessageId: existing.provider_message_id, threadId: existing.thread_id, deduplicated: true };
  }
  if (existing && ["pending", "uncertain"].includes(existing.delivery_state)) {
    throw new Error("A previous send attempt has uncertain delivery state. Review it before retrying to avoid a duplicate email.");
  }

  const usageDate = dateKeyInTimeZone(input.mailbox.timezone || "UTC");
  const { data: reserved, error: reserveError } = await supabase.rpc("reserve_mailbox_send", {
    p_mailbox_id: input.mailbox.id,
    p_user_id: input.userId,
    p_usage_date: usageDate,
  });
  if (reserveError) throw reserveError;
  if (!reserved) throw new Error("Mailbox daily sending limit reached or mailbox is unavailable");

  let quotaReserved = true;
  let smtpAccepted = false;
  let deliveryFinalized = false;
  let pendingMessageId = existing?.id ?? null;
  let threadId = input.threadId ?? existing?.thread_id ?? null;
  const clientMessageId = existing?.provider_message_id || generatedMessageId(input.mailbox.email);
  const body = input.mailbox.signature ? `${input.body.trim()}\n\n${input.mailbox.signature}` : input.body.trim();

  async function releaseQuota() {
    if (!quotaReserved) return;
    try {
      await supabase.rpc("release_mailbox_send", { p_mailbox_id: input.mailbox.id, p_user_id: input.userId, p_usage_date: usageDate });
      quotaReserved = false;
    } catch { /* best effort */ }
  }

  try {
    if (!threadId) {
      const key = externalThreadKey({ subject: input.subject, from: input.mailbox.email, mailbox: input.mailbox.email, inReplyTo: input.inReplyTo, references: input.references });
      const found = await supabase.from("mail_threads").select("id").eq("mailbox_id", input.mailbox.id).eq("external_thread_key", key).maybeSingle();
      if (found.error) throw found.error;
      threadId = found.data?.id ?? null;
      if (!threadId) {
        const created = await supabase.from("mail_threads").insert({
          user_id: input.userId,
          mailbox_id: input.mailbox.id,
          external_thread_key: key,
          subject: input.subject,
          participants: [input.mailbox.email, ...input.to],
          unread_count: 0,
          last_message_at: new Date().toISOString(),
        }).select("id").single();
        if (created.error) throw created.error;
        threadId = created.data.id;
      }
    }

    if (existing?.delivery_state === "failed") {
      const reset = await supabase.from("mail_messages").update({
        delivery_state: "pending",
        metadata: input.eventMetadata ?? {},
      }).eq("id", existing.id).eq("user_id", input.userId).select("id").single();
      if (reset.error) throw reset.error;
      pendingMessageId = existing.id;
    } else {
      const pending = await supabase.from("mail_messages").insert({
        user_id: input.userId,
        mailbox_id: input.mailbox.id,
        thread_id: threadId,
        direction: "outbound",
        from_email: input.mailbox.email,
        to_emails: input.to,
        cc_emails: input.cc ?? [],
        subject: input.subject,
        body_text: body,
        provider_message_id: clientMessageId,
        in_reply_to: input.inReplyTo ?? null,
        references_header: input.references ?? null,
        is_read: true,
        is_ai_generated: Boolean(input.isAiGenerated),
        delivery_state: "pending",
        send_idempotency_key: idempotencyKey,
        metadata: input.eventMetadata ?? {},
      }).select("id").single();
      if (pending.error) throw pending.error;
      pendingMessageId = pending.data.id;
    }

    const settingsResult = await supabase.from("workspace_settings")
      .select("open_tracking_enabled,click_tracking_enabled")
      .eq("user_id", input.userId)
      .maybeSingle();
    if (settingsResult.error) throw settingsResult.error;
    const openTracking = Boolean(settingsResult.data?.open_tracking_enabled);
    const clickTracking = Boolean(settingsResult.data?.click_tracking_enabled);
    let trackingToken: string | null = null;
    if ((openTracking || clickTracking) && pendingMessageId) {
      const existingToken = await supabase.from("message_tracking_tokens")
        .select("token")
        .eq("mail_message_id", pendingMessageId)
        .eq("user_id", input.userId)
        .maybeSingle();
      if (existingToken.error) throw existingToken.error;
      trackingToken = existingToken.data?.token ?? newTrackingToken();
      if (!existingToken.data) {
        const tokenInsert = await supabase.from("message_tracking_tokens").insert({
          user_id: input.userId, mail_message_id: pendingMessageId, token: trackingToken,
        });
        if (tokenInsert.error) throw tokenInsert.error;
      }
    }

    const creds = await runtimeCredentials(input.mailbox);
    const providerResult = await sendSmtpMail(creds.smtp, {
      fromName: input.mailbox.display_name ?? undefined,
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      text: body,
      html: trackingToken ? trackingHtml(body, trackingToken, { open: openTracking, click: clickTracking }) : undefined,
      inReplyTo: input.inReplyTo ?? undefined,
      references: input.references ?? undefined,
      messageId: clientMessageId,
      headers: {
        ...(pendingMessageId ? { "X-MailPilot-Message-ID": pendingMessageId } : {}),
        ...(input.listUnsubscribeUrl ? {
          "List-Unsubscribe": `<${input.listUnsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        } : {}),
      },
      requestDsn: true,
    });
    smtpAccepted = true;

    const now = new Date().toISOString();
    const finalProviderId = providerResult.messageId || clientMessageId;
    const finalize = await supabase.from("mail_messages").update({
      provider_message_id: finalProviderId,
      delivery_state: "sent",
      sent_at: now,
    }).eq("id", pendingMessageId).eq("user_id", input.userId).select("id").single();
    if (finalize.error) throw finalize.error;
    deliveryFinalized = true;

    // These are secondary bookkeeping writes. Once the outbound message is durably
    // marked sent, a logging/health failure must not turn a successful SMTP send
    // into an "uncertain" delivery or trigger a duplicate retry.
    const bookkeeping = await Promise.allSettled([
      supabase.from("mail_threads").update({ last_message_at: now }).eq("id", threadId).eq("user_id", input.userId),
      supabase.from("message_events").insert({
        user_id: input.userId,
        mailbox_id: input.mailbox.id,
        campaign_id: input.campaignId ?? null,
        contact_id: input.contactId ?? null,
        campaign_contact_id: input.campaignContactId ?? null,
        type: "sent",
        provider_message_id: finalProviderId,
        metadata: { to: input.to, subject: input.subject, source: input.campaignId ? "campaign" : "mailbox", ...(input.eventMetadata ?? {}) },
      }),
      supabase.from("mailboxes").update({ last_successful_send_at: now, consecutive_failures: 0, last_error: null }).eq("id", input.mailbox.id).eq("user_id", input.userId),
    ]);
    const bookkeepingErrors = bookkeeping.filter((item) =>
      item.status === "rejected" || (item.status === "fulfilled" && item.value?.error)
    );
    if (bookkeepingErrors.length) console.error("Post-send bookkeeping failed", bookkeepingErrors);

    return { ...providerResult, providerMessageId: finalProviderId, threadId, messageId: pendingMessageId, deduplicated: false };
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 500) : "Send failed";
    if (smtpAccepted && !deliveryFinalized) {
      // The provider accepted the email, but we could not durably finalize it.
      // Never release quota or auto-retry blindly because that risks duplicates.
      if (pendingMessageId) {
        try { await supabase.from("mail_messages").update({ delivery_state: "uncertain", metadata: { ...(input.eventMetadata ?? {}), sendError: reason } }).eq("id", pendingMessageId).eq("user_id", input.userId); } catch { /* best effort */ }
      }
    } else if (!smtpAccepted) {
      if (pendingMessageId) {
        try { await supabase.from("mail_messages").update({ delivery_state: "failed", metadata: { ...(input.eventMetadata ?? {}), sendError: reason } }).eq("id", pendingMessageId).eq("user_id", input.userId); } catch { /* best effort */ }
      }
      await releaseQuota();
      await supabase.from("mailboxes").update({
        last_error: reason,
        last_error_at: new Date().toISOString(),
        consecutive_failures: Number(input.mailbox.consecutive_failures ?? 0) + 1,
      }).eq("id", input.mailbox.id).eq("user_id", input.userId);
    }
    if (smtpAccepted && !deliveryFinalized) throw new Error(`SMTP accepted the message but delivery state is uncertain. Manual review required. ${reason}`);
    throw error;
  }
}
