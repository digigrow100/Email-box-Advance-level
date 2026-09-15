import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { boundedInt, boundedText, jsonBody } from "@/lib/validation";

const allowedActions = new Set(["mark_read", "archive", "ai_reply"]);

function validActions(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) throw new Error("Automation needs 1–10 actions");
  return value.map((action: any) => {
    if (!action || typeof action !== "object" || !allowedActions.has(action.type)) throw new Error("Unsupported automation action");
    if (action.type === "ai_reply") {
      const mode = ["off", "draft", "auto_send"].includes(action.mode) ? action.mode : "draft";
      return {
        type: "ai_reply",
        mode,
        delayMinutes: boundedInt(action.delayMinutes, 5, 0, 1440),
        toneProfileId: action.toneProfileId ? String(action.toneProfileId).slice(0, 100) : undefined,
        instructions: action.instructions ? String(action.instructions).slice(0, 4_000) : undefined,
      };
    }
    return { type: action.type };
  });
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await jsonBody<any>(request, 64_000);
    const name = boundedText(body.name, "Name", 120);
    if (body.triggerType !== "inbound_email") throw new Error("Only inbound-email automations are supported in this version");
    const actions = validActions(body.actions);
    const c = body.conditions && typeof body.conditions === "object" ? body.conditions : {};
    const conditions = {
      mailboxId: c.mailboxId ? String(c.mailboxId).slice(0, 100) : undefined,
      fromContains: c.fromContains ? String(c.fromContains).slice(0, 320) : undefined,
      subjectContains: c.subjectContains ? String(c.subjectContains).slice(0, 500) : undefined,
      bodyContains: c.bodyContains ? String(c.bodyContains).slice(0, 1_000) : undefined,
      knownContact: c.knownContact === true,
    };

    if (conditions.mailboxId) {
      const { data: mailbox } = await supabase.from("mailboxes").select("id").eq("id", conditions.mailboxId).eq("user_id", user.id).maybeSingle();
      if (!mailbox) throw new Error("Automation mailbox not found");
    }

    const { data, error } = await supabase.from("automation_rules").insert({
      user_id: user.id,
      name,
      trigger_type: "inbound_email",
      priority: boundedInt(body.priority, 100, 1, 10_000),
      cooldown_minutes: boundedInt(body.cooldownMinutes, 0, 0, 10_080),
      conditions,
      actions,
      enabled: true,
    }).select("id").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, rule: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save automation" }, { status: 400 });
  }
}
