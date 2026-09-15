import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createAdminClient();
  const { data: contact, error } = await supabase.from("contacts").update({ status: "unsubscribed", updated_at: new Date().toISOString() }).eq("unsubscribe_token", token).select("id,user_id").single();
  if (error || !contact) return NextResponse.json({ error: "Invalid unsubscribe link" }, { status: 404 });
  await supabase.from("message_events").insert({ user_id: contact.user_id, contact_id: contact.id, type: "unsubscribed", metadata: { source: "unsubscribe_link" } });
  return new NextResponse("<main style='font-family:Arial;padding:40px;text-align:center'><h2>You are unsubscribed.</h2><p>You will not receive future campaign emails from this workspace.</p></main>", { headers: { "content-type": "text/html; charset=utf-8" } });
}
