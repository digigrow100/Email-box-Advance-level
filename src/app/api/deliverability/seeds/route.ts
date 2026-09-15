import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { boundedText, jsonBody } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await jsonBody<any>(request, 16_000);
    const mailboxId = boundedText(body.mailboxId, "Mailbox", 100);
    const action = body.action === "remove" ? "remove" : "add";
    const { data: mailbox, error: mailboxError } = await supabase.from("mailboxes").select("id,email,provider").eq("id", mailboxId).eq("user_id", user.id).single();
    if (mailboxError || !mailbox) throw new Error("Mailbox not found");
    if (action === "remove") {
      const { error } = await supabase.from("seed_inboxes").delete().eq("user_id", user.id).eq("mailbox_id", mailbox.id);
      if (error) throw error;
    } else {
      const hint = ["gmail","outlook","yahoo","custom","other"].includes(body.providerHint) ? body.providerHint : mailbox.provider === "gmail" ? "gmail" : "custom";
      const label = boundedText(body.label || mailbox.email, "Label", 120);
      const { error } = await supabase.from("seed_inboxes").upsert({ user_id: user.id, mailbox_id: mailbox.id, label, provider_hint: hint, active: true }, { onConflict: "user_id,mailbox_id" });
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update seed inbox" }, { status: 400 });
  }
}
