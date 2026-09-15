import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseRawEmail } from "@/lib/mail/raw";
import { runtimeCredentials, type StoredMailbox } from "@/lib/mail/account";
import { fetchInboxMessages } from "@/lib/mail/imap";
import { externalThreadKey } from "@/lib/mail/threading";
import { classifySystemMail } from "@/lib/deliverability/bounce";

export async function syncMailboxToDatabase(supabase: SupabaseClient, mailbox: StoredMailbox & { last_sync_at?: string | null; last_uid?: number | null }, limit = 100) {
  const credentials = await runtimeCredentials(mailbox);
  const since = mailbox.last_sync_at ? new Date(new Date(mailbox.last_sync_at).getTime() - 5 * 60 * 1000) : new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const messages = await fetchInboxMessages(credentials.imap, { since, minUid: mailbox.last_uid ? Number(mailbox.last_uid) + 1 : undefined, limit });
  let inserted = 0;
  let maxUid = Number(mailbox.last_uid ?? 0);

  for (const message of messages) {
    maxUid = Math.max(maxUid, message.uid);
    const sender = message.from.trim().toLowerCase();
    if (!sender || sender === mailbox.email.toLowerCase()) continue;
    const key = externalThreadKey({ subject: message.subject, from: sender, mailbox: mailbox.email, inReplyTo: message.inReplyTo, references: message.references });
    let thread: { id: string } | null = null;
    let linkedMetadata: Record<string, unknown> | null = null;

    if (message.inReplyTo) {
      const linked = await supabase.from("mail_messages").select("thread_id,metadata").eq("mailbox_id", mailbox.id).eq("provider_message_id", message.inReplyTo).maybeSingle();
      if (linked.error) throw linked.error;
      if (linked.data?.thread_id) {
        thread = { id: linked.data.thread_id };
        linkedMetadata = linked.data.metadata ?? null;
      }
    }

    if (!thread) {
      const existing = await supabase.from("mail_threads").select("id").eq("mailbox_id", mailbox.id).eq("external_thread_key", key).maybeSingle();
      if (existing.error) throw existing.error;
      thread = existing.data;
    }

    const receivedAt = (message.date ?? new Date()).toISOString();
    if (!thread) {
      const created = await supabase.from("mail_threads").insert({
        user_id: mailbox.user_id,
        mailbox_id: mailbox.id,
        external_thread_key: key,
        subject: message.subject || "(no subject)",
        participants: [sender, mailbox.email],
        unread_count: 0,
        last_message_at: receivedAt,
      }).select("id").single();
      if (created.error) throw created.error;
      thread = created.data;
    }
    if (!thread) throw new Error("Unable to create or resolve mail thread");

    const parsed = await parseRawEmail(message.source);
    const bodyText = parsed.text;
    const systemMail = classifySystemMail({ sender, subject: message.subject || "", body: bodyText, raw: message.source.toString("utf8") });
    const insert = await supabase.from("mail_messages").upsert({
      user_id: mailbox.user_id,
      mailbox_id: mailbox.id,
      thread_id: thread.id,
      direction: "inbound",
      from_email: sender,
      to_emails: message.to,
      cc_emails: message.cc,
      subject: message.subject || "(no subject)",
      body_text: bodyText,
      provider_message_id: message.messageId || null,
      provider_uid: message.uid,
      in_reply_to: message.inReplyTo || null,
      references_header: message.references || null,
      is_read: false,
      delivery_state: "received",
      received_at: receivedAt,
      metadata: { ...(parsed.attachments.length ? { attachments: parsed.attachments } : {}), ...(systemMail.type ? { systemType: systemMail.type, failedRecipient: systemMail.failedRecipient ?? null, statusCode: systemMail.statusCode ?? null, diagnostic: systemMail.diagnostic ?? null } : {}) },
    }, { onConflict: "mailbox_id,provider_uid", ignoreDuplicates: true }).select("id").maybeSingle();
    if (insert.error) throw insert.error;

    if (insert.data?.id) {
      inserted++;
      const { error: activityError } = await supabase.rpc("record_inbound_thread_activity", {
        p_thread_id: thread.id,
        p_user_id: mailbox.user_id,
        p_message_at: receivedAt,
      });
      if (activityError) throw activityError;

      const contactEmail = systemMail.failedRecipient || sender;
      const { data: contact } = await supabase.from("contacts").select("id,status").eq("user_id", mailbox.user_id).eq("email", contactEmail).maybeSingle();
      const campaignContactId = linkedMetadata?.campaignContactId;

      if (systemMail.type === "bounce") {
        if (contact && !["unsubscribed", "complained"].includes(contact.status)) await supabase.from("contacts").update({ status: "bounced" }).eq("id", contact.id).eq("user_id", mailbox.user_id);
        if (campaignContactId) await supabase.from("campaign_contacts").update({ status: "failed", last_error: systemMail.diagnostic || systemMail.statusCode || "Delivery bounced" }).eq("id", campaignContactId);
      } else if (systemMail.type === "complaint") {
        if (contact) await supabase.from("contacts").update({ status: "complained" }).eq("id", contact.id).eq("user_id", mailbox.user_id);
        if (campaignContactId) await supabase.from("campaign_contacts").update({ status: "skipped", last_error: "Spam complaint received" }).eq("id", campaignContactId);
      } else {
        if (contact && !["unsubscribed", "complained"].includes(contact.status)) await supabase.from("contacts").update({ status: "replied" }).eq("id", contact.id).eq("user_id", mailbox.user_id);
        if (campaignContactId) await supabase.from("campaign_contacts").update({ status: "replied" }).eq("id", campaignContactId);
      }

      await supabase.from("message_events").insert({
        user_id: mailbox.user_id,
        mailbox_id: mailbox.id,
        contact_id: contact?.id ?? null,
        campaign_contact_id: campaignContactId ?? null,
        type: systemMail.type || "reply",
        provider_message_id: message.messageId || null,
        metadata: { from: sender, subject: message.subject || "(no subject)", threadId: thread.id, failedRecipient: systemMail.failedRecipient ?? null, statusCode: systemMail.statusCode ?? null, diagnostic: systemMail.diagnostic ?? null },
      });
    }
  }

  const now = new Date().toISOString();
  await supabase.from("mailboxes").update({
    last_sync_at: now,
    last_successful_sync_at: now,
    last_uid: maxUid || mailbox.last_uid || null,
    sync_claimed_at: null,
    status: "healthy",
    consecutive_failures: 0,
    last_error: null,
  }).eq("id", mailbox.id).eq("user_id", mailbox.user_id);

  return { fetched: messages.length, inserted, maxUid };
}
