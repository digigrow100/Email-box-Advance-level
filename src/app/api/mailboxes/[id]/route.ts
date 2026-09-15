import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { runtimeCredentials } from "@/lib/mail/account";
import { testImapConnection } from "@/lib/mail/imap";
import { testSmtpConnection } from "@/lib/mail/smtp";
import { assertSafeMailHost } from "@/lib/mail/host-safety";
import { jsonBody } from "@/lib/validation";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, user } = await requireUser();
    const body = await jsonBody<any>(request, 16_000);
    const { data: mailbox, error } = await supabase.from("mailboxes").select("*").eq("id", id).eq("user_id", user.id).single();
    if (error || !mailbox) throw new Error("Mailbox not found");

    if (body.action === "pause") {
      await supabase.from("mailboxes").update({ status: "paused" }).eq("id", id).eq("user_id", user.id);
      return NextResponse.json({ ok: true, status: "paused" });
    }
    if (body.action === "resume") {
      await supabase.from("mailboxes").update({ status: "warning", consecutive_failures: 0 }).eq("id", id).eq("user_id", user.id);
      return NextResponse.json({ ok: true, status: "warning" });
    }
    if (body.action === "retest") {
      await Promise.all([
        assertSafeMailHost(mailbox.imap_host, "imap", mailbox.imap_port),
        assertSafeMailHost(mailbox.smtp_host, "smtp", mailbox.smtp_port),
      ]);
      const credentials = await runtimeCredentials(mailbox);
      await Promise.all([testImapConnection(credentials.imap), testSmtpConnection(credentials.smtp)]);
      await supabase.from("mailboxes").update({ status: "healthy", consecutive_failures: 0, last_error: null, last_error_at: null }).eq("id", id).eq("user_id", user.id);
      return NextResponse.json({ ok: true, status: "healthy" });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Mailbox action failed" }, { status: 400 });
  }
}
