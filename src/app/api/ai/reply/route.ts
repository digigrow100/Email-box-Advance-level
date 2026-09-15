import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { generateAiReply } from "@/lib/ai";
import { boundedText, jsonBody } from "@/lib/validation";
import { dateKeyInTimeZone } from "@/lib/time";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let quotaReserved = false;
  let quotaDate = "";
  let quotaUserId = "";
  let quotaClient: any = null;
  try {
    const { supabase, user } = await requireUser();
    quotaClient = supabase;
    quotaUserId = user.id;
    const payload = await jsonBody<any>(request, 32_000);
    const threadId = boundedText(payload.threadId, "Thread", 100);

    const [{ data: thread, error: threadError }, { data: messages, error: messageError }, { data: settings, error: settingsError }] = await Promise.all([
      supabase.from("mail_threads").select("id,subject,mailbox_id,mailboxes(email)").eq("id", threadId).eq("user_id", user.id).single(),
      supabase.from("mail_messages").select("direction,from_email,body_text").eq("thread_id", threadId).eq("user_id", user.id).order("created_at", { ascending: true }).limit(20),
      supabase.from("ai_settings").select("default_tone_profile_id,timezone").eq("user_id", user.id).maybeSingle(),
    ]);
    if (threadError || !thread) throw threadError ?? new Error("Thread not found");
    if (messageError) throw messageError;
    if (settingsError) throw settingsError;

    const latest = [...(messages ?? [])].reverse().find((message: any) => message.direction === "inbound");
    if (!latest) return NextResponse.json({ error: "No inbound email found in this thread" }, { status: 400 });

    quotaDate = dateKeyInTimeZone(settings?.timezone ?? "UTC");
    const { data: reserved, error: reserveError } = await supabase.rpc("reserve_ai_draft", { p_user_id: user.id, p_usage_date: quotaDate });
    if (reserveError) throw reserveError;
    if (!reserved) return NextResponse.json({ error: "Daily AI draft limit reached" }, { status: 429 });
    quotaReserved = true;

    let tone: any = null;
    if (settings?.default_tone_profile_id) {
      const { data, error } = await supabase.from("tone_profiles").select("*").eq("id", settings.default_tone_profile_id).eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      tone = data;
    }

    const mailboxEmail = (thread as any).mailboxes?.email ?? "";
    const body = await generateAiReply({
      senderEmail: latest.from_email,
      recipientEmail: mailboxEmail,
      subject: thread.subject,
      inboundText: latest.body_text,
      recentThread: (messages ?? []).map((message: any) => ({ direction: message.direction, text: message.body_text })),
      tone: tone ? {
        name: tone.name,
        instructions: tone.instructions,
        examples: Array.isArray(tone.example_snippets) ? tone.example_snippets : [],
      } : undefined,
    });
    quotaReserved = false; // successful draft consumes the reserved quota
    return NextResponse.json({ body });
  } catch (error) {
    if (quotaReserved && quotaClient && quotaUserId && quotaDate) {
      try { await quotaClient.rpc("release_ai_draft", { p_user_id: quotaUserId, p_usage_date: quotaDate }); } catch { /* best effort */ }
    }
    const message = error instanceof Error ? error.message : "AI reply failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
