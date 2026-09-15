import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { syncMailboxToDatabase } from "@/lib/mail/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const { data: mailboxes, error } = await supabase.from("mailboxes").select("*").eq("user_id", user.id).eq("sync_enabled", true).in("status", ["healthy", "warning"]);
    if (error) throw error;
    let inserted = 0;
    let errors = 0;
    for (const mailbox of mailboxes ?? []) {
      try {
        const result = await syncMailboxToDatabase(supabase, mailbox, 100);
        inserted += result.inserted;
      } catch (error) {
        errors++;
        const reason = error instanceof Error ? error.message.slice(0, 500) : "Sync failed";
        const failures = Number(mailbox.consecutive_failures ?? 0) + 1;
        await supabase.from("mailboxes").update({
          status: failures >= 5 ? "error" : "warning",
          consecutive_failures: failures,
          last_error: reason,
          last_error_at: new Date().toISOString(),
          sync_claimed_at: null,
        }).eq("id", mailbox.id).eq("user_id", user.id);
        await supabase.from("message_events").insert({ user_id: user.id, mailbox_id: mailbox.id, type: "sync_failed", metadata: { source: "manual_sync", reason, failures } });
      }
    }
    const accept = request.headers.get("accept") ?? "";
    if (accept.includes("text/html")) return NextResponse.redirect(new URL(`/inbox?synced=${inserted}&errors=${errors}`, request.url), 303);
    return NextResponse.json({ ok: true, inserted, errors });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sync failed" }, { status: 500 });
  }
}
