import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { gmailAuthorizationUrl } from "@/lib/mail/gmail";
import { requireUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

function base64Url(buffer: Buffer) {
  return buffer.toString("base64url");
}

export async function GET() {
  try {
    await requireUser();
    const state = crypto.randomBytes(24).toString("hex");
    const verifier = base64Url(crypto.randomBytes(48));
    const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
    const store = await cookies();
    const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" };
    store.set("gmail_oauth_state", state, options);
    store.set("gmail_oauth_verifier", verifier, options);
    return NextResponse.redirect(gmailAuthorizationUrl(state, challenge));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start Gmail connection" }, { status: 500 });
  }
}
