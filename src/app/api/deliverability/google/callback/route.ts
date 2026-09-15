import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { encryptJson } from "@/lib/crypto";
import { exchangePostmasterCode } from "@/lib/deliverability/google-postmaster";
import { getGoogleEmail } from "@/lib/mail/gmail";
import { requireUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const store = await cookies();
    const expected = store.get("postmaster_oauth_state")?.value;
    const verifier = store.get("postmaster_oauth_verifier")?.value;
    store.delete("postmaster_oauth_state"); store.delete("postmaster_oauth_verifier");
    if (!code || !state || !expected || !verifier || state !== expected) throw new Error("Invalid OAuth state");
    const { supabase, user } = await requireUser();
    const tokens = await exchangePostmasterCode(code, verifier);
    if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Revoke consent and connect again.");
    const profile = await getGoogleEmail(tokens.access_token);
    const { error } = await supabase.from("provider_integrations").upsert({
      user_id: user.id, provider: "google_postmaster", credential_blob: encryptJson({ refreshToken: tokens.refresh_token }), account_email: profile.email, status: "connected", last_sync_at: null,
    }, { onConflict: "user_id,provider" });
    if (error) throw error;
    return NextResponse.redirect(new URL("/deliverability?postmaster=connected", request.url));
  } catch (error) { return NextResponse.redirect(new URL(`/deliverability?postmaster_error=${encodeURIComponent(error instanceof Error ? error.message : "Connection failed")}`, request.url)); }
}
