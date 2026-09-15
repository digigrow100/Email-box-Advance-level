import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { postmasterAuthorizationUrl } from "@/lib/deliverability/google-postmaster";
import { requireUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireUser();
    const state = crypto.randomBytes(24).toString("hex");
    const verifier = crypto.randomBytes(48).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const store = await cookies();
    const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" };
    store.set("postmaster_oauth_state", state, options);
    store.set("postmaster_oauth_verifier", verifier, options);
    return NextResponse.redirect(postmasterAuthorizationUrl(state, challenge));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start Postmaster connection" }, { status: 500 }); }
}
