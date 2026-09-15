import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { boundedInt, boundedText, jsonBody } from "@/lib/validation";

export async function PATCH(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await jsonBody<any>(request, 16_000);
    const mailboxId = boundedText(body.mailboxId, "Mailbox", 100);
    const target = boundedInt(body.targetDailyLimit, 30, 5, 50);
    const { data, error } = await supabase.from("mailboxes").update({ ramp_enabled: Boolean(body.enabled), target_daily_limit: target }).eq("id", mailboxId).eq("user_id", user.id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Mailbox not found");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update ramp" }, { status: 400 });
  }
}
