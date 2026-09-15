import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { boundedInt, jsonBody } from "@/lib/validation";

function validTimeZone(value: unknown) {
  const zone = String(value || "UTC").slice(0, 100);
  try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(new Date()); return zone; }
  catch { throw new Error("Invalid timezone"); }
}

function validTime(value: unknown, fallback: string) {
  const text = String(value || fallback);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw new Error("Business hours must use HH:MM");
  return text;
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await jsonBody(request, 32_000);
    const replyModes = ["off", "draft", "auto_send"] as const;
    const requestedReplyMode = String(body.replyMode ?? "");
    const row = {
      user_id: user.id,
      reply_mode: (replyModes as readonly string[]).includes(requestedReplyMode) ? requestedReplyMode : "draft",
      max_auto_replies_per_day: boundedInt(body.maxAutoRepliesPerDay, 10, 0, 100),
      max_ai_drafts_per_day: boundedInt(body.maxAiDraftsPerDay, 50, 0, 500),
      auto_reply_delay_minutes: boundedInt(body.autoReplyDelayMinutes, 5, 0, 1440),
      timezone: validTimeZone(body.timezone || "UTC"),
      business_hours_start: validTime(body.businessHoursStart, "09:00"),
      business_hours_end: validTime(body.businessHoursEnd, "18:00"),
      require_known_contact: body.requireKnownContact !== false,
    };
    const { error } = await supabase.from("ai_settings").upsert(row, { onConflict: "user_id" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save AI settings" }, { status: 400 });
  }
}
