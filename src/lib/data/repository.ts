import "server-only";
import { env } from "@/lib/env";
import { demoActivity, demoCampaigns, demoContacts, demoMailboxes } from "@/lib/demo-data";
import { requireUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { ActivityItem, Campaign, Contact, Mailbox } from "@/lib/types";
import { dateKeyInTimeZone } from "@/lib/time";

async function pageUser() {
  try { return await requireUser(); }
  catch { return redirect("/login"); }
}

export async function listMailboxes(): Promise<Mailbox[]> {
  if (env.demoMode) return demoMailboxes;
  const { supabase, user } = await pageUser();
  const { data, error } = await supabase.from("mailboxes").select("id,provider,email,display_name,status,daily_limit,ramp_day,last_sync_at,timezone").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) throw error;
  const month = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return Promise.all((data ?? []).map(async (row: any) => {
    const [usageToday, { count: sentMonth }, { count: replies }] = await Promise.all([
      supabase.from("mailbox_daily_usage").select("sent_count").eq("mailbox_id", row.id).eq("usage_date", dateKeyInTimeZone((row as any).timezone || "UTC")).maybeSingle(),
      supabase.from("message_events").select("id", { count: "exact", head: true }).eq("mailbox_id", row.id).eq("type", "sent").gte("created_at", month),
      supabase.from("message_events").select("id", { count: "exact", head: true }).eq("mailbox_id", row.id).eq("type", "reply").gte("created_at", month),
    ]);
    if (usageToday.error) throw usageToday.error;
    const sent = sentMonth ?? 0;
    return {
      id: row.id,
      name: row.display_name || row.email.split("@")[0],
      email: row.email,
      provider: row.provider,
      status: row.status,
      dailyLimit: row.daily_limit,
      sentToday: usageToday.data?.sent_count ?? 0,
      rampDay: row.ramp_day,
      replyRate: sent ? Number((((replies ?? 0) / sent) * 100).toFixed(1)) : 0,
      lastSync: row.last_sync_at ? new Date(row.last_sync_at).toLocaleString() : "Not synced yet",
    } as Mailbox;
  }));
}

export async function listCampaigns(): Promise<Campaign[]> {
  if (env.demoMode) return demoCampaigns;
  const { supabase, user } = await pageUser();
  const { data, error } = await supabase.from("campaigns").select("id,name,status,mailbox_id,created_at,mailboxes(email)").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) throw error;
  return Promise.all((data ?? []).map(async (row: any) => {
    const [{ count: contacts }, { count: sent }, { count: replies }] = await Promise.all([
      supabase.from("campaign_contacts").select("id", { count: "exact", head: true }).eq("campaign_id", row.id),
      supabase.from("campaign_contacts").select("id", { count: "exact", head: true }).eq("campaign_id", row.id).in("status", ["sent", "replied"]),
      supabase.from("campaign_contacts").select("id", { count: "exact", head: true }).eq("campaign_id", row.id).eq("status", "replied"),
    ]);
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      mailbox: row.mailboxes?.email ?? "Mailbox",
      contacts: contacts ?? 0,
      sent: sent ?? 0,
      replies: replies ?? 0,
      scheduledFor: row.status === "running" ? "Running now" : row.status === "scheduled" ? "Scheduled queue" : row.status,
    } as Campaign;
  }));
}

export async function listContacts(): Promise<Contact[]> {
  if (env.demoMode) return demoContacts;
  const { supabase, user } = await pageUser();
  const { data, error } = await supabase.from("contacts").select("id,email,first_name,last_name,company,status").eq("user_id", user.id).order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: [row.first_name, row.last_name].filter(Boolean).join(" ") || "—",
    email: row.email,
    company: row.company ?? "—",
    status: row.status,
  })) as Contact[];
}

export async function listActivity(): Promise<ActivityItem[]> {
  if (env.demoMode) return demoActivity;
  const { supabase, user } = await pageUser();
  const { data, error } = await supabase.from("message_events").select("id,type,metadata,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const meta = row.metadata ?? {};
    const titleMap: Record<string, string> = {
      sent: "Message sent", reply: "Reply received", bounce: "Bounce recorded", failed: "Send failed",
      connected: "Mailbox connected", warning: "Mailbox warning", unsubscribed: "Contact unsubscribed",
      sync_failed: "Mailbox sync failed", automation: "Automation executed",
      auto_reply_skipped: "Auto-reply skipped", health: "Mailbox health updated",
      open: "Tracked open", click: "Tracked click", complaint: "Spam complaint detected", placement: "Placement test", deliverability: "Deliverability check",
    };
    const warningTypes = new Set(["failed", "warning", "sync_failed", "auto_reply_skipped", "health", "complaint"]);
    const activityType = ["sent", "reply", "bounce", "connected"].includes(row.type)
      ? row.type
      : warningTypes.has(row.type) ? "warning" : "connected";
    return {
      id: row.id,
      type: activityType as ActivityItem["type"],
      title: titleMap[row.type] ?? "Activity",
      detail: meta.reason ?? meta.subject ?? meta.to ?? "Mailbox event",
      time: new Date(row.created_at).toLocaleString(),
    };
  });
}

export async function listTemplates() {
  if (env.demoMode) return [
    { id: "t1", name: "Simple introduction", subject: "Quick question about {{company}}", body: "Hi {{first_name}},\n\nI had a quick idea for {{company}}." },
    { id: "t2", name: "Website improvement", subject: "A small idea for {{company}}", body: "Hi {{first_name}},\n\nI noticed a small opportunity on your website." },
    { id: "t3", name: "Follow-up #1", subject: "Following up", body: "Hi {{first_name}},\n\nJust following up on my previous note." },
  ];
  const { supabase, user } = await pageUser();
  const { data, error } = await supabase.from("templates").select("id,name,subject,body").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listThreads() {
  if (env.demoMode) return [
    { id: "demo-thread-1", subject: "Website redesign proposal", mailbox: "hamza@northstaragency.com", participant: "olivia@example.org", preview: "Thanks for sending this over. Could you also confirm the timeline?", unread: 1, status: "open", time: "8 min ago" },
    { id: "demo-thread-2", subject: "Re: SEO audit for Brooks Dental", mailbox: "sales@northstaragency.com", participant: "daniel@example.org", preview: "Yes, Thursday afternoon works for me.", unread: 0, status: "open", time: "42 min ago" },
    { id: "demo-thread-3", subject: "Quick question about Lewis Legal", mailbox: "northstar.outreach@gmail.com", participant: "emma@example.org", preview: "Please send the details to our office manager.", unread: 0, status: "open", time: "Yesterday" },
  ];
  const { supabase, user } = await pageUser();
  const { data, error } = await supabase.from("mail_threads").select("id,subject,participants,unread_count,status,last_message_at,mailboxes(email),mail_messages(body_text,from_email,created_at)").eq("user_id", user.id).order("last_message_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const msgs = Array.isArray(row.mail_messages) ? row.mail_messages.sort((a: any, b: any) => +new Date(b.created_at) - +new Date(a.created_at)) : [];
    const latest = msgs[0];
    const participants = Array.isArray(row.participants) ? row.participants : [];
    return { id: row.id, subject: row.subject, mailbox: row.mailboxes?.email ?? "Mailbox", participant: latest?.from_email ?? participants[0] ?? "Unknown", preview: latest?.body_text?.slice(0, 140) ?? "", unread: row.unread_count, status: row.status, time: new Date(row.last_message_at).toLocaleString() };
  });
}

export async function getThread(threadId: string) {
  if (env.demoMode) return {
    id: threadId,
    subject: "Website redesign proposal",
    mailboxId: "demo-mailbox-1",
    mailbox: "hamza@northstaragency.com",
    participant: "olivia@example.org",
    messages: [
      { id: "m1", direction: "outbound", from: "hamza@northstaragency.com", body: "Hi Olivia,\n\nI had a quick idea for improving the conversion flow on your website. Happy to send a short breakdown if useful.\n\nBest,\nHamza", time: "Today, 10:14" },
      { id: "m2", direction: "inbound", from: "olivia@example.org", body: "Hi Hamza,\n\nThanks for sending this over. Could you also confirm the timeline and what would be included?\n\nOlivia", time: "Today, 10:31" },
    ],
  };
  const { supabase, user } = await pageUser();
  const { data: thread, error } = await supabase.from("mail_threads").select("id,subject,participants,mailbox_id,mailboxes(email)").eq("id", threadId).eq("user_id", user.id).single();
  if (error) throw error;
  const { data: messages, error: messageError } = await supabase.from("mail_messages").select("id,direction,from_email,body_text,created_at,provider_message_id,in_reply_to,references_header,is_ai_generated").eq("thread_id", threadId).eq("user_id", user.id).order("created_at", { ascending: true });
  if (messageError) throw messageError;
  await supabase.from("mail_threads").update({ unread_count: 0 }).eq("id", threadId);
  await supabase.from("mail_messages").update({ is_read: true }).eq("thread_id", threadId).eq("direction", "inbound");
  const participants = Array.isArray(thread.participants) ? thread.participants : [];
  const mailboxEmail = (thread as any).mailboxes?.email ?? "";
  return { id: thread.id, subject: thread.subject, mailboxId: thread.mailbox_id, mailbox: mailboxEmail, participant: participants.find((p: string) => p.toLowerCase() !== mailboxEmail.toLowerCase()) ?? participants[0] ?? "", messages: (messages ?? []).map((m: any) => ({ id: m.id, direction: m.direction, from: m.from_email, body: m.body_text, time: new Date(m.created_at).toLocaleString(), providerMessageId: m.provider_message_id, references: m.references_header, ai: m.is_ai_generated })) };
}

export async function listAutomationRules() {
  if (env.demoMode) return [
    { id: "r1", name: "AI draft for known clients", enabled: true, trigger_type: "inbound_email", priority: 10, conditions: { knownContact: true }, actions: [{ type: "ai_reply", mode: "draft" }] },
    { id: "r2", name: "Archive newsletters", enabled: true, trigger_type: "inbound_email", priority: 50, conditions: { subjectContains: "newsletter" }, actions: [{ type: "archive" }] },
  ];
  const { supabase, user } = await pageUser();
  const { data, error } = await supabase.from("automation_rules").select("*").eq("user_id", user.id).order("priority");
  if (error) throw error;
  return data ?? [];
}

export async function listScheduledMessages() {
  if (env.demoMode) return [
    { id: "s1", subject: "Re: Website redesign proposal", to_emails: ["olivia@example.org"], status: "draft", scheduled_at: new Date().toISOString(), is_ai_generated: true },
    { id: "s2", subject: "Project follow-up", to_emails: ["daniel@example.org"], status: "scheduled", scheduled_at: new Date(Date.now()+3600000).toISOString(), is_ai_generated: false },
  ];
  const { supabase, user } = await pageUser();
  const { data, error } = await supabase.from("scheduled_messages").select("id,subject,to_emails,status,scheduled_at,is_ai_generated,mailboxes(email)").eq("user_id", user.id).order("scheduled_at", { ascending: true }).limit(100);
  if (error) throw error;
  return data ?? [];
}

export async function listToneProfiles() {
  if (env.demoMode) return [{ id: "tone-demo", name: "Hamza — concise", instructions: "Short, direct, friendly. Use simple English. Avoid hype. Usually 2–4 short paragraphs.", is_default: true, example_snippets: ["Thanks for the update. That works for me. Please send the final details when ready."] }];
  const { supabase, user } = await pageUser();
  const { data, error } = await supabase.from("tone_profiles").select("*").eq("user_id", user.id).order("is_default", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}


export async function getDashboardStats() {
  if (env.demoMode) return { repliesWeek: 19, suppressed: 14 };
  const { supabase, user } = await pageUser();
  const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [{ count: repliesWeek }, { count: suppressed }] = await Promise.all([
    supabase.from("message_events").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("type", "reply").gte("created_at", week),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", user.id).in("status", ["bounced", "unsubscribed", "complained"]),
  ]);
  return { repliesWeek: repliesWeek ?? 0, suppressed: suppressed ?? 0 };
}

export async function getWorkspaceSettings() {
  if (env.demoMode) return { workspace_name: "Northstar Agency", default_timezone: "America/New_York", default_daily_limit: 20, default_send_window_start: "09:00", default_send_window_end: "17:00", open_tracking_enabled: true, click_tracking_enabled: true };
  const { supabase, user } = await pageUser();
  const { data, error } = await supabase.from("workspace_settings").select("*").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return data ?? { workspace_name: "My Workspace", default_timezone: "UTC", default_daily_limit: 20, default_send_window_start: "09:00", default_send_window_end: "17:00", open_tracking_enabled: false, click_tracking_enabled: false };
}

export async function getAiSettings() {
  if (env.demoMode) return {
    reply_mode: "draft",
    max_auto_replies_per_day: 10,
    max_ai_drafts_per_day: 50,
    auto_reply_delay_minutes: 5,
    timezone: "Asia/Karachi",
    business_hours_start: "09:00",
    business_hours_end: "18:00",
    require_known_contact: true,
  };
  const { supabase, user } = await pageUser();
  const { data, error } = await supabase.from("ai_settings")
    .select("reply_mode,max_auto_replies_per_day,max_ai_drafts_per_day,auto_reply_delay_minutes,timezone,business_hours_start,business_hours_end,require_known_contact")
    .eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return data ?? {
    reply_mode: "draft",
    max_auto_replies_per_day: 10,
    max_ai_drafts_per_day: 50,
    auto_reply_delay_minutes: 5,
    timezone: "UTC",
    business_hours_start: "09:00",
    business_hours_end: "18:00",
    require_known_contact: true,
  };
}

export async function getDeliverabilityOverview() {
  if (env.demoMode) {
    return {
      metrics: { score: 82, sent30d: 1840, bounceRate: 1.2, replyRate: 7.4, openRate: 38.6, clickRate: 5.8, complaintRate: 0.05 },
      domains: [
        { id: "d1", domain: "northstaragency.com", health_score: 90, spf_status: "pass", dkim_status: "pass", dmarc_status: "pass", mx_status: "pass", last_checked_at: new Date().toISOString(), details: {} },
        { id: "d2", domain: "northstarhq.com", health_score: 70, spf_status: "pass", dkim_status: "unknown", dmarc_status: "warning", mx_status: "pass", last_checked_at: new Date().toISOString(), details: {} },
      ],
      mailboxes: demoMailboxes.map((m) => ({ id: m.id, email: m.email, provider: m.provider, status: m.status })),
      seeds: [
        { id: "s1", mailbox_id: "mb-2", label: "Sales seed", provider_hint: "custom", mailboxes: { email: "sales@northstaragency.com" } },
        { id: "s2", mailbox_id: "mb-3", label: "Gmail seed", provider_hint: "gmail", mailboxes: { email: "northstar.outreach@gmail.com" } },
      ],
      tests: [{ id: "pt1", marker: "MP-84A1D2", subject: "[MP-84A1D2] MailPilot inbox placement test", status: "completed", created_at: new Date(Date.now()-3600000).toISOString(), mailboxes: { email: "hamza@northstaragency.com" }, placement_results: [
        { id: "pr1", recipient_email: "sales@northstaragency.com", placement: "inbox", matched_folder: "INBOX", details: { authentication: { spf: "pass", dkim: "pass", dmarc: "pass" } }, seed_inboxes: { label: "Sales seed", provider_hint: "custom" } },
        { id: "pr2", recipient_email: "northstar.outreach@gmail.com", placement: "spam", matched_folder: "[Gmail]/Spam", details: { authentication: { spf: "pass", dkim: "pass", dmarc: "pass" } }, seed_inboxes: { label: "Gmail seed", provider_hint: "gmail" } },
      ] }],
      tracking: { enabledOpen: true, enabledClick: true, trackedMessages: 420, openedMessages: 162, clickedMessages: 24 },
    };
  }

  const { supabase, user } = await pageUser();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [mailboxRes, domainRes, seedRes, testRes, settingsRes, sentRes, bounceRes, replyRes, complaintRes, tokenRes] = await Promise.all([
    supabase.from("mailboxes").select("id,email,provider,status").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("deliverability_domains").select("*").eq("user_id", user.id).order("last_checked_at", { ascending: false, nullsFirst: false }),
    supabase.from("seed_inboxes").select("id,mailbox_id,label,provider_hint,active,mailboxes(email)").eq("user_id", user.id).eq("active", true).order("created_at", { ascending: true }),
    supabase.from("placement_tests").select("id,marker,subject,status,created_at,completed_at,mailboxes:mailboxes!placement_tests_source_mailbox_id_fkey(email),placement_results(id,recipient_email,placement,matched_folder,received_at,details,seed_inboxes(label,provider_hint))").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("workspace_settings").select("open_tracking_enabled,click_tracking_enabled").eq("user_id", user.id).maybeSingle(),
    supabase.from("message_events").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("type", "sent").gte("created_at", since),
    supabase.from("message_events").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("type", "bounce").gte("created_at", since),
    supabase.from("message_events").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("type", "reply").gte("created_at", since),
    supabase.from("message_events").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("type", "complaint").gte("created_at", since),
    supabase.from("message_tracking_tokens").select("id,created_at,message_tracking_events(event_type)").eq("user_id", user.id).gte("created_at", since),
  ]);
  for (const result of [mailboxRes, domainRes, seedRes, testRes, settingsRes, sentRes, bounceRes, replyRes, complaintRes, tokenRes]) {
    if ((result as any).error) throw (result as any).error;
  }
  const sent30d = sentRes.count ?? 0;
  const bounces = bounceRes.count ?? 0;
  const replies = replyRes.count ?? 0;
  const complaints = complaintRes.count ?? 0;
  const tokens = tokenRes.data ?? [];
  const openedMessages = tokens.filter((t: any) => (t.message_tracking_events ?? []).some((e: any) => e.event_type === "open")).length;
  const clickedMessages = tokens.filter((t: any) => (t.message_tracking_events ?? []).some((e: any) => e.event_type === "click")).length;
  const trackedMessages = tokens.length;
  const domains = domainRes.data ?? [];
  const authScore = domains.length ? domains.reduce((sum: number, d: any) => sum + Number(d.health_score || 0), 0) / domains.length : 50;
  const bounceRate = sent30d ? (bounces / sent30d) * 100 : 0;
  const complaintRate = sent30d ? (complaints / sent30d) * 100 : 0;
  const qualityPenalty = Math.min(35, bounceRate * 5 + complaintRate * 100);
  const score = Math.max(0, Math.min(100, Math.round(authScore - qualityPenalty + (replies > 0 ? 5 : 0))));
  return {
    metrics: {
      score,
      sent30d,
      bounceRate: Number(bounceRate.toFixed(2)),
      replyRate: sent30d ? Number(((replies / sent30d) * 100).toFixed(2)) : 0,
      openRate: trackedMessages ? Number(((openedMessages / trackedMessages) * 100).toFixed(2)) : 0,
      clickRate: trackedMessages ? Number(((clickedMessages / trackedMessages) * 100).toFixed(2)) : 0,
      complaintRate: Number(complaintRate.toFixed(3)),
    },
    domains,
    mailboxes: mailboxRes.data ?? [],
    seeds: seedRes.data ?? [],
    tests: testRes.data ?? [],
    tracking: { enabledOpen: Boolean(settingsRes.data?.open_tracking_enabled), enabledClick: Boolean(settingsRes.data?.click_tracking_enabled), trackedMessages, openedMessages, clickedMessages },
  };
}

export async function getProviderReputationOverview() {
  if (env.demoMode) return {
    integration: { id: "gpm1", provider: "google_postmaster", account_email: "admin@northstaragency.com", status: "connected", last_sync_at: new Date(Date.now()-2*3600000).toISOString() },
    snapshots: [{ id: "snap1", provider: "google_postmaster", period_start: "2026-09-09", period_end: "2026-09-15", spam_rate: 0.0008, delivery_error_rate: 0.012, spf_success_rate: 0.998, dkim_success_rate: 0.996, dmarc_success_rate: 0.994, tls_rate: 1, compliance: { deliverabilityStatus: { state: { status: "COMPLIANT" } } }, deliverability_domains: { domain: "northstaragency.com" }, created_at: new Date().toISOString() }],
  };
  const { supabase, user } = await pageUser();
  const [integrationRes, snapshotRes] = await Promise.all([
    supabase.from("provider_integrations").select("id,provider,account_email,status,last_sync_at,metadata").eq("user_id", user.id).eq("provider", "google_postmaster").maybeSingle(),
    supabase.from("provider_reputation_snapshots").select("id,provider,period_start,period_end,spam_rate,delivery_error_rate,spf_success_rate,dkim_success_rate,dmarc_success_rate,tls_rate,compliance,created_at,deliverability_domains(domain)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (integrationRes.error) throw integrationRes.error;
  if (snapshotRes.error) throw snapshotRes.error;
  return { integration: integrationRes.data, snapshots: snapshotRes.data ?? [] };
}
