import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateAiReply } from "@/lib/ai";
import { autoReplySafety } from "@/lib/mail/safety";
import { writeAudit } from "@/lib/audit";
import { runtimeCredentials, type StoredMailbox } from "@/lib/mail/account";
import { archiveImapMessage, markImapMessageSeen } from "@/lib/mail/imap";

type RuleAction = Record<string, unknown> & { type?: string; mode?: string; toneProfileId?: string; instructions?: string; delayMinutes?: number };

type Rule = {
  id: string;
  user_id: string;
  name: string;
  enabled: boolean;
  conditions: Record<string, unknown>;
  actions: RuleAction[];
  priority: number;
  cooldown_minutes: number;
};

type AutomationThread = { id: string; user_id?: string; [key: string]: unknown };
type AutomationMessage = {
  id: string;
  from_email: string;
  subject: string;
  body_text: string;
  provider_uid?: string | number | null;
  provider_message_id?: string | null;
  references_header?: string | null;
  [key: string]: unknown;
};

function textMatch(value: string, query?: unknown) {
  if (typeof query !== "string" || !query.trim()) return true;
  return value.toLowerCase().includes(query.toLowerCase());
}

export function ruleMatches(rule: Rule, context: { from: string; subject: string; body: string; mailboxId: string; knownContact: boolean }) {
  const c = rule.conditions ?? {};
  if (typeof c.mailboxId === "string" && c.mailboxId && c.mailboxId !== context.mailboxId) return false;
  if (c.fromContains && !textMatch(context.from, c.fromContains)) return false;
  if (c.subjectContains && !textMatch(context.subject, c.subjectContains)) return false;
  if (c.bodyContains && !textMatch(context.body, c.bodyContains)) return false;
  if (c.knownContact === true && !context.knownContact) return false;
  return true;
}

export async function processInboundAutomations(supabase: SupabaseClient, input: {
  userId: string;
  mailbox: StoredMailbox;
  thread: AutomationThread;
  message: AutomationMessage;
}) {
  const [{ data: rules, error: rulesError }, { data: contact }, { data: aiSettings }] = await Promise.all([
    supabase.from("automation_rules").select("*").eq("user_id", input.userId).eq("enabled", true).eq("trigger_type", "inbound_email").order("priority"),
    supabase.from("contacts").select("id,status").eq("user_id", input.userId).eq("email", input.message.from_email).maybeSingle(),
    supabase.from("ai_settings").select("*").eq("user_id", input.userId).maybeSingle(),
  ]);
  if (rulesError) throw rulesError;

  const knownContact = Boolean(contact && ["active", "replied"].includes(contact.status));
  let matched = 0;

  for (const rule of (rules ?? []) as Rule[]) {
    if (!ruleMatches(rule, {
      from: input.message.from_email,
      subject: input.message.subject,
      body: input.message.body_text,
      mailboxId: input.mailbox.id,
      knownContact,
    })) continue;

    if (rule.cooldown_minutes > 0) {
      const cutoff = new Date(Date.now() - rule.cooldown_minutes * 60_000).toISOString();
      const { count } = await supabase.from("automation_runs").select("id", { count: "exact", head: true }).eq("rule_id", rule.id).eq("thread_id", input.thread.id).gte("created_at", cutoff);
      if ((count ?? 0) > 0) continue;
    }

    matched++;
    await supabase.from("automation_runs").insert({
      user_id: input.userId,
      rule_id: rule.id,
      mailbox_id: input.mailbox.id,
      thread_id: input.thread.id,
      message_id: input.message.id,
      status: "matched",
      detail: { rule: rule.name },
    });

    for (const action of rule.actions ?? []) {
      if (action.type === "mark_read") {
        await supabase.from("mail_messages").update({ is_read: true }).eq("id", input.message.id).eq("user_id", input.userId);
        await supabase.from("mail_threads").update({ unread_count: 0 }).eq("id", input.thread.id).eq("user_id", input.userId);
        if (input.message.provider_uid) {
          try {
            const credentials = await runtimeCredentials(input.mailbox);
            await markImapMessageSeen(credentials.imap, Number(input.message.provider_uid));
          } catch (providerError) {
            await supabase.from("message_events").insert({ user_id: input.userId, mailbox_id: input.mailbox.id, type: "warning", metadata: { reason: "Provider mark-read failed", detail: providerError instanceof Error ? providerError.message.slice(0, 300) : "Unknown provider error", messageId: input.message.id } });
          }
        }
        continue;
      }

      if (action.type === "archive") {
        await supabase.from("mail_threads").update({ status: "archived" }).eq("id", input.thread.id).eq("user_id", input.userId);
        if (input.message.provider_uid) {
          try {
            const credentials = await runtimeCredentials(input.mailbox);
            const archived = await archiveImapMessage(credentials.imap, Number(input.message.provider_uid));
            if (!archived) await supabase.from("message_events").insert({ user_id: input.userId, mailbox_id: input.mailbox.id, type: "warning", metadata: { reason: "Provider archive folder unavailable; archived locally only", messageId: input.message.id } });
          } catch (providerError) {
            await supabase.from("message_events").insert({ user_id: input.userId, mailbox_id: input.mailbox.id, type: "warning", metadata: { reason: "Provider archive failed; archived locally only", detail: providerError instanceof Error ? providerError.message.slice(0, 300) : "Unknown provider error", messageId: input.message.id } });
          }
        }
        continue;
      }

      if (action.type !== "ai_reply") continue;

      const safety = autoReplySafety({ from: input.message.from_email, subject: input.message.subject });
      if (!safety.safe) {
        await supabase.from("message_events").insert({
          user_id: input.userId,
          mailbox_id: input.mailbox.id,
          type: "auto_reply_skipped",
          metadata: { reason: safety.reason, messageId: input.message.id, ruleId: rule.id },
        });
        continue;
      }

      let mode = action.mode ?? aiSettings?.reply_mode ?? "draft";
      if (mode === "off") continue;

      // Global safety setting: unknown/suppressed contacts may receive drafts, never automatic sends.
      if (mode === "auto_send" && aiSettings?.require_known_contact !== false && !knownContact) mode = "draft";
      if (mode === "auto_send" && contact && ["bounced", "unsubscribed", "complained"].includes(contact.status)) mode = "draft";

      const toneId = action.toneProfileId ?? aiSettings?.default_tone_profile_id ?? null;
      const toneQuery = toneId
        ? await supabase.from("tone_profiles").select("*").eq("id", toneId).eq("user_id", input.userId).maybeSingle()
        : { data: null };
      const tone = toneQuery.data;

      const { data: recent, error: recentError } = await supabase.from("mail_messages").select("direction,body_text").eq("thread_id", input.thread.id).eq("user_id", input.userId).order("created_at", { ascending: true }).limit(8);
      if (recentError) throw recentError;

      const body = await generateAiReply({
        senderEmail: input.message.from_email,
        recipientEmail: input.mailbox.email,
        subject: input.message.subject,
        inboundText: input.message.body_text,
        recentThread: ((recent ?? []) as Array<{ direction: "inbound" | "outbound"; body_text: string }>).map((m) => ({ direction: m.direction, text: m.body_text })),
        tone: tone ? {
          name: tone.name,
          instructions: tone.instructions,
          examples: Array.isArray(tone.example_snippets) ? tone.example_snippets : [],
        } : undefined,
        extraInstructions: typeof action.instructions === "string" ? action.instructions : undefined,
      });

      const delay = Math.max(0, Math.min(1440, Number(action.delayMinutes ?? aiSettings?.auto_reply_delay_minutes ?? 5)));
      const scheduledAt = mode === "auto_send" ? new Date(Date.now() + delay * 60_000).toISOString() : new Date().toISOString();
      const { data: scheduled, error: scheduledError } = await supabase.from("scheduled_messages").insert({
        user_id: input.userId,
        mailbox_id: input.mailbox.id,
        thread_id: input.thread.id,
        to_emails: [input.message.from_email],
        subject: /^re:/i.test(input.message.subject) ? input.message.subject : `Re: ${input.message.subject}`,
        body_text: body,
        in_reply_to: input.message.provider_message_id,
        references_header: [input.message.references_header, input.message.provider_message_id].filter(Boolean).join(" "),
        tone_profile_id: tone?.id ?? null,
        is_ai_generated: true,
        status: mode === "auto_send" ? "scheduled" : "draft",
        scheduled_at: scheduledAt,
        metadata: { source: "automation", ruleId: rule.id, sourceMessageId: input.message.id },
      }).select("id").single();
      if (scheduledError) throw scheduledError;

      await supabase.from("automation_runs").insert({
        user_id: input.userId,
        rule_id: rule.id,
        mailbox_id: input.mailbox.id,
        thread_id: input.thread.id,
        message_id: input.message.id,
        status: mode === "auto_send" ? "scheduled" : "drafted",
        detail: { mode, scheduledMessageId: scheduled.id },
      });
      await writeAudit(supabase, {
        userId: input.userId,
        actorType: "automation",
        action: mode === "auto_send" ? "ai_reply.scheduled" : "ai_reply.drafted",
        entityType: "scheduled_message",
        entityId: scheduled.id,
        metadata: { ruleId: rule.id, threadId: input.thread.id },
      });
    }
  }
  return matched;
}
