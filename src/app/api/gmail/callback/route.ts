import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { encryptJson } from "@/lib/crypto";
import { exchangeGmailCode, getGoogleEmail } from "@/lib/mail/gmail";
import { requireUser } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const store = await cookies();
    const expected = store.get("gmail_oauth_state")?.value;
    const verifier = store.get("gmail_oauth_verifier")?.value;
    store.delete("gmail_oauth_state");
    store.delete("gmail_oauth_verifier");
    if (!code || !state || !expected || !verifier || state !== expected) throw new Error("Invalid OAuth state");

    const { supabase, user } = await requireUser();
    const tokens = await exchangeGmailCode(code, verifier);
    if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Revoke the app connection and try again with consent.");
    const profile = await getGoogleEmail(tokens.access_token);
    const googleEmail = profile.email;
    if (!googleEmail) throw new Error("Google account did not return an email address");

    const { data: workspace, error: workspaceError } = await supabase.from("workspace_settings")
      .select("default_daily_limit,default_timezone")
      .eq("user_id", user.id).maybeSingle();
    if (workspaceError) throw workspaceError;
    const targetDailyLimit = Math.max(5, Math.min(50, Number(workspace?.default_daily_limit ?? 30)));
    const timezone = String(workspace?.default_timezone || "UTC").slice(0, 100);

    const { data, error } = await supabase.from("mailboxes").upsert({
      user_id: user.id,
      provider: "gmail",
      email: googleEmail.toLowerCase(),
      display_name: profile.name ?? null,
      credential_blob: encryptJson({ refreshToken: tokens.refresh_token }),
      imap_host: "imap.gmail.com",
      imap_port: 993,
      imap_secure: true,
      smtp_host: "smtp.gmail.com",
      smtp_port: 465,
      smtp_secure: true,
      daily_limit: 5,
      target_daily_limit: targetDailyLimit,
      timezone,
      ramp_enabled: true,
      ramp_day: 1,
      status: "healthy",
      last_error: null,
      consecutive_failures: 0,
    }, { onConflict: "user_id,email" }).select("id,email").single();
    if (error) throw error;
    await writeAudit(supabase, { userId: user.id, actorType: "user", action: "mailbox.connected", entityType: "mailbox", entityId: data.id, metadata: { provider: "gmail", email: data.email } });
    return NextResponse.redirect(new URL("/mailboxes?connected=gmail", request.url));
  } catch (error) {
    return NextResponse.redirect(new URL(`/mailboxes?error=${encodeURIComponent(error instanceof Error ? error.message : "Gmail connection failed")}`, request.url));
  }
}
