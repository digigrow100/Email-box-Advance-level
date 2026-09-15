import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { boundedInt, boundedText, jsonBody } from "@/lib/validation";

function validTimeZone(value: unknown) {
  const zone = String(value || "UTC").slice(0, 100);
  try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(new Date()); return zone; }
  catch { throw new Error("Invalid timezone"); }
}
function validTime(value: unknown, fallback: string) {
  const text = String(value || fallback);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw new Error("Time must use HH:MM");
  return text;
}

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase.from("workspace_settings").select("*").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ settings: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load settings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await jsonBody<any>(request, 32_000);
    const row = {
      user_id: user.id,
      workspace_name: boundedText(body.workspaceName || "My Workspace", "Workspace name", 120),
      default_timezone: validTimeZone(body.defaultTimezone || "UTC"),
      default_daily_limit: boundedInt(body.defaultDailyLimit, 20, 1, 50),
      default_send_window_start: validTime(body.defaultSendWindowStart, "09:00"),
      default_send_window_end: validTime(body.defaultSendWindowEnd, "17:00"),
      open_tracking_enabled: Boolean(body.openTrackingEnabled),
      click_tracking_enabled: Boolean(body.clickTrackingEnabled),
    };
    const { error } = await supabase.from("workspace_settings").upsert(row, { onConflict: "user_id" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save settings" }, { status: 400 });
  }
}
