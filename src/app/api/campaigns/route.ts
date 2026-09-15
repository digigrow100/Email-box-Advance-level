import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { boundedText, jsonBody } from "@/lib/validation";

function validTimeZone(value: unknown) {
  const zone = String(value || "America/New_York").slice(0, 100);
  try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(new Date()); return zone; }
  catch { throw new Error("Invalid timezone"); }
}
function validTime(value: unknown, fallback: string) {
  const text = String(value || fallback);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw new Error("Send window must use HH:MM");
  return text;
}

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase.from("campaigns").select("*,mailboxes(email)").eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ campaigns: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load campaigns" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await jsonBody(request, 350_000);
    const name = boundedText(body.name, "Campaign name", 160);
    const mailboxId = boundedText(body.mailboxId, "Mailbox", 100);
    const subject = boundedText(body.subject, "Subject", 998);
    const messageBody = boundedText(body.body, "Body", 250_000);
    const contactIds = Array.isArray(body.contactIds) ? [...new Set(body.contactIds.map(String))].slice(0, 5_000) : [];
    if (!contactIds.length) throw new Error("Select at least one contact");

    const { data: mailbox } = await supabase.from("mailboxes").select("id").eq("id", mailboxId).eq("user_id", user.id).maybeSingle();
    if (!mailbox) return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });

    const templateId: string | null = body.templateId ? String(body.templateId) : null;
    if (templateId) {
      const { data: template } = await supabase.from("templates").select("id").eq("id", templateId).eq("user_id", user.id).maybeSingle();
      if (!template) throw new Error("Template not found");
    }

    const { data: contacts, error: contactsError } = await supabase.from("contacts").select("id,status").eq("user_id", user.id).in("id", contactIds);
    if (contactsError) throw contactsError;
    const eligible = (contacts ?? []).filter((contact: { id: string; status: string }) => contact.status === "active");
    if (!eligible.length) throw new Error("No eligible active contacts selected");

    const start = typeof body.startAt === "string" || typeof body.startAt === "number" ? new Date(body.startAt) : new Date(Date.now() + 60_000);
    if (Number.isNaN(start.getTime()) || start < new Date(Date.now() - 60_000)) throw new Error("Invalid campaign start time");

    const { data: workspace, error: workspaceError } = await supabase.from("workspace_settings")
      .select("default_timezone,default_send_window_start,default_send_window_end")
      .eq("user_id", user.id).maybeSingle();
    if (workspaceError) throw workspaceError;
    const timezone = validTimeZone(body.timezone ?? workspace?.default_timezone ?? "UTC");
    const sendWindowStart = validTime(body.sendWindowStart ?? workspace?.default_send_window_start, "09:00");
    const sendWindowEnd = validTime(body.sendWindowEnd ?? workspace?.default_send_window_end, "17:00");

    const { data: campaign, error } = await supabase.from("campaigns").insert({
      user_id: user.id,
      mailbox_id: mailboxId,
      template_id: templateId,
      name,
      subject,
      body: messageBody,
      status: "scheduled",
      timezone,
      send_window_start: sendWindowStart,
      send_window_end: sendWindowEnd,
    }).select("*").single();
    if (error || !campaign) throw error ?? new Error("Campaign creation failed");

    const spacingMinutes = 4;
    const queueRows = eligible.map((contact: { id: string; status: string }, index: number) => ({
      campaign_id: campaign.id,
      contact_id: contact.id,
      status: "queued",
      scheduled_at: new Date(start.getTime() + index * spacingMinutes * 60_000).toISOString(),
    }));
    const { error: queueError } = await supabase.from("campaign_contacts").insert(queueRows);
    if (queueError) throw queueError;
    return NextResponse.json({ campaign, queued: queueRows.length, suppressed: contactIds.length - eligible.length }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create campaign" }, { status: 400 });
  }
}
