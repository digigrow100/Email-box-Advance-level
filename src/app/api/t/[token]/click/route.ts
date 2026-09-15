import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { anonymizedIpHash, verifyClickSignature } from "@/lib/deliverability/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const fallback = new URL("/", request.url);
  try {
    const { token } = await context.params;
    const url = new URL(request.url);
    const target = url.searchParams.get("u") || "";
    const signature = url.searchParams.get("s") || "";
    const parsed = new URL(target);
    if (!["http:", "https:"].includes(parsed.protocol) || !verifyClickSignature(token, target, signature)) return NextResponse.redirect(fallback);

    const db = createAdminClient();
    const { data: tracked } = await db.from("message_tracking_tokens").select("id,user_id,mail_message_id").eq("token", token).maybeSingle();
    if (tracked) {
      const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
      const ua = (request.headers.get("user-agent") || "").slice(0, 500);
      await db.from("message_tracking_events").insert({ user_id: tracked.user_id, tracking_token_id: tracked.id, event_type: "click", target_url: target.slice(0, 2000), user_agent: ua, ip_hash: anonymizedIpHash(forwarded) });
      const { data: message } = await db.from("mail_messages").select("mailbox_id,provider_message_id").eq("id", tracked.mail_message_id).maybeSingle();
      if (message) await db.from("message_events").insert({ user_id: tracked.user_id, mailbox_id: message.mailbox_id, type: "click", provider_message_id: message.provider_message_id, metadata: { mailMessageId: tracked.mail_message_id, target: target.slice(0, 1000) } });
    }
    return NextResponse.redirect(parsed);
  } catch {
    return NextResponse.redirect(fallback);
  }
}
