import { NextResponse } from "next/server";
import { sendAndStore } from "@/lib/mail/send";
import { renderTemplate } from "@/lib/mail/template";
import { createAdminClient } from "@/lib/supabase/admin";
import { insideLocalHours } from "@/lib/time";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;


function retryAt(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = createAdminClient();
  const { data: rows, error } = await db.rpc("claim_due_campaign_contacts", { p_limit: 20 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let deferred = 0;
  const touchedCampaigns = new Set<string>();

  for (const row of rows ?? []) {
    touchedCampaigns.add(String(row.campaign_id));
    try {
      const [{ data: contact, error: contactError }, { data: campaign, error: campaignError }] = await Promise.all([
        db.from("contacts").select("*").eq("id", row.contact_id).single(),
        db.from("campaigns").select("*").eq("id", row.campaign_id).single(),
      ]);
      if (contactError || campaignError || !contact || !campaign) throw new Error("Campaign or contact missing");

      if (!["scheduled", "running"].includes(campaign.status) || contact.status !== "active") {
        await db.from("campaign_contacts").update({ status: "skipped", claimed_at: null, lock_token: null, last_error: "Campaign inactive or contact suppressed" }).eq("id", row.id);
        skipped++;
        continue;
      }

      if (!insideLocalHours(campaign.timezone, campaign.send_window_start, campaign.send_window_end, new Date(), true)) {
        await db.from("campaign_contacts").update({ status: "queued", claimed_at: null, lock_token: null, scheduled_at: retryAt(15), last_error: null }).eq("id", row.id);
        deferred++;
        continue;
      }

      const { data: mailbox, error: mailboxError } = await db.from("mailboxes").select("*").eq("id", campaign.mailbox_id).eq("user_id", campaign.user_id).single();
      if (mailboxError || !mailbox || !["healthy", "warning"].includes(mailbox.status)) {
        await db.from("campaign_contacts").update({ status: "queued", claimed_at: null, lock_token: null, scheduled_at: retryAt(60), last_error: "Mailbox unavailable" }).eq("id", row.id);
        deferred++;
        continue;
      }

      const variables = {
        first_name: contact.first_name ?? "",
        last_name: contact.last_name ?? "",
        company: contact.company ?? "",
        email: contact.email,
        sender_name: mailbox.display_name ?? "",
      };
      const subject = renderTemplate(campaign.subject, variables);
      let body = renderTemplate(campaign.body, variables);
      const unsubscribeUrl = `${env.appUrl}/unsubscribe/${contact.unsubscribe_token}`;
      body += `\n\n---\nPrefer not to receive these emails? Unsubscribe: ${unsubscribeUrl}`;

      await sendAndStore(db, {
        userId: campaign.user_id,
        mailbox,
        to: [contact.email],
        subject,
        body,
        campaignId: campaign.id,
        contactId: contact.id,
        campaignContactId: row.id,
        eventMetadata: { campaignContactId: row.id, campaignId: campaign.id, contactId: contact.id },
        idempotencyKey: `campaign-contact:${row.id}`,
        listUnsubscribeUrl: `${env.appUrl}/api/unsubscribe/${contact.unsubscribe_token}`,
      });

      await db.from("campaign_contacts").update({ status: "sent", sent_at: new Date().toISOString(), claimed_at: null, lock_token: null, last_error: null }).eq("id", row.id);
      if (campaign.status === "scheduled") await db.from("campaigns").update({ status: "running" }).eq("id", campaign.id).eq("user_id", campaign.user_id);
      sent++;
    } catch (sendError) {
      const reason = sendError instanceof Error ? sendError.message.slice(0, 500) : "Unknown send error";
      if (/delivery state is uncertain|SMTP accepted the message/i.test(reason)) {
        await db.from("campaign_contacts").update({ status: "failed", claimed_at: null, lock_token: null, last_error: reason }).eq("id", row.id);
        failed++;
        continue;
      }
      if (/daily sending limit reached/i.test(reason)) {
        await db.from("campaign_contacts").update({ status: "queued", claimed_at: null, lock_token: null, scheduled_at: retryAt(30), last_error: reason }).eq("id", row.id);
        deferred++;
        continue;
      }

      const attempts = Number(row.attempt_count ?? 0) + 1;
      const terminal = attempts >= Number(row.max_attempts ?? 3);
      const backoffMinutes = Math.min(120, 5 * (2 ** Math.max(0, attempts - 1)));
      await db.from("campaign_contacts").update({
        status: terminal ? "failed" : "queued",
        attempt_count: attempts,
        claimed_at: null,
        lock_token: null,
        scheduled_at: terminal ? row.scheduled_at : retryAt(backoffMinutes),
        last_error: reason,
      }).eq("id", row.id);
      failed++;
    }
  }

  for (const campaignId of touchedCampaigns) {
    const { count, error: remainingError } = await db.from("campaign_contacts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("status", ["queued", "sending"]);
    if (!remainingError && (count ?? 0) === 0) {
      await db.from("campaigns").update({ status: "completed" }).eq("id", campaignId).in("status", ["scheduled", "running"]);
    }
  }

  return NextResponse.json({ ok: true, claimed: (rows ?? []).length, sent, skipped, failed, deferred });
}
