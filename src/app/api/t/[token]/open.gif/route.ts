import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { anonymizedIpHash } from "@/lib/deliverability/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const db = createAdminClient();
    const { data: tracked } = await db.from("message_tracking_tokens").select("id,user_id,mail_message_id").eq("token", token).maybeSingle();
    if (tracked) {
      const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
      const ua = (request.headers.get("user-agent") || "").slice(0, 500);
      await db.from("message_tracking_events").insert({
        user_id: tracked.user_id,
        tracking_token_id: tracked.id,
        event_type: "open",
        user_agent: ua,
        ip_hash: anonymizedIpHash(forwarded),
        metadata: { proxyHint: /googleimageproxy|applewebkit/i.test(ua) },
      });
      const { data: message } = await db.from("mail_messages").select("mailbox_id,provider_message_id").eq("id", tracked.mail_message_id).maybeSingle();
      if (message) await db.from("message_events").insert({ user_id: tracked.user_id, mailbox_id: message.mailbox_id, type: "open", provider_message_id: message.provider_message_id, metadata: { mailMessageId: tracked.mail_message_id } });
    }
  } catch { /* Tracking must never break image delivery. */ }
  return new NextResponse(PIXEL, { status: 200, headers: { "content-type": "image/gif", "cache-control": "no-store, max-age=0", "content-length": String(PIXEL.length) } });
}
