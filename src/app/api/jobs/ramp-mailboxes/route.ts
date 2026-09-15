import { NextResponse } from "next/server";
import { recommendedDailyLimit } from "@/lib/mail/ramp";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";


export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  const { data: mailboxes, error } = await supabase.from("mailboxes").select("id,user_id,ramp_day,ramp_enabled,target_daily_limit,daily_limit,status").eq("ramp_enabled", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let updated = 0;
  for (const mailbox of mailboxes ?? []) {
    if (mailbox.status === "paused" || mailbox.status === "error") continue;
    const nextDay = mailbox.ramp_day + 1;
    const nextLimit = recommendedDailyLimit(nextDay, mailbox.target_daily_limit);
    await supabase.from("mailboxes").update({ ramp_day: nextDay, daily_limit: nextLimit, updated_at: new Date().toISOString() }).eq("id", mailbox.id);
    updated++;
  }
  return NextResponse.json({ ok: true, updated });
}
