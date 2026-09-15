import { NextResponse } from "next/server";
import { encryptJson } from "@/lib/crypto";
import { requireUser } from "@/lib/supabase/server";
import { testImapConnection } from "@/lib/mail/imap";
import { testSmtpConnection } from "@/lib/mail/smtp";
import { assertSafeMailHost } from "@/lib/mail/host-safety";
import { boundedInt, boundedText, jsonBody, requireEmail } from "@/lib/validation";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase.from("mailboxes")
      .select("id,provider,email,display_name,status,daily_limit,ramp_enabled,ramp_day,target_daily_limit,last_sync_at,last_successful_sync_at,last_successful_send_at,last_error,consecutive_failures,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ mailboxes: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load mailboxes" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await jsonBody(request, 64_000);
    const email = requireEmail(body.email);
    const displayName = boundedText(body.displayName, "Display name", 120, { required: false }) || null;
    const password = boundedText(body.password, "Password", 512);
    const imapPort = boundedInt(body.imapPort, 993, 1, 65535);
    const smtpPort = boundedInt(body.smtpPort, 465, 1, 65535);
    const imapHost = await assertSafeMailHost(body.imapHost, "imap", imapPort);
    const smtpHost = await assertSafeMailHost(body.smtpHost, "smtp", smtpPort);

    const imap = { host: imapHost.host, port: imapHost.port, secure: body.imapSecure !== false, user: email, pass: password };
    const smtp = { host: smtpHost.host, port: smtpHost.port, secure: body.smtpSecure !== false, user: email, pass: password };
    await Promise.all([testImapConnection(imap), testSmtpConnection(smtp)]);

    const credentialBlob = encryptJson({ password });
    const { data: workspace, error: workspaceError } = await supabase.from("workspace_settings")
      .select("default_daily_limit,default_timezone")
      .eq("user_id", user.id).maybeSingle();
    if (workspaceError) throw workspaceError;
    const target = boundedInt(body.targetDailyLimit, Number(workspace?.default_daily_limit ?? 30), 5, 50);
    const timezone = String(body.timezone || workspace?.default_timezone || "UTC").slice(0, 100);
    try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date()); }
    catch { throw new Error("Invalid timezone"); }
    const { data, error } = await supabase.from("mailboxes").insert({
      user_id: user.id,
      provider: "custom",
      email,
      display_name: displayName,
      credential_blob: credentialBlob,
      imap_host: imap.host,
      imap_port: imap.port,
      imap_secure: imap.secure,
      smtp_host: smtp.host,
      smtp_port: smtp.port,
      smtp_secure: smtp.secure,
      daily_limit: 5,
      target_daily_limit: target,
      ramp_enabled: true,
      ramp_day: 1,
      status: "healthy",
      timezone,
      consecutive_failures: 0,
      last_error: null,
    }).select("id,email,status,daily_limit").single();
    if (error) throw error;
    await writeAudit(supabase, { userId: user.id, actorType: "user", action: "mailbox.connected", entityType: "mailbox", entityId: data.id, metadata: { provider: "custom", email: data.email } });
    return NextResponse.json({ mailbox: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to connect mailbox" }, { status: 400 });
  }
}
